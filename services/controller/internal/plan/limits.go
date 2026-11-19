package plan

import "fmt"

// Bounds of the user-configured resource and concurrency values. They are validation limits, not
// defaults: the controller never chooses a memory budget or concurrency limit for the user.
const (
	MinMemoryMiB = 64
	MaxMemoryMiB = 16384

	MinConcurrentExecutions = 1
	MaxConcurrentExecutions = 1000

	MaxQueuedExecutions = 10000

	MaxInvocationMs = 15 * 60 * 1000
)

// Validate checks the resource and concurrency contract of a plan.
func (p Policies) Validate() []string {
	var problems []string

	resources := p.Deployment.Resources
	if resources.AllocationMode != AllocationModeStatic {
		problems = append(problems, fmt.Sprintf("allocation mode must be %q", AllocationModeStatic))
	}
	if resources.MemoryMiB < MinMemoryMiB || resources.MemoryMiB > MaxMemoryMiB {
		problems = append(problems, fmt.Sprintf("memory budget must be between %d and %d MiB, got %d", MinMemoryMiB, MaxMemoryMiB, resources.MemoryMiB))
	}
	if resources.MemoryReservationMiB != resources.MemoryMiB {
		problems = append(problems, "memory reservation must equal the full memory budget")
	}

	concurrency := p.Runtime.Concurrency
	if concurrency.MaxConcurrentExecutions < MinConcurrentExecutions || concurrency.MaxConcurrentExecutions > MaxConcurrentExecutions {
		problems = append(problems, fmt.Sprintf("maximum concurrent executions must be between %d and %d, got %d", MinConcurrentExecutions, MaxConcurrentExecutions, concurrency.MaxConcurrentExecutions))
	}
	if concurrency.MaxQueuedExecutions < 0 || concurrency.MaxQueuedExecutions > MaxQueuedExecutions {
		problems = append(problems, fmt.Sprintf("maximum queued executions must be between 0 and %d, got %d", MaxQueuedExecutions, concurrency.MaxQueuedExecutions))
	}

	if p.Runtime.ExecutionClass != ExecutionClassStandard {
		problems = append(problems, fmt.Sprintf("execution class must be %q", ExecutionClassStandard))
	}
	if timeout := p.Runtime.Timeouts.MaxInvocationMs; timeout < 0 || timeout > MaxInvocationMs {
		problems = append(problems, fmt.Sprintf("maximum invocation time must be at most %d ms, got %d", MaxInvocationMs, timeout))
	}

	return problems
}
