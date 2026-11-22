package compiler

import (
	"testing"
)

func TestParameterize(t *testing.T) {
	statement, parameters, problem := parameterize(`INSERT INTO readings (device, c, note) VALUES ({{input.deviceId}}, {{ input.location.lat }}, 'a {b}') -- {x}
RETURNING {{input.deviceId}}`)
	if problem != "" {
		t.Fatal(problem)
	}
	if want := "INSERT INTO readings (device, c, note) VALUES ($1, $2, 'a {b}') -- {x}\nRETURNING $1"; statement != want {
		t.Fatalf("statement = %q", statement)
	}
	if len(parameters) != 2 || parameters[0] != "deviceId" || parameters[1] != "location.lat" {
		t.Fatalf("parameters = %v", parameters)
	}

	for _, sql := range []string{
		`SELECT '{{input.deviceId}}'`,
		`SELECT * FROM t WHERE a = $1`,
		`SELECT {{input.readings[].token}}`,
		`SELECT {{deviceId}}`,
		`SELECT {{input.deviceId`,
	} {
		if _, _, problem := parameterize(sql); problem == "" {
			t.Errorf("%s: expected a problem", sql)
		}
	}
}

func relationalChannel(statement string) []byte {
	return channel(func(c map[string]any) {
		c["nodes"] = []any{
			httpSource(map[string]any{"modelId": "m1"}),
			libraryNode("n_db", "action", "relational-db", map[string]any{"engine": "POSTGRES_SERVER", "connectionId": "t6", "statement": statement}),
		}
		c["edges"] = []any{
			map[string]any{"id": "e1", "from": map[string]any{"nodeId": "n_src", "ioId": "output"}, "to": map[string]any{"nodeId": "n_db", "ioId": "input"}},
		}
	})
}

func TestCompileRelationalStep(t *testing.T) {
	resolver.connections["t6"] = ConnectionRecord{ID: "t6", Name: "Warehouse", Category: "POSTGRES_SERVER", Revision: "sha256:t6", Attributes: []byte(`{"host": "db", "port": 5432, "database": "iot", "username": "gruent", "password": "PG_PASSWORD"}`)}
	defer delete(resolver.connections, "t6")

	result := compile(t, relationalChannel("INSERT INTO readings VALUES ({{input.deviceId}}, {{input.temperatureC}})"))
	step := planStep(result.Artifacts.Plan, "n_db")
	if want := `{"engine":"POSTGRES_SERVER","parameters":["deviceId","temperatureC"],"statement":"INSERT INTO readings VALUES ($1, $2)"}`; string(step.Compiled) != want {
		t.Fatalf("compiled = %s", step.Compiled)
	}
	connection := result.Artifacts.Bundle.Connections[0]
	if connection.SecretFields["password"] == "" || string(connection.Attributes) == "" || len(result.Artifacts.Bundle.Secrets) != 1 {
		t.Fatalf("the password is not a secret reference: %+v", connection)
	}
	requireProblem(t, problems(t, relationalChannel("SELECT {{input.serial}}")), "unknown_variable")
	requireProblem(t, problems(t, relationalChannel("SELECT '{{input.deviceId}}'")), "invalid_statement")
}
