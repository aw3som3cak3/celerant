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
// first is the easy floor (~0.95), the last sits at the real edge (0.80), linear
// in between. By the final warm-up item the child is at her level (§2).
export function rampTargetP(index: number, len: number): number {
  if (len <= 1) return RAMP_FLOOR_P;
  const t = Math.min(Math.max(index, 0), len - 1) / (len - 1);
  return RAMP_FLOOR_P + (RAMP_TOP_P - RAMP_FLOOR_P) * t;
}
