// Package runtimes deploys runtime workers to Kubernetes.
//
// Every published channel gets a dedicated worker: a Deployment named channel-<channel ID> in the runtime
// namespace, with one replica. The worker's environment names the plan's storage key and version (see
// libs/engine/workers); everything else it needs comes from the plan. Publishing a new version changes the
// pod template, and the Recreate strategy stops the old worker before the new one starts, which is the
// plan's "replace" publish strategy: the old worker drains its in-flight executions within the
// termination grace period. Unpublishing deletes the Deployment.
//
// Credentials for artifact storage are kept in one Secret (runtime-artifact-storage) that the controller
// applies to the runtime namespace, and Vault credentials, with which workers resolve the secrets of their
// plan's connections, in another (runtime-vault).
package runtimes

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/ongruent/gruent/libs/engine/workers"
)

// Labels of runtime worker objects.
//
// The gruent.com/ keys are stable technical identities, independent of the marketing domain. LabelChannel is
// part of each Deployment's spec.selector, which Kubernetes treats as immutable: changing the key would make
// every apply to an existing worker Deployment fail.
const (
	LabelComponent = "app.kubernetes.io/component"
	LabelManagedBy = "app.kubernetes.io/managed-by"
	LabelChannel   = "gruent.com/channel-id"
	LabelSpace     = "gruent.com/space-id"
	// AnnotationPlanVersion records the plan version a worker runs.
	AnnotationPlanVersion = "gruent.com/plan-version"
	ComponentName         = "runtime-worker"
)

// StorageSecretName is the Secret with the artifact storage credentials of runtime workers.
const StorageSecretName = "runtime-artifact-storage"

// VaultSecretName is the Secret with the Vault credentials of runtime workers.
const VaultSecretName = "runtime-vault"

// Vault is how runtime workers reach Vault to resolve connection secrets. Without an address, workers can
// only hydrate connections without secrets.
type Vault struct {
	Address  string
	Username string
	Password string
}

// Storage is how runtime workers reach artifact storage.
type Storage struct {
	Endpoint        string
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	UseSSL          bool
}

// Config configures runtime workers.
type Config struct {
	Namespace string
	Image     string
	// ImagePullPolicy is e.g. IfNotPresent for images loaded into a local kind cluster.
	ImagePullPolicy string
	Storage         Storage
	Vault           Vault
	// SigningKeyring lists the trusted artifact signing keys: "<key ID>=<base64 public key>,…".
	SigningKeyring string
	NATSURL        string
	OtelEndpoint   string
	Environment    string
	// OverheadMiB is added to the plan's memory budget for the JVM and the runtime itself.
	OverheadMiB int
	// TerminationGraceSeconds bounds how long a replaced or unpublished worker drains executions.
	TerminationGraceSeconds int
}

// Worker is what the controller deploys for a published channel.
type Worker struct {
	ChannelID   string
	SpaceID     string
	PlanVersion string
	PlanKey     string
	MemoryMiB   int
}

// Deployer applies and deletes runtime workers.
type Deployer struct {
	Kube   *KubeClient
	Config Config
}

// DeploymentName returns the name of a channel's worker Deployment. Channel IDs are alphanumeric, but
// object names must be lowercase.
func DeploymentName(channelID string) string {
	return "channel-" + strings.ToLower(channelID)
}

// Deploy applies the channel's worker for the plan version.
func (d *Deployer) Deploy(ctx context.Context, worker Worker) error {
	namespace := d.Config.Namespace
	if err := d.Kube.Apply(ctx, fmt.Sprintf("/api/v1/namespaces/%s/secrets/%s", namespace, StorageSecretName), d.storageSecret()); err != nil {
		return fmt.Errorf("apply artifact storage secret: %w", err)
	}
	if d.Config.Vault.Address != "" {
		if err := d.Kube.Apply(ctx, fmt.Sprintf("/api/v1/namespaces/%s/secrets/%s", namespace, VaultSecretName), d.vaultSecret()); err != nil {
			return fmt.Errorf("apply vault secret: %w", err)
		}
	}
	name := DeploymentName(worker.ChannelID)
	if err := d.Kube.Apply(ctx, fmt.Sprintf("/apis/apps/v1/namespaces/%s/deployments/%s", namespace, name), d.deployment(worker)); err != nil {
		return fmt.Errorf("apply runtime worker: %w", err)
	}
	return nil
}

// Remove deletes the channel's worker. A channel without a worker is not an error.
func (d *Deployer) Remove(ctx context.Context, channelID string) error {
	path := fmt.Sprintf("/apis/apps/v1/namespaces/%s/deployments/%s", d.Config.Namespace, DeploymentName(channelID))
	if err := d.Kube.Delete(ctx, path); err != nil {
		return fmt.Errorf("delete runtime worker: %w", err)
	}
	return nil
}

type object = map[string]any

func (d *Deployer) storageSecret() object {
	return object{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": object{
			"name":      StorageSecretName,
			"namespace": d.Config.Namespace,
			"labels":    object{LabelManagedBy: FieldManager},
		},
		"type": "Opaque",
		"stringData": object{
			workers.EnvStorageAccessKeyID:     d.Config.Storage.AccessKeyID,
			workers.EnvStorageSecretAccessKey: d.Config.Storage.SecretAccessKey,
		},
	}
}

func (d *Deployer) vaultSecret() object {
	return object{
		"apiVersion": "v1",
		"kind":       "Secret",
		"metadata": object{
			"name":      VaultSecretName,
			"namespace": d.Config.Namespace,
			"labels":    object{LabelManagedBy: FieldManager},
		},
		"type": "Opaque",
		"stringData": object{
			workers.EnvVaultUsername: d.Config.Vault.Username,
			workers.EnvVaultPassword: d.Config.Vault.Password,
		},
	}
}

func (d *Deployer) deployment(worker Worker) object {
	name := DeploymentName(worker.ChannelID)
	labels := object{
		LabelComponent: ComponentName,
		LabelManagedBy: FieldManager,
		LabelChannel:   worker.ChannelID,
		LabelSpace:     worker.SpaceID,
	}
	value := func(name, value string) object { return object{"name": name, "value": value} }
	fromSecret := func(name string) object {
		return object{"name": name, "valueFrom": object{"secretKeyRef": object{"name": StorageSecretName, "key": name}}}
	}
	fromVaultSecret := func(name string) object {
		return object{"name": name, "valueFrom": object{"secretKeyRef": object{"name": VaultSecretName, "key": name}}}
	}
	env := []object{
		value(workers.EnvChannelID, worker.ChannelID),
		value(workers.EnvPlanKey, worker.PlanKey),
		value(workers.EnvPlanVersion, worker.PlanVersion),
		value(workers.EnvSigningKeyring, d.Config.SigningKeyring),
		value(workers.EnvStorageEndpoint, d.Config.Storage.Endpoint),
		value(workers.EnvStorageBucket, d.Config.Storage.Bucket),
		value(workers.EnvStorageRegion, d.Config.Storage.Region),
		value(workers.EnvStorageUseSSL, strconv.FormatBool(d.Config.Storage.UseSSL)),
		fromSecret(workers.EnvStorageAccessKeyID),
		fromSecret(workers.EnvStorageSecretAccessKey),
		value(workers.EnvNATSURL, d.Config.NATSURL),
		value(workers.EnvOtelEndpoint, d.Config.OtelEndpoint),
		value(workers.EnvEnvironment, d.Config.Environment),
	}
	if d.Config.Vault.Address != "" {
		env = append(env,
			value(workers.EnvVaultAddress, d.Config.Vault.Address),
			fromVaultSecret(workers.EnvVaultUsername),
			fromVaultSecret(workers.EnvVaultPassword),
		)
	}
	memory := fmt.Sprintf("%dMi", worker.MemoryMiB+d.Config.OverheadMiB)
	pullPolicy := d.Config.ImagePullPolicy
	if pullPolicy == "" {
		pullPolicy = "IfNotPresent"
	}
	return object{
		"apiVersion": "apps/v1",
		"kind":       "Deployment",
		"metadata": object{
			"name":      name,
			"namespace": d.Config.Namespace,
			"labels":    labels,
			"annotations": object{
				AnnotationPlanVersion: worker.PlanVersion,
			},
		},
		"spec": object{
			"replicas": 1,
			"selector": object{"matchLabels": object{LabelChannel: worker.ChannelID, LabelComponent: ComponentName}},
			// Versions never run side by side (publish strategy "replace").
			"strategy": object{"type": "Recreate"},
			"template": object{
				"metadata": object{
					"labels":      labels,
					"annotations": object{AnnotationPlanVersion: worker.PlanVersion},
				},
				"spec": object{
					"terminationGracePeriodSeconds": d.Config.TerminationGraceSeconds,
					"automountServiceAccountToken":  false,
					"containers": []object{{
						"name":            "runtime",
						"image":           d.Config.Image,
						"imagePullPolicy": pullPolicy,
						"env":             env,
						"resources": object{
							"requests": object{"memory": memory},
							"limits":   object{"memory": memory},
						},
					}},
				},
			},
		},
	}
}
