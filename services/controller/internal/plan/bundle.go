package plan

// DependencyBundle holds the dependencies of one plan revision, so that runtimes can hydrate them. The
// plan pins the bundle's version (Plan.Dependencies), which makes the association immutable: a plan
// revision always hydrates exactly this bundle, and a changed dependency produces a new bundle and plan.
//
// # Hydration
//
// A runtime hydrates a plan by verifying and downloading the plan, then its bundle and payload schema
// (see package signing), and then:
//
//   - Models are used as is. Each model's Payload names the payload-schema table generated from it.
//   - Connections are configured from Attributes. Sensitive values are never embedded: each entry of
//     SecretFields names an attribute whose value the runtime resolves from the secret reference, and each
//     entry of CertificateFields names an attribute that refers to a certificate the runtime resolves.
//     Connections with null Attributes have a category whose sensitive fields are not known to the
//     controller; the runtime loads them by ID and must reject them if their revision differs.
//   - Secrets and certificates are resolved when the runtime applies the plan, with the runtime's own
//     credentials, and never written back to storage. Rotating a secret therefore does not change any
//     artifact; re-hydration picks it up. A reference that cannot be resolved fails the deployment, and
//     the runtime reports it as an observed failure.
type DependencyBundle struct {
	APIVersion   string        `json:"apiVersion"`
	Kind         string        `json:"kind"`
	Metadata     Metadata      `json:"metadata"`
	Models       []Model       `json:"models"`
	Connections  []Connection  `json:"connections"`
	Secrets      []Secret      `json:"secrets"`
	Certificates []Certificate `json:"certificates"`
}

// Model is a data model with its attributes. Models describe data, not credentials, so they are
// embedded.
type Model struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Revision   string  `json:"revision"`
	Attributes RawJSON `json:"attributes"`
	// Payload is the payload type generated from the model.
	Payload Payload `json:"payload"`
}

// Connection is a connection the channel uses.
type Connection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
	// Revision changes whenever the connection is updated. It is not derived from the attributes,
	// which can contain credentials.
	Revision string `json:"revision"`
	// Attributes are the connection's attributes with sensitive values removed, or null if the category's
	// sensitive fields are not known.
	Attributes RawJSON `json:"attributes"`
	// SecretFields maps attribute names to the secret reference their value is resolved from.
	SecretFields map[string]string `json:"secretFields"`
	// CertificateFields maps attribute names to the certificate reference their value is resolved from.
	CertificateFields map[string]string `json:"certificateFields"`
}

// Secret is a secret resolved at hydration time. Ref has the form
// "secretref://vault/spaces/<spaceId>#<key>": the key in the space's key-value secrets.
type Secret struct {
	Ref    string   `json:"ref"`
	UsedBy []string `json:"usedBy"`
}

// Certificate is a certificate resolved at hydration time, including any private key. Ref has the form
// "certref://spaces/<spaceId>/certificates/<certificateId>".
type Certificate struct {
	Ref    string   `json:"ref"`
	ID     string   `json:"id"`
	UsedBy []string `json:"usedBy"`
}
