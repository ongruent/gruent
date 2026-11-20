package com.gruent.runtime.invocations

import io.nats.client.Connection
import io.nats.client.Dispatcher
import io.nats.client.Nats
import io.nats.client.Options
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList

/** A message received on a subscription. [reply] is set when the publisher waits for a reply. */
class InboundMessage(val subject: String, val data: ByteArray, val reply: (suspend (ByteArray) -> Unit)?)

fun interface Subscription {
  fun unsubscribe()
}

/**
 * The messaging system that carries invocations from sources to runtimes, replies back to sources, and
 * runtime observations to the controller. NATS in deployments; in memory for tests and local runs.
 */
interface MessageBus : AutoCloseable {
  fun publish(subject: String, data: ByteArray)

  /** Subscribes in a queue group: each message is handled by one member of the group. */
  fun subscribe(subject: String, queueGroup: String, handler: suspend (InboundMessage) -> Unit): Subscription

  /** Waits until published messages have been sent. */
  fun flush() {}

  override fun close() {}
}

/** A [MessageBus] on a NATS connection. Handlers run as coroutines in [scope]. */
class NatsMessageBus(private val connection: Connection, private val scope: CoroutineScope) : MessageBus {
  private val dispatchers = CopyOnWriteArrayList<Dispatcher>()

  override fun publish(subject: String, data: ByteArray) {
    connection.publish(subject, data)
  }

  override fun subscribe(subject: String, queueGroup: String, handler: suspend (InboundMessage) -> Unit): Subscription {
    val dispatcher = connection.createDispatcher { message ->
      val replyTo: String? = message.replyTo
      val reply: (suspend (ByteArray) -> Unit)? = if (replyTo == null) null else { data -> connection.publish(replyTo, data) }
      val inbound = InboundMessage(message.subject, message.data ?: ByteArray(0), reply)
      scope.launch { handler(inbound) }
    }
    dispatcher.subscribe(subject, queueGroup)
    dispatchers.add(dispatcher)
    return Subscription {
      dispatcher.unsubscribe(subject)
      connection.closeDispatcher(dispatcher)
      dispatchers.remove(dispatcher)
    }
  }

  override fun flush() {
    connection.flush(Duration.ofSeconds(5))
  }

  override fun close() {
    runCatching { connection.flush(Duration.ofSeconds(5)) }
    connection.close()
  }

  companion object {
    fun connect(url: String, name: String, scope: CoroutineScope): NatsMessageBus {
      val options = Options.Builder()
        .server(url)
        .connectionName(name)
        .maxReconnects(-1)
        .reconnectWait(Duration.ofSeconds(2))
        .build()
      return NatsMessageBus(Nats.connect(options), scope)
    }
  }
}

/** A [MessageBus] within the process, with NATS-style `*` and `>` wildcards. Queue groups pick the first subscriber. */
class InMemoryMessageBus(private val scope: CoroutineScope) : MessageBus {
  private class Entry(val pattern: String, val queueGroup: String, val handler: suspend (InboundMessage) -> Unit)

  private val subscriptions = CopyOnWriteArrayList<Entry>()

  override fun publish(subject: String, data: ByteArray) {
    deliver(subject, data, null)
  }

  /** Publishes with a reply handler, like a NATS request. */
  fun request(subject: String, data: ByteArray, onReply: suspend (ByteArray) -> Unit) {
    deliver(subject, data, onReply)
  }

  private fun deliver(subject: String, data: ByteArray, reply: (suspend (ByteArray) -> Unit)?) {
    val matching = subscriptions.filter { matches(it.pattern, subject) }
    val byGroup = matching.groupBy { it.queueGroup }
    for ((group, entries) in byGroup) {
      val targets = if (group.isEmpty()) entries else listOf(entries.first())
      for (entry in targets) {
        scope.launch { entry.handler(InboundMessage(subject, data, reply)) }
      }
    }
  }

  override fun subscribe(subject: String, queueGroup: String, handler: suspend (InboundMessage) -> Unit): Subscription {
    val entry = Entry(subject, queueGroup, handler)
    subscriptions.add(entry)
    return Subscription { subscriptions.remove(entry) }
  }

  companion object {
    fun matches(pattern: String, subject: String): Boolean {
      val p = pattern.split('.')
      val s = subject.split('.')
      for ((i, token) in p.withIndex()) {
        if (token == ">") return s.size > i
        if (i >= s.size) return false
        if (token != "*" && token != s[i]) return false
      }
      return p.size == s.size
    }
  }
}
