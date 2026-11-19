package com.gruent.steps.api

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import java.nio.ByteBuffer

data class StepInputOutput(val id: String, val label: String)

data class StepInfo(
  val abiVersion: Int,
  val stepVersion: String,
  val name: String,
  val label: String,
  val description: String,
  val category: String,
  val inputs: List<StepInputOutput>,
  val outputs: List<StepInputOutput>
)

interface HostContext {
  val nowNanos: Long
  // add logging/metrics helpers later
}

// Generic Step interface with type parameter for configuration
interface Step<Config> {
  val info: StepInfo
  var hostCtx: HostContext
  var scope: CoroutineScope
  var config: Config
  var inputChannel: Channel<ByteBuffer>
  var outputChannels: List<Channel<ByteBuffer>>

  suspend fun start(
    hostCtx: HostContext,
    scope: CoroutineScope,
    config: Config,
    inputChannel: Channel<ByteBuffer>,
    outputChannels: List<Channel<ByteBuffer>>
  ) {
    this.hostCtx = hostCtx
    this.scope = scope
    this.config = config
    this.inputChannel = inputChannel
    this.outputChannels = outputChannels
  }

  suspend fun stop() {
    // Close input and output channels
    inputChannel.close()
    for (channel in outputChannels) {
      channel.close()
    }

    // Shut down the coroutine scope
    scope.cancel()
  }
}
