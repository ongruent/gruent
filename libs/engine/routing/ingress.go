package routing

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// MaxHTTPBodyBytes bounds the request body of an HTTP invocation, so that the invocation fits in a NATS
// message after encoding.
const MaxHTTPBodyBytes = 512 << 10

// Requester sends a message and waits for its reply, e.g. NATS request/reply. It returns an error
// wrapping context.DeadlineExceeded when no reply arrives before ctx expires.
type Requester interface {
	Request(ctx context.Context, subject string, data []byte) ([]byte, error)
}

// Ingress is the HTTP source: it resolves requests through the routing table, publishes an invocation to
// the matching channel, and answers with the runtime's reply. In async mode the runtime replies when it
// admits the execution, and the ingress responds with 202 Accepted; in sync mode the runtime replies when
// the execution finishes.
type Ingress struct {
	Table     *Table
	Requester Requester
	// Now and NewID default to time.Now and NewInvocationID.
	Now   func() time.Time
	NewID func() string
}

// Response headers that are never copied from a reply.
var droppedResponseHeaders = []string{"Connection", "Keep-Alive", "Transfer-Encoding", "Upgrade", "Content-Length"}

func (i *Ingress) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	route, allowed, err := i.Table.MatchHTTP(r.Method, r.URL.Path)
	switch {
	case errors.Is(err, ErrNoRoute):
		writeError(w, http.StatusNotFound, "no published channel serves this path")
		return
	case errors.Is(err, ErrMethodNotAllowed):
		w.Header().Set("Allow", strings.Join(allowed, ", "))
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxHTTPBodyBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "request body is too large")
			return
		}
		writeError(w, http.StatusBadRequest, "could not read request body")
		return
	}

	now, newID := time.Now, NewInvocationID
	if i.Now != nil {
		now = i.Now
	}
	if i.NewID != nil {
		newID = i.NewID
	}
	invocation := HTTPInvocation(route, newID(), now(), r, body)
	message, err := json.Marshal(invocation)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not encode invocation")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(route.Binding.TimeoutMs)*time.Millisecond)
	defer cancel()
	data, err := i.Requester.Request(ctx, route.Binding.Subject, message)
	if errors.Is(err, context.DeadlineExceeded) {
		writeError(w, http.StatusGatewayTimeout, "timed out waiting for the channel to respond")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not invoke the channel")
		return
	}
	var reply Reply
	if err := json.Unmarshal(data, &reply); err != nil {
		writeError(w, http.StatusBadGateway, "the channel sent an invalid reply")
		return
	}

	if reply.Overflow {
		writeError(w, route.Binding.Overflow.HTTPStatus, "the channel is at capacity, retry later")
		return
	}
	if route.Binding.ResponseMode == ResponseModeAsync {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]string{"invocationId": invocation.ID})
		return
	}

	status := reply.Status
	if status == 0 {
		status = http.StatusOK
	}
	if status < 200 || status > 599 {
		writeError(w, http.StatusBadGateway, "the channel replied with an invalid status")
		return
	}
	for name, values := range reply.Headers {
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}
	for _, name := range droppedResponseHeaders {
		w.Header().Del(name)
	}
	w.WriteHeader(status)
	_, _ = w.Write(reply.Body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": nil, "errors": []string{message}})
}
