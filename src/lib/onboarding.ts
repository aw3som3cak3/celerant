// The warm-up ramp (onboarding-ramp.md). A PURE selection policy: it decides how
// many items at the start of a session climb from an easy floor to the child's
// real edge, and it fades over her first several sessions. It touches nothing the
// system honestly believes about her — the θ reduction lives on the attempt, not
// here. No DB, no player state.

export const ONBOARD_SESSIONS = 4; // sessions over which the warm-up fades to nothing (§3)
export const RAMP_FLOOR_P = 0.95; // the easy floor: near-certain wins (§2)
export const RAMP_TOP_P = 0.8; // the normal 0.80 target, where the ramp hands off

// Fraction of the session target that is warm-up, by COMPLETED-session count
// (session 1 = 0 completed). Reads from session_run history, not a flag, so it
// survives replay and can't drift (§3). Fades to 0 by ONBOARD_SESSIONS.
const FADE = [0.67, 0.42, 0.25, 0.12]; // sessions 1..4 (of a 12-item target: ~8,5,3,1)

// How many warm-up items this session instance gets. Always leaves at least the
// last item to the honest engine (so peak-end and the real edge are never inside
// the ramp).
export function rampLen(completedSessions: number, target: number): number {
  if (completedSessions >= ONBOARD_SESSIONS) return 0;
  const n = Math.round(FADE[completedSessions] * target);
  return Math.max(0, Math.min(n, target - 1));
}

// The predicted-success target for warm-up item `index` (0-based) of `len`: the
// first is the easy floor (~0.95), the last sits at the player's current target
// (`topTarget`, 0.80 normally but 0.90 for a new/fragile player — start-from-
// below.md §2/§4), linear in between. By the final warm-up item she has arrived.
export function rampTargetP(index: number, len: number, topTarget: number = RAMP_TOP_P): number {
  if (len <= 1) return RAMP_FLOOR_P;
  const t = Math.min(Math.max(index, 0), len - 1) / (len - 1);
  return RAMP_FLOOR_P + (topTarget - RAMP_FLOOR_P) * t;
}

// ── start-from-below (start-from-below.md) ───────────────────────────────────
// A child who is behind must WIN before the system probes, and the app must find
// his level by climbing INTO it from underneath — never by starting high and
// dropping after he fails. Two levers: a gentler success target for the fragile,
// and a grade that is only ever a weak hint the parent sets, never a self-report.

export const NEW_PLAYER_TARGET = 0.9; // confidence repair wants a high win ratio (§2)
export const STEADY_TARGET = 0.8; // the normal calibration target, once he isn't fragile
export const SETTLE_SESSIONS = 4; // sessions over which the target eases 0.90 -> 0.80
export const STEADY_VOL = 0.09; // below this per-skill volatility, he counts as steady

// The success target for THIS player right now. New/fragile players get ~0.90 and
// ease toward 0.80 across their first sessions — but ONLY as volatility drops (a
// child still swinging keeps the easier target; §4). Confidence wins early.
export function playerTarget(completedSessions: number, maxVolatility: number): number {
  const steady = maxVolatility <= STEADY_VOL;
  if (completedSessions >= SETTLE_SESSIONS && steady) return STEADY_TARGET;
  const ease = Math.min(completedSessions / SETTLE_SESSIONS, 1);
  const eased = NEW_PLAYER_TARGET - (NEW_PLAYER_TARGET - STEADY_TARGET) * ease;
  return steady ? eased : Math.max(eased, 0.88); // still swinging -> hold near 0.90
}

// The ONE place the chosen grade becomes a seed grade (fix-grade-source-of-truth
// §1). `player.school_year` always stores the CHOSEN grade — the grade the child
// is in, exactly what the parent picked — and every other surface (create, grade-
// change, parent display) speaks in chosen grade. The minus-one offset lives here
// and ONLY here, so it can never compound into a double-offset.
//
// start-from-below errs low on purpose: seed one year below the child's grade, so
// last year's content sits at the comfortable target and this year's is a gentle
// stretch. This single minus-one also subsumes the old summer "entering grade N =
// finished N-1" correction (grade 4 in July → seed 3), so there is no separate
// date-correction to stack with — and, deliberately, NO dependence on the current
// date, so a replay reproduces the same seed in any season (determinism).
export function seedGradeFor(chosenGrade: number): number {
  return Math.max(0, chosenGrade - 1);
}

// The default grade when a parent gives none: the grade child is in defaults to 1,
// seeded from the low floor (seedGradeFor(1) = 0) — let the climb do the work.
export const NO_GRADE_DEFAULT = 1;
