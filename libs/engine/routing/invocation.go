package routing

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

// Invocation is the message a source service publishes to a binding's Subject to start one execution of
// a channel. Runtimes reject invocations whose PlanVersion they are not serving.
type Invocation struct {
	APIVersion  string   `json:"apiVersion"`
	Kind        string   `json:"kind"`
	ID          string   `json:"id"`
	Metadata    Metadata `json:"metadata"`
	PlanVersion string   `json:"planVersion"`
	BindingID   string   `json:"bindingId"`
	StepID      string   `json:"stepId"`
	// Trigger is TriggerHTTP, TriggerTimer or TriggerMessageQueue.
	Trigger    string    `json:"trigger"`
	ReceivedAt time.Time `json:"receivedAt"`
	// ContentType and Payload are the trigger's data: an HTTP request body or a message. Timer
	// invocations have no payload.
	ContentType string `json:"contentType,omitempty"`
	Payload     []byte `json:"payload,omitempty"`
	// HTTP describes the request of an HTTP invocation.
	HTTP *HTTPRequest `json:"http,omitempty"`
	// MessageQueue describes the message of a message queue invocation.
	MessageQueue *Message `json:"messageQueue,omitempty"`
	// Reply is set when the source waits for a Reply on the message's reply subject.
	Reply *ReplyPolicy `json:"reply,omitempty"`
}

// HTTPRequest is the request that triggered an HTTP invocation. Credentials are never forwarded.
type HTTPRequest struct {
	Method  string      `json:"method"`
	Path    string      `json:"path"`
	Query   string      `json:"query,omitempty"`
	Headers http.Header `json:"headers,omitempty"`
}

// Message is the message that triggered a message queue invocation.
type Message struct {
	Broker string `json:"broker"`
	Topic  string `json:"topic"`
}

// ReplyPolicy tells the runtime when to reply: once the execution finished (ResponseModeSync), or once it
// was admitted (ResponseModeAsync). The source stops waiting after TimeoutMs.
type ReplyPolicy struct {
	Mode      string `json:"mode"`
	TimeoutMs int64  `json:"timeoutMs"`
}

// Reply is a runtime's answer to an invocation with a ReplyPolicy.
type Reply struct {
	// Overflow means that the channel had no execution slot or queue space, so the invocation was not
	// admitted. The source applies the binding's Overflow handling.
	Overflow bool `json:"overflow,omitempty"`
	// Status, Headers and Body are the HTTP response of a sync invocation, e.g. set by an HTTP response
	// step. A zero status means 200.
	Status  int         `json:"status,omitempty"`
	Headers http.Header `json:"headers,omitempty"`
	Body    []byte      `json:"body,omitempty"`
}

// NewInvocationID returns a random invocation ID.
func NewInvocationID() string {
	var id [16]byte
	_, _ = rand.Read(id[:]) // crypto/rand.Read never returns an error
	return hex.EncodeToString(id[:])
}

func newInvocation[B any](r Route[B], id, trigger, bindingID, stepID string, at time.Time) Invocation {
	return Invocation{
		APIVersion:  APIVersion,
		Kind:        KindInvocation,
		ID:          id,
		Metadata:    r.Metadata,
		PlanVersion: r.PlanVersion,
		BindingID:   bindingID,
		StepID:      stepID,
		Trigger:     trigger,
		ReceivedAt:  at.UTC(),
	}
}

// TimerInvocation returns the invocation for a timer tick. Timers don't wait for a reply.
func TimerInvocation(r TimerRoute, id string, firedAt time.Time) Invocation {
	return newInvocation(r, id, TriggerTimer, r.Binding.BindingID, r.Binding.StepID, firedAt)
}

// MessageInvocation returns the invocation for a consumed message.
func MessageInvocation(r SubscriptionRoute, id string, receivedAt time.Time, contentType string, payload []byte) Invocation {
	invocation := newInvocation(r, id, TriggerMessageQueue, r.Binding.BindingID, r.Binding.StepID, receivedAt)
	invocation.ContentType = contentType
	invocation.Payload = payload
	invocation.MessageQueue = &Message{Broker: r.Binding.Broker, Topic: r.Binding.Topic}
	return invocation
}

// HTTPInvocation returns the invocation for an HTTP request. Its reply policy follows the binding's
// response mode.
func HTTPInvocation(r HTTPRoute, id string, receivedAt time.Time, request *http.Request, body []byte) Invocation {
	invocation := newInvocation(r, id, TriggerHTTP, r.Binding.BindingID, r.Binding.StepID, receivedAt)
	invocation.ContentType = request.Header.Get("Content-Type")
	invocation.Payload = body
	invocation.HTTP = &HTTPRequest{
		Method:  request.Method,
		Path:    request.URL.Path,
		Query:   request.URL.RawQuery,
		Headers: forwardedHeaders(request.Header),
	}
	invocation.Reply = &ReplyPolicy{Mode: r.Binding.ResponseMode, TimeoutMs: r.Binding.TimeoutMs}
	return invocation
}

// Request headers that are never forwarded to runtimes: credentials of the caller and hop-by-hop headers.
var droppedRequestHeaders = []string{
	"Authorization", "Cookie", "Proxy-Authorization",
	"Connection", "Keep-Alive", "Proxy-Connection", "Te", "Trailer", "Transfer-Encoding", "Upgrade",
}

func forwardedHeaders(header http.Header) http.Header {
	forwarded := header.Clone()
	for _, name := range droppedRequestHeaders {
		forwarded.Del(name)
	}
	if len(forwarded) == 0 {
		return nil
	}
	return forwarded
}
