package com.gruent.runtime.execution

import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Enforces the plan's concurrency contract (policies.runtime.concurrency): at most [maxConcurrent]
 * executions run at once, and at most [maxQueued] more wait for a slot. Work beyond both limits is not
 * admitted, and the source applies the binding's overflow handling (a timer skips the tick, an HTTP source
 * answers 429).
 */
class Admission(val maxConcurrent: Int, val maxQueued: Int) {
  init {
    require(maxConcurrent >= 1) { "maxConcurrentExecutions must be at least 1" }
    require(maxQueued >= 0) { "maxQueuedExecutions cannot be negative" }
  }

  private val admitted = AtomicInteger(0)
  private val slots = Semaphore(maxConcurrent)

  /** Executions that are running or queued. */
  val inFlight: Int get() = admitted.get()

  /** Reserves a running or queued place, or returns false if the channel is at capacity. */
  fun tryAdmit(): Boolean {
    while (true) {
      val current = admitted.get()
      if (current >= maxConcurrent + maxQueued) return false
      if (admitted.compareAndSet(current, current + 1)) return true
    }
  }

  /** Runs an admitted execution once a slot is free, and releases its place afterwards. */
  suspend fun <T> run(block: suspend () -> T): T = try {
    slots.withPermit { block() }
  } finally {
    admitted.decrementAndGet()
  }
}
