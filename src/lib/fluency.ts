// Fluency math: the aim, celeration fit, and the accuracy gate constant.
// See addendum §3, §4, §5, §9.

export const SPRINT_ACCURACY_GATE = 0.95; // over the last 20 practice attempts
export const SPRINT_ACCURACY_WINDOW = 20;
export const AIM_BASE_FRACTION = 0.55; // 0.55 × ceiling × aim_factor

// A provisional rate for a component tier ABOVE the child's placement floor is
// seeded deliberately below the aim, so it does not satisfy the gate: the child
// has not demonstrated it and must earn a measured rate. Tiers at/below the
// floor are seeded AT the aim and do satisfy it. This factor is not a knob on
// the aim itself (see the note against editing AIM_BASE_FRACTION / aim_factor);
// it only distances an un-demonstrated provisional value from the bar.
export const PROVISIONAL_BELOW_AIM = 0.6;

// aim = 0.55 × latest tool_rate × aim_factor. Never stored; always computed.
// Returns null when the child has never had their writing speed measured — used
// by the celeration chart, which wants a real ceiling or none.
export function computeAim(latestToolRate: number | null, aimFactor: number): number | null {
  if (latestToolRate == null) return null;
  return AIM_BASE_FRACTION * latestToolRate * aimFactor;
}

// A per-årskurs default writing ceiling (digits/min), for the aim BEFORE any
// tool_rate exists (ui-lifecycle §4.5). Placement is not a gate; provisional
// rates seeded from this default already satisfy the fluency gate. One real
// measurement overwrites this guess outright — never averaged against it.
// Writing speed climbs with age; these are deliberately modest.
export function defaultCeiling(schoolYear: number): number {
  return 25 + 5 * Math.max(0, Math.min(9, schoolYear));
}

// The aim that always exists: measured ceiling if we have one, else the
// årskurs default. aimFactor is fixed at 1.0 (the delivered graph sets none).
export function aimFor(latestToolRate: number | null, schoolYear: number): number {
  const ceiling = latestToolRate ?? defaultCeiling(schoolYear);
  return AIM_BASE_FRACTION * ceiling;
}

export type SprintPoint = { day: number; correctPerMin: number; errorsPerMin: number };

// Least-squares slope of log(correct_per_min) against day, over up to the last
// 8 sprints. Returned as a weekly multiplier (celeration). Null with < 4 points
// — "two sprints is not a slope; show the number only after four" (§9).
export function celeration(points: SprintPoint[]): number | null {
  const usable = points.filter((p) => p.correctPerMin > 0);
  if (usable.length < 4) return null;

  const xs = usable.map((p) => p.day);
  const ys = usable.map((p) => Math.log(p.correctPerMin));
  const n = usable.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  const slopePerDay = num / den; // in log-units per day
  return Math.exp(slopePerDay * 7); // weekly multiplier
}
