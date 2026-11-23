package ingress

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/nats-io/nats.go"
	"github.com/ongruent/gruent/libs/engine/routing"
)

// NATSRequester invokes channels with NATS request/reply.
type NATSRequester struct {
	Conn *nats.Conn
}

// Request implements routing.Requester.
func (r NATSRequester) Request(ctx context.Context, subject string, data []byte) ([]byte, error) {
	message, err := r.Conn.RequestWithContext(ctx, subject, data)
	switch {
	case err == nil:
		return message.Data, nil
	case errors.Is(err, nats.ErrNoResponders):
		return nil, fmt.Errorf("request %s: %w", subject, routing.ErrNoResponders)
	case errors.Is(err, nats.ErrTimeout), errors.Is(err, context.DeadlineExceeded):
		return nil, fmt.Errorf("request %s: %w", subject, context.DeadlineExceeded)
	default:
		return nil, fmt.Errorf("request %s: %w", subject, err)
	}
}

// S3Reader reads the routing table from an S3-compatible bucket.
type S3Reader struct {
	Client *minio.Client
	Bucket string
}

// List implements routing.Reader.
func (r *S3Reader) List(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	for object := range r.Client.ListObjects(ctx, r.Bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
		if object.Err != nil {
			return nil, object.Err
		}
		keys = append(keys, object.Key)
	}
	return keys, nil
}

// Get implements routing.Reader.
func (r *S3Reader) Get(ctx context.Context, key string) ([]byte, error) {
	object, err := r.Client.GetObject(ctx, r.Bucket, key, minio.GetObjectOptions{})
	if err == nil {
		defer object.Close()
		var data []byte
		if data, err = io.ReadAll(object); err == nil {
			return data, nil
		}
	}
	if minio.ToErrorResponse(err).Code == "NoSuchKey" {
		return nil, fmt.Errorf("%s: %w", key, routing.ErrObjectNotFound)
	}
	return nil, fmt.Errorf("get %s: %w", key, err)
}
