// Interval-based fluency rate (input-timing work). Rate = correct answers per
// minute, computed from the SUM of valid CLIENT-measured per-item intervals — never
// wall-clock, never server-receipt time. BOTH sessions and sprints compute rate
// this identical way, so the numbers are comparable: a sprint rate is checked
// against an aim derived from the session/tool input floor, and if one were
// wall-clock-based and the other interval-based the milestone would fire on
// incomparable numbers.

// An interval this long means the child was interrupted (looked away, was pulled
// off), not working — it measures the interruption, so it's excluded. Mirrors the
// drill timing-void threshold (session-persistence work).
export const MAX_VALID_INTERVAL_MS = 60_000;
// Guards against impossible sub-human intervals (double-fire, stuck key) that would
// otherwise inflate the rate.
export const MIN_VALID_INTERVAL_MS = 150;

export type ItemTiming = { correct: boolean; intervalMs: number };

export function isValidInterval(intervalMs: number): boolean {
  return intervalMs >= MIN_VALID_INTERVAL_MS && intervalMs <= MAX_VALID_INTERVAL_MS;
}

// correct × 60000 over the summed valid intervals (ms → per-minute). The denominator
// is the total time spent on valid items (correct AND incorrect both consume time,
// as in precision teaching); the numerator counts only corrects. Null when there is
// no clean signal to state a rate on.
export function intervalRate(items: ItemTiming[]): number | null {
  const valid = items.filter((i) => isValidInterval(i.intervalMs));
  if (valid.length === 0) return null;
  const sumMs = valid.reduce((a, i) => a + i.intervalMs, 0);
  if (sumMs <= 0) return null;
  const correct = valid.filter((i) => i.correct).length;
  return (correct * 60000) / sumMs;
}

// Errors-per-minute, same denominator — the descending series on the celeration
// chart. Kept alongside so both are derived one way, everywhere.
export function errorRate(items: ItemTiming[]): number | null {
  const valid = items.filter((i) => isValidInterval(i.intervalMs));
  if (valid.length === 0) return null;
  const sumMs = valid.reduce((a, i) => a + i.intervalMs, 0);
  if (sumMs <= 0) return null;
  const errors = valid.filter((i) => !i.correct).length;
  return (errors * 60000) / sumMs;
}
