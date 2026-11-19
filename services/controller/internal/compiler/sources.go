package compiler

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"

	"github.com/ongruent/gruent/libs/engine/routing"
	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/robfig/cron/v3"
)

// Supported HTTP methods of HTTP sources.
var httpMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}

// Bounds of an HTTP source's response timeout, in seconds.
const (
	minHTTPResponseTimeout = 1
	maxHTTPResponseTimeout = 30
)

// asyncAdmissionTimeoutMs bounds how long an asynchronous HTTP source waits for a runtime to admit an
// execution before responding 504.
const asyncAdmissionTimeoutMs = 5000

// cronParser accepts standard five-field expressions, an optional leading seconds field, and descriptors
// such as @hourly, matching the legacy timer source.
var cronParser = cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)

// Source kinds, independent of whether a source was created from the step library.
const (
	sourceHTTP         = "http"
	sourceTimer        = "timer"
	sourceMessageQueue = "message_queue"
)

type sourceStep struct {
	step    plan.Step
	node    nodeConfig
	library *libraryStep
}

// kind returns the source kind of a library or legacy source step, or "" if it is not supported.
func (s sourceStep) kind() string {
	if s.library != nil {
		switch {
		case s.library.is(pluginHTTPSource, 1):
			return sourceHTTP
		case s.library.is(pluginTimerSource, 1):
			return sourceTimer
		case s.library.is(pluginMessageQueueSource, 1):
			return sourceMessageQueue
		}
		return ""
	}
	switch s.node.Metadata.Label {
	case "http":
		return sourceHTTP
	case "timer":
		return sourceTimer
	}
	return ""
}

// bindings compiles source steps into bindings. A source type is only supported once its overflow
// handling is defined, so that admission is bounded for every source. Every binding publishes its
// invocations to the channel's invocation subject.
func (c *compilation) bindings(sources []sourceStep) plan.Bindings {
	bindings := plan.Bindings{HTTP: []plan.HTTPBinding{}, Timer: []plan.TimerBinding{}, MessageQueue: []plan.MessageQueueBinding{}}
	subject := routing.InvocationSubject(c.input.ChannelID)

	for _, source := range sources {
		step := source.step
		kind := source.kind()
		if kind == "" {
			c.errorf("unsupported_source", step.ID, "", "source type %s is not supported yet: its handling of excess work is not defined", step.Type)
			continue
		}
		// Schema violations of library sources are already reported at their fields.
		if source.library != nil && !source.library.valid {
			continue
		}
		config := source.node.Metadata.Config

		switch kind {
		case sourceHTTP:
			var cfg httpSourceConfig
			if err := json.Unmarshal(config, &cfg); err != nil {
				c.errorf("invalid_step_config", step.ID, "/config", "HTTP source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			if !slices.Contains(httpMethods, cfg.Method) {
				c.errorf("invalid_http_method", step.ID, "/config/method", "HTTP source %s has an unsupported method %q", step.ID, cfg.Method)
			}
			if cfg.ResponseMode == "" {
				cfg.ResponseMode = routing.ResponseModeSync
			}
			timeoutMs := cfg.ResponseTimeout * 1000
			switch cfg.ResponseMode {
			case routing.ResponseModeSync:
				if cfg.ResponseTimeout < minHTTPResponseTimeout || cfg.ResponseTimeout > maxHTTPResponseTimeout {
					c.errorf("invalid_http_timeout", step.ID, "/config/responseTimeout", "HTTP source %s response timeout must be between %d and %d seconds", step.ID, minHTTPResponseTimeout, maxHTTPResponseTimeout)
				}
			case routing.ResponseModeAsync:
				timeoutMs = asyncAdmissionTimeoutMs
			default:
				c.errorf("invalid_http_response_mode", step.ID, "/config/responseMode", "HTTP source %s has an unsupported response mode %q", step.ID, cfg.ResponseMode)
			}
			bindings.HTTP = append(bindings.HTTP, plan.HTTPBinding{
				BindingID:      step.BindingRef,
				StepID:         step.ID,
				Method:         cfg.Method,
				Path:           routing.HTTPPath(c.input.ChannelID),
				ResponseMode:   cfg.ResponseMode,
				TimeoutMs:      timeoutMs,
				Subject:        subject,
				InputModelRefs: step.ModelRefs,
				// 429 Too Many Requests tells clients that they can retry later.
				Overflow: plan.Overflow{Action: plan.OverflowReject, HTTPStatus: 429},
			})
		case sourceTimer:
			var cfg timerSourceConfig
			if err := json.Unmarshal(config, &cfg); err != nil {
				c.errorf("invalid_step_config", step.ID, "/config", "timer source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			expression := strings.TrimSpace(cfg.CronExpression)
			switch {
			case expression == "":
				c.errorf("missing_cron_expression", step.ID, "/config/cronExpression", "timer source %s has no cron expression", step.ID)
			case strings.HasPrefix(expression, "TZ=") || strings.HasPrefix(expression, "CRON_TZ="):
				c.errorf("invalid_cron_expression", step.ID, "/config/cronExpression", "timer source %s: schedules are evaluated in UTC and cannot set a time zone", step.ID)
			default:
				if _, err := cronParser.Parse(expression); err != nil {
					c.errorf("invalid_cron_expression", step.ID, "/config/cronExpression", "timer source %s has an invalid cron expression: %v", step.ID, err)
				}
			}
			bindings.Timer = append(bindings.Timer, plan.TimerBinding{
				BindingID:      step.BindingRef,
				StepID:         step.ID,
				CronExpression: expression,
				Subject:        subject,
				InputModelRefs: step.ModelRefs,
				// A tick that arrives while the channel is saturated is dropped rather than queued
				// without bound; the next tick runs as scheduled.
				Overflow: plan.Overflow{Action: plan.OverflowSkip},
			})
		case sourceMessageQueue:
			var cfg messageQueueSourceConfig
			if err := json.Unmarshal(config, &cfg); err != nil {
				c.errorf("invalid_step_config", step.ID, "/config", "message queue source %s has an invalid configuration: %v", step.ID, err)
				continue
			}
			c.checkTopic(step.ID, cfg.Broker, cfg.Topic)
			bindings.MessageQueue = append(bindings.MessageQueue, plan.MessageQueueBinding{
				BindingID:      step.BindingRef,
				StepID:         step.ID,
				Broker:         cfg.Broker,
				ConnectionRef:  cfg.ConnectionID,
				Topic:          cfg.Topic,
				Subject:        subject,
				InputModelRefs: step.ModelRefs,
				// Consumption pauses while the channel is saturated, so messages wait in the broker
				// instead of being dropped or buffered without bound.
				Overflow: plan.Overflow{Action: plan.OverflowPause},
			})
		}
	}

	return bindings
}

var (
	kafkaTopic = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,249}$`)
	natsToken  = regexp.MustCompile(`^[^\s.*>]+$`)
)

// checkTopic validates a topic for its broker: Kafka topic names, or NATS subjects with wildcards.
func (c *compilation) checkTopic(stepID, broker, topic string) {
	switch broker {
	case routing.BrokerKafka:
		if !kafkaTopic.MatchString(topic) || topic == "." || topic == ".." {
			c.errorf("invalid_topic", stepID, "/config/topic", "message queue source %s: %q is not a valid Kafka topic", stepID, topic)
		}
	case routing.BrokerNATS:
		tokens := strings.Split(topic, ".")
		for i, token := range tokens {
			if token == "*" || (token == ">" && i == len(tokens)-1) || natsToken.MatchString(token) {
				continue
			}
			c.errorf("invalid_topic", stepID, "/config/topic", "message queue source %s: %q is not a valid NATS subject", stepID, topic)
			return
		}
	default:
		c.errorf("unsupported_broker", stepID, "/config/broker", "message queue source %s has an unsupported broker %q", stepID, broker)
	}
}

// checkSourceConnections checks that message queue sources consume with a connection of their broker's
// category. Missing connections are already reported by resolveConnections.
func (c *compilation) checkSourceConnections(bindings plan.Bindings, connections []plan.Connection) {
	for _, binding := range bindings.MessageQueue {
		index := slices.IndexFunc(connections, func(connection plan.Connection) bool { return connection.ID == binding.ConnectionRef })
		if index < 0 {
			continue
		}
		if category := connections[index].Category; category != binding.Broker {
			c.errorf("connection_category_mismatch", binding.StepID, "/config/connectionId", "message queue source %s needs a %s connection, but %s is a %s connection", binding.StepID, binding.Broker, binding.ConnectionRef, category)
		}
	}
}
