package runtimes

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// KubeClient is a minimal Kubernetes API client: server-side apply and delete of namespaced objects. The
// controller only manages a few object kinds, so it doesn't depend on client-go.
type KubeClient struct {
	Server string
	Token  string
	HTTP   *http.Client
}

// FieldManager owns the fields the controller applies.
const FieldManager = "gruent-controller"

// Apply creates or updates an object with server-side apply. path is the object's API path, e.g.
// /apis/apps/v1/namespaces/<ns>/deployments/<name>.
func (c *KubeClient) Apply(ctx context.Context, path string, object any) error {
	body, err := json.Marshal(object)
	if err != nil {
		return err
	}
	// JSON is valid YAML, so it can be sent as an apply patch.
	_, err = c.do(ctx, http.MethodPatch, path+"?fieldManager="+FieldManager+"&force=true", "application/apply-patch+yaml", body)
	return err
}

// Delete deletes an object. A missing object is not an error.
func (c *KubeClient) Delete(ctx context.Context, path string) error {
	status, err := c.do(ctx, http.MethodDelete, path, "application/json", []byte(`{"propagationPolicy":"Foreground"}`))
	if status == http.StatusNotFound {
		return nil
	}
	return err
}

func (c *KubeClient) do(ctx context.Context, method, path, contentType string, body []byte) (int, error) {
	request, err := http.NewRequestWithContext(ctx, method, c.Server+path, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Accept", "application/json")
	if c.Token != "" {
		request.Header.Set("Authorization", "Bearer "+c.Token)
	}
	response, err := c.HTTP.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if response.StatusCode >= 300 {
		return response.StatusCode, fmt.Errorf("kubernetes %s %s: %s: %s", method, path, response.Status, bytes.TrimSpace(data))
	}
	return response.StatusCode, nil
}

// Paths of the in-cluster service account credentials.
const (
	serviceAccountDir = "/var/run/secrets/kubernetes.io/serviceaccount"
)

// NewKubeClient returns a client from the kubeconfig at path (the current context, with token
// authentication), or from the in-cluster service account when path is empty.
func NewKubeClient(path string) (*KubeClient, error) {
	if path == "" {
		return inCluster()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return fromKubeconfig(data)
}

type kubeconfig struct {
	CurrentContext string `yaml:"current-context"`
	Clusters       []struct {
		Name    string `yaml:"name"`
		Cluster struct {
			Server                   string `yaml:"server"`
			CertificateAuthorityData string `yaml:"certificate-authority-data"`
			InsecureSkipTLSVerify    bool   `yaml:"insecure-skip-tls-verify"`
		} `yaml:"cluster"`
	} `yaml:"clusters"`
	Users []struct {
		Name string `yaml:"name"`
		User struct {
			Token string `yaml:"token"`
		} `yaml:"user"`
	} `yaml:"users"`
	Contexts []struct {
		Name    string `yaml:"name"`
		Context struct {
			Cluster string `yaml:"cluster"`
			User    string `yaml:"user"`
		} `yaml:"context"`
	} `yaml:"contexts"`
}

func fromKubeconfig(data []byte) (*KubeClient, error) {
	var config kubeconfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parse kubeconfig: %w", err)
	}
	var clusterName, userName string
	for _, c := range config.Contexts {
		if c.Name == config.CurrentContext {
			clusterName, userName = c.Context.Cluster, c.Context.User
		}
	}
	if clusterName == "" {
		return nil, fmt.Errorf("kubeconfig has no context %q", config.CurrentContext)
	}
	client := &KubeClient{}
	var ca []byte
	insecure := false
	for _, c := range config.Clusters {
		if c.Name == clusterName {
			client.Server = c.Cluster.Server
			insecure = c.Cluster.InsecureSkipTLSVerify
			if c.Cluster.CertificateAuthorityData != "" {
				decoded, err := base64.StdEncoding.DecodeString(c.Cluster.CertificateAuthorityData)
				if err != nil {
					return nil, fmt.Errorf("decode certificate authority: %w", err)
				}
				ca = decoded
			}
		}
	}
	for _, u := range config.Users {
		if u.Name == userName {
			client.Token = u.User.Token
		}
	}
	if client.Server == "" {
		return nil, fmt.Errorf("kubeconfig has no cluster %q", clusterName)
	}
	httpClient, err := tlsClient(ca, insecure)
	if err != nil {
		return nil, err
	}
	client.HTTP = httpClient
	return client, nil
}

func inCluster() (*KubeClient, error) {
	host, port := os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return nil, errors.New("not running in a Kubernetes cluster and no kubeconfig is set")
	}
	token, err := os.ReadFile(serviceAccountDir + "/token")
	if err != nil {
		return nil, err
	}
	ca, err := os.ReadFile(serviceAccountDir + "/ca.crt")
	if err != nil {
		return nil, err
	}
	httpClient, err := tlsClient(ca, false)
	if err != nil {
		return nil, err
	}
	return &KubeClient{Server: "https://" + host + ":" + port, Token: string(bytes.TrimSpace(token)), HTTP: httpClient}, nil
}

func tlsClient(ca []byte, insecure bool) (*http.Client, error) {
	config := &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: insecure} //nolint:gosec // only when the kubeconfig asks for it
	if len(ca) > 0 {
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(ca) {
			return nil, errors.New("invalid certificate authority")
		}
		config.RootCAs = pool
	}
	return &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{TLSClientConfig: config}}, nil
}
