package plan

import "fmt"

// WorkerCapacity describes the memory of a runtime worker for capacity accounting. Channels are placed
// on a worker by their full MemoryReservationMiB, and the worker keeps back its runtime overhead (JVM,
// runtime services) and a safety headroom, so the sum of reservations never reaches the container
// limit. Unused reserved memory is not reclaimed: allocation is predictable rather than dense.
type WorkerCapacity struct {
	// ContainerMemoryMiB is the worker's enforced container memory limit.
	ContainerMemoryMiB int
	// RuntimeOverheadMiB is the memory used by the runtime itself, independent of channels.
	RuntimeOverheadMiB int
	// HeadroomPercent of the container limit is kept free as a safety margin.
	HeadroomPercent int
}

// Validate checks that the capacity leaves room for channels.
func (w WorkerCapacity) Validate() error {
	if w.ContainerMemoryMiB <= 0 {
		return fmt.Errorf("container memory must be positive, got %d MiB", w.ContainerMemoryMiB)
	}
	if w.RuntimeOverheadMiB < 0 {
		return fmt.Errorf("runtime overhead must not be negative, got %d MiB", w.RuntimeOverheadMiB)
	}
	if w.HeadroomPercent < 0 || w.HeadroomPercent >= 100 {
		return fmt.Errorf("headroom must be between 0 and 99 percent, got %d", w.HeadroomPercent)
	}
	if w.AllocatableMiB() <= 0 {
		return fmt.Errorf("runtime overhead and headroom leave no memory for channels")
	}
	return nil
}

// AllocatableMiB is the memory available for channel reservations.
func (w WorkerCapacity) AllocatableMiB() int {
	headroom := (w.ContainerMemoryMiB*w.HeadroomPercent + 99) / 100 // round up
	return w.ContainerMemoryMiB - w.RuntimeOverheadMiB - headroom
}

// Fits reports whether a channel with the given resources can be placed on the worker alongside
// channels that already hold reservedMiB.
func (w WorkerCapacity) Fits(reservedMiB int, resources Resources) bool {
	return reservedMiB+resources.MemoryReservationMiB <= w.AllocatableMiB()
}
