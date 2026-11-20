package com.gruent.runtime.sources

import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** A schedule of timer ticks. */
interface Schedule {
  /** Returns the first tick strictly after [after], or null if there is none. */
  fun next(after: Instant): Instant?
}

/**
 * Cron schedules with the syntax and semantics the controller validates timer bindings with
 * (github.com/robfig/cron/v3 with SecondOptional | Minute | Hour | Dom | Month | Dow | Descriptor):
 *
 * - five fields (`minute hour day-of-month month day-of-week`), or six with a leading seconds field
 * - `*`, `?`, lists, ranges, steps (`*&#47;5`, `10-30/5`, `5/15`) and names (`JAN`, `MON`)
 * - day of month and day of week match if either matches, unless one of them is `*` or `?`
 * - descriptors `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`, `@hourly`, and
 *   `@every <duration>` (Go duration syntax, at least one second)
 *
 * Schedules are evaluated in UTC.
 */
object CronSchedule {
  fun parse(expression: String): Schedule {
    val spec = expression.trim()
    if (spec.startsWith("@")) return descriptor(spec)
    val fields = spec.split(Regex("\\s+"))
    val normalized = when (fields.size) {
      5 -> listOf("0") + fields
      6 -> fields
      else -> throw IllegalArgumentException("expected 5 or 6 fields, found ${fields.size}: $expression")
    }
    return FieldSchedule(
      seconds = parseField(normalized[0], SECONDS),
      minutes = parseField(normalized[1], MINUTES),
      hours = parseField(normalized[2], HOURS),
      daysOfMonth = parseField(normalized[3], DAYS_OF_MONTH),
      months = parseField(normalized[4], MONTHS),
      daysOfWeek = parseField(normalized[5], DAYS_OF_WEEK),
    )
  }

  private fun descriptor(spec: String): Schedule = when (spec.lowercase()) {
    "@yearly", "@annually" -> parse("0 0 0 1 1 *")
    "@monthly" -> parse("0 0 0 1 * *")
    "@weekly" -> parse("0 0 0 * * 0")
    "@daily", "@midnight" -> parse("0 0 0 * * *")
    "@hourly" -> parse("0 0 * * * *")
    else -> if (spec.startsWith("@every ")) {
      EverySchedule(parseGoDuration(spec.removePrefix("@every ").trim()))
    } else {
      throw IllegalArgumentException("unrecognized descriptor: $spec")
    }
  }

  private class Bounds(val min: Int, val max: Int, val names: Map<String, Int> = emptyMap())

  private val SECONDS = Bounds(0, 59)
  private val MINUTES = Bounds(0, 59)
  private val HOURS = Bounds(0, 23)
  private val DAYS_OF_MONTH = Bounds(1, 31)
  private val MONTHS = Bounds(
    1, 12,
    listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
      .withIndex().associate { it.value to it.index + 1 },
  )
  private val DAYS_OF_WEEK = Bounds(
    0, 6,
    listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat").withIndex().associate { it.value to it.index },
  )

  /** Values of a field, and whether it was `*` or `?` (which matters for the day fields). */
  private class Field(val values: BooleanArray, val star: Boolean) {
    operator fun contains(value: Int) = values[value]
  }

  private fun parseField(field: String, bounds: Bounds): Field {
    val values = BooleanArray(bounds.max + 1)
    var star = false
    for (part in field.split(',')) {
      val (rangePart, stepPart) = part.split('/').let {
        require(it.size <= 2) { "too many slashes: $part" }
        it[0] to it.getOrNull(1)
      }
      var start: Int
      var end: Int
      var partStar = false
      if (rangePart == "*" || rangePart == "?") {
        start = bounds.min
        end = bounds.max
        partStar = true
      } else {
        val range = rangePart.split('-')
        require(range.size <= 2) { "too many hyphens: $part" }
        start = value(range[0], bounds)
        end = if (range.size == 2) value(range[1], bounds) else start
      }
      var step = 1
      if (stepPart != null) {
        step = stepPart.toIntOrNull() ?: throw IllegalArgumentException("invalid step: $part")
        require(step > 0) { "step must be positive: $part" }
        // "N/step" means "N-max/step"
        if (!rangePart.contains('-') && !partStar) end = bounds.max
        if (step > 1) partStar = false
      }
      require(start >= bounds.min && end <= bounds.max && start <= end) { "value out of range (${bounds.min}-${bounds.max}): $part" }
      for (v in start..end step step) values[v] = true
      star = star || partStar
    }
    return Field(values, star)
  }

  private fun value(token: String, bounds: Bounds): Int =
    bounds.names[token.lowercase()] ?: token.toIntOrNull() ?: throw IllegalArgumentException("invalid value: $token")

  private class FieldSchedule(
    val seconds: Field,
    val minutes: Field,
    val hours: Field,
    val daysOfMonth: Field,
    val months: Field,
    val daysOfWeek: Field,
  ) : Schedule {
    override fun next(after: Instant): Instant? {
      var t = ZonedDateTime.ofInstant(after, ZoneOffset.UTC).truncatedTo(ChronoUnit.SECONDS).plusSeconds(1)
      val limit = t.plusYears(5)
      while (t.isBefore(limit)) {
        if (t.monthValue !in months) {
          t = t.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS).plusMonths(1)
          continue
        }
        if (!dayMatches(t)) {
          t = t.truncatedTo(ChronoUnit.DAYS).plusDays(1)
          continue
        }
        if (t.hour !in hours) {
          t = t.truncatedTo(ChronoUnit.HOURS).plusHours(1)
          continue
        }
        if (t.minute !in minutes) {
          t = t.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1)
          continue
        }
        if (t.second !in seconds) {
          t = t.plusSeconds(1)
          continue
        }
        return t.toInstant()
      }
      return null
    }

    private fun dayMatches(t: ZonedDateTime): Boolean {
      val dom = t.dayOfMonth in daysOfMonth
      val dow = (t.dayOfWeek.value % 7) in daysOfWeek
      return if (daysOfMonth.star || daysOfWeek.star) dom && dow else dom || dow
    }
  }

  /** `@every <duration>`: fixed delay, truncated to whole seconds (at least one), like robfig/cron. */
  private class EverySchedule(delay: Duration) : Schedule {
    private val delay: Duration = delay.truncatedTo(ChronoUnit.SECONDS).let { if (it < Duration.ofSeconds(1)) Duration.ofSeconds(1) else it }

    override fun next(after: Instant): Instant = after.plus(delay).truncatedTo(ChronoUnit.SECONDS)
  }

  /** Parses Go duration strings such as "90s", "1h30m" or "1.5h". */
  internal fun parseGoDuration(text: String): Duration {
    val units = mapOf(
      "ns" to 1L, "us" to 1_000L, "µs" to 1_000L, "μs" to 1_000L, "ms" to 1_000_000L,
      "s" to 1_000_000_000L, "m" to 60_000_000_000L, "h" to 3_600_000_000_000L,
    )
    val pattern = Regex("([0-9]*\\.?[0-9]+)(ns|us|µs|μs|ms|s|m|h)")
    require(text.isNotEmpty() && pattern.replace(text, "").isEmpty()) { "invalid duration: $text" }
    val nanos = pattern.findAll(text).sumOf { match ->
      (match.groupValues[1].toBigDecimal() * units.getValue(match.groupValues[2]).toBigDecimal()).toLong()
    }
    require(nanos > 0) { "duration must be positive: $text" }
    return Duration.ofNanos(nanos)
  }
}
