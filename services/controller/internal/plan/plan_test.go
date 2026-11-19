package plan

import (
	"strings"
	"testing"
)

func TestCanonicalizeSortsKeysAndKeepsNumbers(t *testing.T) {
	got, err := Canonicalize([]byte(`{ "b": 1.50, "a": {"y": true, "x": "a && b"} }`))
	if err != nil {
		t.Fatal(err)
	}
	want := `{"a":{"x":"a && b","y":true},"b":1.50}`
	if string(got) != want {
		t.Fatalf("got %s, want %s", got, want)
	}

	if _, err := Canonicalize([]byte(`{} {}`)); err == nil {
		t.Fatal("expected trailing data to be rejected")
	}
	if empty, _ := Canonicalize(nil); string(empty) != "null" {
		t.Fatalf("empty input should canonicalize to null, got %s", empty)
	}
}

func TestEncodeIsDeterministic(t *testing.T) {
	a, _ := Canonicalize([]byte(`{"x":1,"y":2}`))
	b, _ := Canonicalize([]byte(`{"y":2,"x":1}`))
	first, err := Encode(Step{ID: "s", Config: a})
	if err != nil {
		t.Fatal(err)
	}
	second, _ := Encode(Step{ID: "s", Config: b})
	if first.Version != second.Version || string(first.Data) != string(second.Data) {
		t.Fatalf("equivalent artifacts encoded differently: %s vs %s", first.Data, second.Data)
	}
	if !strings.HasPrefix(first.Version, DigestPrefix) || len(first.Version) != len(DigestPrefix)+64 {
		t.Fatalf("unexpected version %q", first.Version)
	}
}

func validPolicies() Policies {
	return Policies{
		Runtime: RuntimePolicy{
			ExecutionClass: ExecutionClassStandard,
			Concurrency:    Concurrency{MaxConcurrentExecutions: 10},
		},
		Deployment: DeploymentPolicy{Resources: Resources{AllocationMode: AllocationModeStatic, MemoryMiB: 512, MemoryReservationMiB: 512}},
	}
}

func TestPoliciesValidate(t *testing.T) {
	if problems := validPolicies().Validate(); len(problems) != 0 {
		t.Fatalf("unexpected problems: %v", problems)
	}

	cases := map[string]func(*Policies){
		"memory too small": func(p *Policies) {
			p.Deployment.Resources.MemoryMiB, p.Deployment.Resources.MemoryReservationMiB = 1, 1
		},
		"memory too large": func(p *Policies) {
			p.Deployment.Resources.MemoryMiB, p.Deployment.Resources.MemoryReservationMiB = MaxMemoryMiB+1, MaxMemoryMiB+1
		},
		"discounted reservation": func(p *Policies) { p.Deployment.Resources.MemoryReservationMiB = 256 },
		"no concurrency":         func(p *Policies) { p.Runtime.Concurrency.MaxConcurrentExecutions = 0 },
		"unbounded concurrency":  func(p *Policies) { p.Runtime.Concurrency.MaxConcurrentExecutions = MaxConcurrentExecutions + 1 },
		"negative queue":         func(p *Policies) { p.Runtime.Concurrency.MaxQueuedExecutions = -1 },
		"queue too large":        func(p *Policies) { p.Runtime.Concurrency.MaxQueuedExecutions = MaxQueuedExecutions + 1 },
		"timeout too large":      func(p *Policies) { p.Runtime.Timeouts.MaxInvocationMs = MaxInvocationMs + 1 },
		"dynamic allocation":     func(p *Policies) { p.Deployment.Resources.AllocationMode = "dynamic" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			policies := validPolicies()
			mutate(&policies)
			if len(policies.Validate()) == 0 {
				t.Fatal("expected a problem")
			}
		})
	}
}

func TestWorkerCapacityReservesOverheadAndHeadroom(t *testing.T) {
	worker := WorkerCapacity{ContainerMemoryMiB: 4096, RuntimeOverheadMiB: 512, HeadroomPercent: 10}
	if err := worker.Validate(); err != nil {
		t.Fatal(err)
	}
	// 4096 - 512 - ceil(409.6)
	if got := worker.AllocatableMiB(); got != 3174 {
		t.Fatalf("allocatable = %d, want 3174", got)
	}

	channel := Resources{AllocationMode: AllocationModeStatic, MemoryMiB: 1024, MemoryReservationMiB: 1024}
	if !worker.Fits(2048, channel) {
		t.Fatal("expected 2048 + 1024 MiB to fit in 3174 MiB")
	}
	if worker.Fits(2200, channel) {
		t.Fatal("expected 2200 + 1024 MiB not to fit: the full budget is reserved")
	}

	if err := (WorkerCapacity{ContainerMemoryMiB: 512, RuntimeOverheadMiB: 512}).Validate(); err == nil {
		t.Fatal("expected a worker without allocatable memory to be invalid")
	}
}
