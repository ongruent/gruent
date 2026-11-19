// Package artifactstore holds the artifact storage and signing clients, which config initializes on
// startup.
package artifactstore

import (
	"github.com/ongruent/gruent/libs/engine/signing"
	"github.com/ongruent/gruent/services/controller/internal/artifacts"
)

// Store is the S3-compatible store that artifacts are uploaded to.
var Store *artifacts.S3Store

// Signer signs uploaded artifacts.
var Signer *signing.Signer
