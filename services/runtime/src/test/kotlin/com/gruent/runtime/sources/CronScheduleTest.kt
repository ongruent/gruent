package com.gruent.runtime.sources

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.junit.jupiter.params.provider.ValueSource
import java.time.Duration
import java.time.Instant

class CronScheduleTest {
  @ParameterizedTest(name = "{0} after {1} is {2}")
  @CsvSource(
    delimiter = '|',
    value = [
      // six fields: leading seconds
      "0 */5 * * * *     | 2026-11-20T10:02:13Z | 2026-11-20T10:05:00Z",
      "*/10 * * * * *    | 2026-11-20T10:00:00Z | 2026-11-20T10:00:10Z",
      "* * * * * *       | 2026-11-20T10:00:00.500Z | 2026-11-20T10:00:01Z",
      // five fields: minute precision
      "*/15 * * * *      | 2026-11-20T10:14:59Z | 2026-11-20T10:15:00Z",
      "30 9 * * MON-FRI  | 2026-11-20T10:00:00Z | 2026-11-23T09:30:00Z",
      "0 0 1 JAN *       | 2026-11-20T10:00:00Z | 2027-01-01T00:00:00Z",
      "5/20 * * * *      | 2026-11-20T10:26:00Z | 2026-11-20T10:45:00Z",
      "0 12 1,15 * *     | 2026-11-20T10:00:00Z | 2026-12-01T12:00:00Z",
      // day of month OR day of week when neither is a star
      "0 0 13 * 5        | 2026-11-20T10:00:00Z | 2026-11-27T00:00:00Z",
      // AND when one is a star
      "0 0 * * 0         | 2026-11-20T10:00:00Z | 2026-11-22T00:00:00Z",
      "0 0 29 2 *        | 2026-11-20T10:00:00Z | 2028-02-29T00:00:00Z",
      // descriptors
      "@hourly           | 2026-11-20T10:00:00Z | 2026-11-20T11:00:00Z",
      "@daily            | 2026-11-20T10:00:00Z | 2026-11-21T00:00:00Z",
      "@weekly           | 2026-11-20T10:00:00Z | 2026-11-22T00:00:00Z",
      "@monthly          | 2026-11-20T10:00:00Z | 2026-12-01T00:00:00Z",
      "@yearly           | 2026-11-20T10:00:00Z | 2027-01-01T00:00:00Z",
      "@every 90s        | 2026-11-20T10:00:00Z | 2026-11-20T10:01:30Z",
      "@every 1h30m      | 2026-11-20T10:00:00Z | 2026-11-20T11:30:00Z",
      "@every 100ms      | 2026-11-20T10:00:00Z | 2026-11-20T10:00:01Z",
    ],
  )
  fun next(expression: String, after: String, expected: String) {
    assertEquals(Instant.parse(expected), CronSchedule.parse(expression).next(Instant.parse(after)))
  }

  @Test
  fun `impossible dates have no next tick`() {
    assertNull(CronSchedule.parse("0 0 30 2 *").next(Instant.parse("2026-11-20T10:00:00Z")))
  }

  @ParameterizedTest
  @ValueSource(strings = ["", "* * * *", "* * * * * * *", "60 * * * * *", "* * 32 * *", "* * * 13 *", "*/0 * * * *", "@sometimes", "@every x", "5-1 * * * *"])
  fun `invalid expressions are rejected`(expression: String) {
    assertThrows<IllegalArgumentException> { CronSchedule.parse(expression) }
  }

  @Test
  fun `go durations`() {
    assertEquals(Duration.ofMinutes(90), CronSchedule.parseGoDuration("1.5h"))
    assertEquals(Duration.ofMillis(1500), CronSchedule.parseGoDuration("1s500ms"))
  }
}
