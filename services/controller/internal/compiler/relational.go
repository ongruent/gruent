package compiler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/ongruent/gruent/services/controller/internal/plan"
	"github.com/ongruent/gruent/services/controller/internal/types"
)

// relationalVariable is an input value placeholder of a statement, e.g. input.device.id.
var relationalVariable = regexp.MustCompile(`^input(?:\[\])?(?:\.[^.\s\[\]]+(?:\[\])?)*$`)

// variablePath returns the path of a variable relative to the input: "input.a.b" -> "a.b", "input" -> "".
func variablePath(variable string) string {
	return strings.TrimPrefix(strings.TrimPrefix(variable, "input"), ".")
}

const pluginRelationalDB = "relational-db"

// relationalCompiled is the plan step's compiled data of relational-db@1: the statement with every
// {{input.*}} placeholder replaced by a bound parameter in the engine's syntax ($1, $2, ... for Postgres),
// and the input value of each parameter, relative to the input ("" is the whole input).
type relationalCompiled struct {
	Engine     string   `json:"engine"`
	Statement  string   `json:"statement"`
	Parameters []string `json:"parameters"`
}

// compileRelational turns the templated statement into a parameterized statement. Input values are never
// spliced into SQL text: each placeholder becomes a bound parameter, so the values cannot change the
// statement. Placeholders inside quoted SQL text or comments are rejected, since they would not be bound.
func (c *compilation) compileRelational(step *plan.Step, input *types.Type) error {
	var config struct {
		Engine    string `json:"engine"`
		Statement string `json:"statement"`
	}
	if err := json.Unmarshal(step.Config, &config); err != nil {
		return fmt.Errorf("decode configuration of step %s: %w", step.ID, err)
	}

	statement, parameters, problem := parameterize(config.Statement)
	if problem != "" {
		c.errorf("invalid_statement", step.ID, "/config/statement", "the statement of step %s: %s", step.ID, problem)
		return nil
	}

	if input != nil {
		switch input.Kind {
		case types.KindSignal, types.KindBytes:
			if len(parameters) > 0 {
				c.warnf("statement_untyped_input", step.ID, "/config/statement", "the input of step %s has no model, so its values cannot be checked", step.ID)
			}
		default:
			known := types.Variables(*input)
			for _, parameter := range parameters {
				variable := "input" + prefixed(parameter)
				index := slices.IndexFunc(known, func(v types.Variable) bool { return v.Path == variable })
				if index < 0 {
					c.errorf("unknown_variable", step.ID, "/config/statement", "%s is not part of the input of step %s", variable, step.ID)
				}
			}
		}
	}

	compiled, err := plan.Canonicalize(mustMarshal(relationalCompiled{Engine: config.Engine, Statement: statement, Parameters: parameters}))
	if err != nil {
		return err
	}
	step.Compiled = compiled
	return nil
}

// parameterize replaces {{input.*}} placeholders with Postgres parameters ($1, $2, ...). The same input
// value reuses its parameter. It tracks SQL quoting so that placeholders in string literals, quoted
// identifiers and comments are reported instead of silently left as text.
func parameterize(sql string) (string, []string, string) {
	var out strings.Builder
	var parameters []string
	const (
		code = iota
		single
		double
		lineComment
		blockComment
	)
	state := code
	for i := 0; i < len(sql); i++ {
		ch := sql[i]
		if strings.HasPrefix(sql[i:], "{{") {
			end := strings.Index(sql[i:], "}}")
			if end < 0 {
				return "", nil, "a {{ has no closing }}"
			}
			variable := strings.TrimSpace(sql[i+2 : i+end])
			if state != code {
				return "", nil, fmt.Sprintf("{{%s}} is inside quotes or a comment; write it without quotes, it is sent as a bound parameter", variable)
			}
			if !relationalVariable.MatchString(variable) || strings.Contains(variable, "[]") {
				return "", nil, fmt.Sprintf("{{%s}} is not a single input value such as {{input.device.id}}", variable)
			}
			path := variablePath(variable)
			index := slices.Index(parameters, path)
			if index < 0 {
				parameters = append(parameters, path)
				index = len(parameters) - 1
			}
			fmt.Fprintf(&out, "$%d", index+1)
			i += end + 1
			continue
		}
		switch state {
		case code:
			switch {
			case ch == '\'':
				state = single
			case ch == '"':
				state = double
			case strings.HasPrefix(sql[i:], "--"):
				state = lineComment
			case strings.HasPrefix(sql[i:], "/*"):
				state = blockComment
			case ch == '$' && i+1 < len(sql) && (sql[i+1] == '$' || sql[i+1] >= '0' && sql[i+1] <= '9'):
				// Positional parameters and dollar quoting would collide with the bound parameters.
				return "", nil, "write input values as {{input.*}} instead of $ parameters or dollar-quoted text"
			}
		case single:
			if ch == '\'' {
				state = code
			}
		case double:
			if ch == '"' {
				state = code
			}
		case lineComment:
			if ch == '\n' {
				state = code
			}
		case blockComment:
			if strings.HasPrefix(sql[i:], "*/") {
				out.WriteString("*/")
				i++
				state = code
				continue
			}
		}
		out.WriteByte(ch)
	}
	if parameters == nil {
		parameters = []string{}
	}
	return out.String(), parameters, ""
}
