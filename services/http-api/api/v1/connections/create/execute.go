package connectionsCreate

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	sqldb "github.com/ongruent/gruent/db/sqlc"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/certificates"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"

	mqttPolicies "github.com/ongruent/gruent/libs/http/policies"
	"github.com/ongruent/gruent/libs/id"
	"github.com/ongruent/gruent/libs/secrets"
	"github.com/ongruent/gruent/services/http-api/config"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.Name", request.Input.Name),
		attribute.String("request.Input.Category", string(request.Input.Category)),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	output := Output{
		Connection: nil,
	}

	connectionId, err := id.Generator.NewConnectionId()
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "generate_id"),
			attribute.String("error.message", fmt.Sprintf("error generating a new Connection ID: %s", err)),
		)
		return nil, err
	}

	switch request.Input.Category {
	case things.HttpServerThingCategory:
		connection, err := handleCreateHttpServer(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.MqttBrokerThingCategory:
		connection, err := handleCreateMqttBroker(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.MqttClientThingCategory:
		connection, err := handleCreateMqttClient(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.KafkaClusterThingCategory:
		connection, err := handleCreateKafkaCluster(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.KafkaProducerThingCategory:
		connection, err := handleCreateKafkaProducer(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.KafkaConsumerThingCategory:
		connection, err := handleCreateKafkaConsumer(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.NatsServerThingCategory:
		connection, err := handleCreateNatsServer(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.NatsClientThingCategory:
		connection, err := handleCreateNatsClient(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.S3BucketThingCategory:
		connection, err := handleCreateS3Bucket(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.MinioBucketThingCategory:
		connection, err := handleCreateMinioBucket(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	case things.InfluxDbDatabaseThingCategory:
		connection, err := handleCreateInfluxDbDatabase(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.ClickhouseDatabaseThingCategory:
		connection, err := handleCreateClickhouseDatabase(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	case things.AwsSESThingCategory:
		connection, err := handleCreateAwsSES(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	case things.AwsSNSThingCategory:
		connection, err := handleCreateAwsSNS(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	case things.SendgridClientThingCategory:
		connection, err := handleCreateSendgridClient(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	case things.PostgresServerThingCategory:
		connection, err := handleCreatePostgresServer(request, *connectionId)
		if err != nil {
			return nil, err
		}

		output.Connection = connection
	case things.MongoDbServerThingCategory:
		connection, err := handleCreateMongoDbServer(request, *connectionId)
		if err != nil {
			return nil, err
		}
		output.Connection = connection
	default:
		response := gruenthttp.NewErrorResponse([]any{
			"Invalid category.",
		})

		responseBody, _ := response.MarshalJson()
		return nil, fiber.NewError(fiber.StatusBadRequest, string(responseBody))
	}

	return &output, nil
}

func handleCreateMqttClient(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	mqttClient, err := things.NewMqttClientFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Request a new certificate
	certRequest := secrets.CertRequest{
		CommonName: "localhost",
		AltNames:   "localhost,emqx,emqx-mqtts.services.svc.cluster.local,mqtts.gruent.io",
		IpSans:     "127.0.0.1",
		Ttl:        "8760h",
		KeyType:    "ec",
		KeyBits:    256,
	}
	serialNumber, _, _, err := config.SecretsClient.CreateCert(certRequest)
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "create_certificate"),
			attribute.String("error.message", fmt.Sprintf("error creating certificate: %s", err)),
		)
		return nil, fmt.Errorf("error creating certificate: %s", err)
	}

	// Insert certificate into the database
	defaultPolicy := mqttPolicies.Policy{
		AllowedSubscriptionTopics: []string{},
		AllowedPublishTopics:      []string{},
	}
	defaultPolicyJson, _ := json.Marshal(defaultPolicy)

	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Create certificate")
	certificate, err := sqlc.Queries.CreateCertificate(dbCtx, serialNumber, request.Input.Name, defaultPolicyJson, request.Input.SpaceId)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error inserting certificate into the database: %s", err)),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.SetAttributes(attribute.String("certificateId", certificate.ID))
	dbSpan.End()

	// Check if the MQTT Broker Connection exists
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Check MQTT Broker existence")
	_, err = sqlc.Queries.GetConnection(dbCtx, mqttClient.Broker.(string))
	if err != nil {
		if err == pgx.ErrNoRows {
			err = fmt.Errorf("no MQTT broker found with ID %s", mqttClient.Broker.(string))
		}
		errMessage := fmt.Sprintf("error getting requested MQTT broker: %s", err)
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", errMessage),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	// Add certificate to attributes
	mqttClient.CertificateId = certificate.ID

	// Create a new Connection
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     mqttClient,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateMqttBroker(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	mqttBroker, err := things.NewMqttBrokerFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Add the CA certificate
	// TODO: support external MQTTS brokers
	certificate, err := config.SecretsClient.RetrieveRootCaCert()
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "secret_client"),
			attribute.String("error.message", err.Error()),
		)
		return nil, fiber.NewError(500, err.Error())
	}

	mqttBroker.CaCert = certificates.CaCert{
		CaCertPem: *certificate,
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     mqttBroker,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateHttpServer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	httpServer, err := things.NewHttpServerFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     httpServer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateKafkaCluster(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	kafkaCluster, err := things.NewKafkaClusterFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     kafkaCluster,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateKafkaProducer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	kafkaProducer, err := things.NewKafkaProducerFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     kafkaProducer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateKafkaConsumer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	kafkaConsumer, err := things.NewKafkaConsumerFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     kafkaConsumer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateNatsServer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	natsServer, err := things.NewNatsServerFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     natsServer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateNatsClient(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	natsClient, err := things.NewNatsClientFromAttributes(request.Input.Attributes)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     natsClient,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateS3Bucket(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	s3Bucket, err := things.NewS3BucketFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     s3Bucket,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateMinioBucket(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	minioBucket, err := things.NewMinioBucketFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     minioBucket,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateInfluxDbDatabase(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	influxDbDatabase, err := things.NewInfluxDbDatabaseFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     influxDbDatabase,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateClickhouseDatabase(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	clickhouseDatabase, err := things.NewClickhouseDatabaseFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     clickhouseDatabase,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateAwsSES(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	awsSES, err := things.NewAwsSESFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     awsSES,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateAwsSNS(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	awsSNS, err := things.NewAwsSNSFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     awsSNS,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateSendgridClient(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	sendgridClient, err := things.NewSendgridClientFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     sendgridClient,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreateMongoDbServer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes
	mongoDbServer, err := things.NewMongoDbServerFromAttributes(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	err = handleCreateAttributesError(request, err)
	if err != nil {
		return nil, err
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     mongoDbServer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

func handleCreatePostgresServer(request *gruenthttp.Request[Input], connectionId string) (*sqldb.AppConnection, error) {
	// Create attributes. The password stays the secret's name: the controller bundles it as a secret
	// reference for the runtime, so only check that the secret exists.
	postgresServer, err := things.NewPostgresServerForSpace(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	if _, ok := err.(validator.ValidationErrors); ok {
		return nil, handleCreateAttributesError(request, err)
	}
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "validation"),
			attribute.String("error.message", err.Error()),
		)
		response := gruenthttp.NewErrorResponse([]any{err.Error()})
		responseJson, _ := response.MarshalJson()
		return nil, fiber.NewError(fiber.StatusBadRequest, string(responseJson))
	}

	// Create a new Connection
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert connection")
	connection, err := insertConnectionIntoDatabase(dbCtx, insertConnectionIntoDatabaseParams{
		SpaceId:        request.Input.SpaceId,
		ConnectionId:   connectionId,
		ConnectionName: request.Input.Name,
		ActorId:        request.GetActorId(),
		Attributes:     postgresServer,
	})
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	return connection, nil
}

type insertConnectionIntoDatabaseParams struct {
	SpaceId        string
	ConnectionId   string
	ConnectionName string
	ActorId        string
	Attributes     things.Attributes
}

func insertConnectionIntoDatabase(ctx context.Context, params insertConnectionIntoDatabaseParams) (*sqldb.AppConnection, error) {
	jsonAttributes, err := params.Attributes.MarshalJson()
	if err != nil {
		return nil, err
	}

	dbCtx, dbSpan := otel.Tracer("sqlc").Start(ctx, "Insert connection")
	connection, err := sqlc.Queries.CreateConnection(dbCtx, sqldb.CreateConnectionParams{
		ID:                 params.ConnectionId,
		Name:               params.ConnectionName,
		SpaceID:            params.SpaceId,
		Attributes:         jsonAttributes,
		Internal:           false,
		ConnectionCategory: params.Attributes.Category().String(),
		CreatedBy:          params.ActorId,
		UpdatedBy:          params.ActorId,
	})
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error inserting connection into the database: %s", err)),
		)
		dbSpan.End()
		return nil, err
	}

	return &connection, nil
}

func handleCreateAttributesError(request *gruenthttp.Request[Input], err error) error {
	if err != nil {
		if err, ok := err.(validator.ValidationErrors); ok {
			request.Span.SetAttributes(attribute.String("validationError", err.Error()))
			validationError := gruenthttp.NewGruentValidationError(err)
			response := validationError.MarshalResponse()
			responseJson, err := response.MarshalJson()
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, err.Error())
			}
			return fiber.NewError(fiber.StatusBadRequest, string(responseJson))
		}
		request.Span.SetAttributes(
			attribute.String("error.type", "validation"),
			attribute.String("error.message", err.Error()),
		)
		return err
	}

	return nil
}
