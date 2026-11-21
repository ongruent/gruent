package runtimes

import (
	"context"
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type recorded struct {
	Method, Path, ContentType string
	Body                      map[string]any
}

func fakeKube(t *testing.T, status int) (*KubeClient, *[]recorded) {
	var mu sync.Mutex
	var requests []recorded
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(data, &body)
		mu.Lock()
		requests = append(requests, recorded{r.Method, r.URL.RequestURI(), r.Header.Get("Content-Type"), body})
		mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(status)
	}))
	t.Cleanup(server.Close)
	return &KubeClient{Server: server.URL, Token: "token", HTTP: server.Client()}, &requests
}

func TestDeployAppliesSecretAndDeployment(t *testing.T) {
	kube, requests := fakeKube(t, http.StatusOK)
	deployer := &Deployer{Kube: kube, Config: Config{
		Namespace: "gruent-runtime", Image: "gruent-runtime:local", Storage: Storage{Endpoint: "minio:8675", Bucket: "b", AccessKeyID: "id", SecretAccessKey: "secret"},
		SigningKeyring: "k=pub", NATSURL: "nats://nats:4222", OverheadMiB: 256, TerminationGraceSeconds: 45,
	}}
	err := deployer.Deploy(context.Background(), Worker{ChannelID: "AbC123", SpaceID: "s1", PlanVersion: "sha256:1", PlanKey: "orgs/o/plan/1.json", MemoryMiB: 128})
	if err != nil {
		t.Fatal(err)
	}
	if len(*requests) != 2 {
		t.Fatalf("expected 2 requests, got %d", len(*requests))
	}
	secret, deployment := (*requests)[0], (*requests)[1]
	if secret.Method != http.MethodPatch || secret.Path != "/api/v1/namespaces/gruent-runtime/secrets/runtime-artifact-storage?fieldManager=gruent-controller&force=true" {
		t.Errorf("unexpected secret request %s %s", secret.Method, secret.Path)
	}
	if deployment.Path != "/apis/apps/v1/namespaces/gruent-runtime/deployments/channel-abc123?fieldManager=gruent-controller&force=true" ||
		deployment.ContentType != "application/apply-patch+yaml" {
		t.Errorf("unexpected deployment request %s %s", deployment.Path, deployment.ContentType)
	}
	encoded, _ := json.Marshal(deployment.Body)
	for _, want := range []string{
		`"type":"Recreate"`, `"memory":"384Mi"`, `"image":"gruent-runtime:local"`,
		`{"name":"GRUENT_PLAN_KEY","value":"orgs/o/plan/1.json"}`, `{"name":"GRUENT_PLAN_VERSION","value":"sha256:1"}`,
		`{"name":"GRUENT_CHANNEL_ID","value":"AbC123"}`, `"secretKeyRef":{"key":"ARTIFACT_STORAGE_SECRET_ACCESS_KEY"`,
	} {
		if !strings.Contains(string(encoded), want) {
			t.Errorf("deployment does not contain %s:\n%s", want, encoded)
		}
	}
	if strings.Contains(string(encoded), `"secret"`) {
		t.Error("the deployment must not contain the storage secret value")
	}
}

func TestRemoveIgnoresMissingDeployments(t *testing.T) {
	kube, requests := fakeKube(t, http.StatusNotFound)
	deployer := &Deployer{Kube: kube, Config: Config{Namespace: "gruent-runtime"}}
	if err := deployer.Remove(context.Background(), "AbC123"); err != nil {
		t.Fatal(err)
	}
	if (*requests)[0].Method != http.MethodDelete || !strings.HasSuffix((*requests)[0].Path, "/deployments/channel-abc123") {
		t.Errorf("unexpected request %+v", (*requests)[0])
	}
}

func TestKubeconfig(t *testing.T) {
	client, err := fromKubeconfig([]byte(`
apiVersion: v1
kind: Config
clusters:
  - name: gruent
    cluster:
      server: https://gruent-control-plane:6443
      insecure-skip-tls-verify: true
users:
  - name: controller
    user:
      token: abc
contexts:
  - name: controller@gruent
    context:
      cluster: gruent
      user: controller
current-context: controller@gruent
`))
	if err != nil {
		t.Fatal(err)
	}
	if client.Server != "https://gruent-control-plane:6443" || client.Token != "abc" {
		t.Errorf("unexpected client %+v", client)
	}
}

// The selector of an existing Deployment is immutable, so its label keys must never change: a different key
// would make every apply to an already deployed worker fail.
func TestDeploymentKeepsStableSelectorAndLabelKeys(t *testing.T) {
	deployer := &Deployer{Config: Config{Namespace: "gruent-runtime"}}
	deployment := deployer.deployment(Worker{ChannelID: "AbC123", SpaceID: "s1", PlanVersion: "sha256:1"})
	encoded, _ := json.Marshal(deployment)
	var decoded struct {
		Metadata struct {
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
		} `json:"metadata"`
		Spec struct {
			Selector struct {
				MatchLabels map[string]string `json:"matchLabels"`
			} `json:"selector"`
			Template struct {
				Metadata struct {
					Labels      map[string]string `json:"labels"`
					Annotations map[string]string `json:"annotations"`
				} `json:"metadata"`
			} `json:"template"`
		} `json:"spec"`
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	wantSelector := map[string]string{"gruent.com/channel-id": "AbC123", "app.kubernetes.io/component": "runtime-worker"}
	if !maps.Equal(decoded.Spec.Selector.MatchLabels, wantSelector) {
		t.Errorf("selector changed: got %v, want %v", decoded.Spec.Selector.MatchLabels, wantSelector)
	}
	for _, labels := range []map[string]string{decoded.Metadata.Labels, decoded.Spec.Template.Metadata.Labels} {
		for key, value := range wantSelector {
			if labels[key] != value {
				t.Errorf("labels %v do not match selector key %s=%s", labels, key, value)
			}
		}
		if labels["gruent.com/space-id"] != "s1" {
			t.Errorf("labels %v lack gruent.com/space-id", labels)
		}
	}
	for _, annotations := range []map[string]string{decoded.Metadata.Annotations, decoded.Spec.Template.Metadata.Annotations} {
		if annotations["gruent.com/plan-version"] != "sha256:1" {
			t.Errorf("annotations %v lack gruent.com/plan-version", annotations)
		}
	}
}
