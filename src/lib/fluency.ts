// Fluency math: the aim, celeration fit, and the accuracy gate constant.
// See addendum §3, §4, §5, §9.
import { expectedAnswerDigits, expectedPhysicalDigits, expectedAnswerLetters } from './item';
import type { Subject } from '@/skills';

export const SPRINT_ACCURACY_GATE = 0.95; // over the last 20 practice attempts
export const SPRINT_ACCURACY_WINDOW = 20;

// D1 internal-fluency SHADOW for recognition (choice) rungs. A smaller window than a sprint's (the
// youngest does fewer recognitions per sitting) and a slightly lower accuracy bar (0.90) that is
// still far above the 3-option guessing floor of 0.33 — fast only counts when accurate (Morningside).
export const RECOG_ACCURACY_WINDOW = 12;
export const RECOG_ACCURACY_GATE = 0.9;

// WS III-a shadow trigger. Practice-rate runs ~half the sprint rate (a calm interleaved
// item vs a warmed-up go-fast batch) — the prod shadow read found median practice/sprint
// ≈ 0.49 across kids. This factor is NOT an award mechanism (the burst does the awarding
// against the un-factored aim); it only decides WHEN a skill looks ready enough to offer a
// burst. A false positive just means a burst offered slightly early, which the burst
// adjudicates — so the factor's 0.39–0.92 spread is harmless here. Starting value; the
// shadow log accumulates the data to refine it (global vs per-child).
export const SHADOW_TRIGGER_FACTOR = 0.5;

// --- Sprint OUTCOME classification (the reward/coaching fork) ---------------
// A finished sprint is one of three ordered, total buckets, decided from the
// rate (correct/min) vs the aim and the IN-SPRINT accuracy (correct/(correct+
// errors)). The order matters: accuracy is checked FIRST, so speed bought by
// dropping accuracy can never be paid as a milestone — we never teach rushing.
export const MILESTONE_BONUS = 3; // one-time reward units for crossing the aim (tunable)
export const SPRINT_ACC_FLOOR = 0.9; // "accuracy held": at/above this the run is clean
export const SPRINT_COLLAPSE_FLOOR = 0.5; // below this accuracy the skill wasn't ready → demote

export type SprintOutcome =
  | { kind: 'milestone' } // rate ≥ aim AND accuracy held → crossed into fluent
  | { kind: 'near_miss'; reason: 'build_speed' | 'keep_clean' } // eligible, didn't cross; two opposite coachings
  | { kind: 'collapse' }; // accuracy fell apart under time → not ready, demote

// Pure and total. `correct`/`errors` are the sprint tallies; aim is the fluency
// aim. Empty runs (no graded answer) are handled by the caller (no outcome).
export function classifySprint(correct: number, errors: number, correctPerMin: number, aim: number): SprintOutcome {
  const graded = correct + errors;
  const acc = graded > 0 ? correct / graded : 0;
  // 1) Accuracy fell apart → readiness signal, not a speed measurement.
  if (acc < SPRINT_COLLAPSE_FLOOR) return { kind: 'collapse' };
  // 2) Fast AND clean → the one-time milestone.
  if (correctPerMin >= aim && acc >= SPRINT_ACC_FLOOR) return { kind: 'milestone' };
  // 3) Everything else is a near miss, but of two opposite kinds:
  //    - fast-but-sloppy (rate ≥ aim, accuracy 0.5–0.9): "great pace, keep it clean"
  //    - slow-but-accurate (rate < aim, accuracy held):  "you've got it, now build speed"
  return { kind: 'near_miss', reason: correctPerMin >= aim ? 'keep_clean' : 'build_speed' };
}

// Whether a run's rate is clean enough to record as fluency evidence. Only a run
// whose accuracy HELD (≥ floor) writes a rate — a collapse or a fast-but-sloppy
// run measures unreadiness, not speed, and must never reach the celeration chart
// or the parent view. Same principle as voiding an interrupted interval.
export function sprintRateIsCredible(correct: number, errors: number): boolean {
  const graded = correct + errors;
  return graded > 0 && correct / graded >= SPRINT_ACC_FLOOR;
}
// A provisional rate for a component tier ABOVE the child's placement floor is
// seeded deliberately below the aim, so it does not satisfy the gate: the child
// has not demonstrated it and must earn a measured rate. Tiers at/below the
// floor are seeded AT the aim and do satisfy it. This factor is not a knob on
// the aim itself; it only distances an un-demonstrated provisional value from the bar.
export const PROVISIONAL_BELOW_AIM = 0.6;

// --- The ADDITIVE fluency standard -----------------------------------------
// The aim is a per-item TIME budget, not a fraction of hand speed: the child's own
// motor time to enter an answer PLUS a fixed retrieval budget every child shares.
//
// This FIXES an inverted bug in the old multiplicative aim (0.55 × tap_rate). There,
// a faster writer got a HIGHER aim and therefore LESS time to think: at 25 dpm the
// 14/min aim left ~2s to retrieve; at 45 dpm the 24.8/min aim left only ~1.1s. The
// quicker hand was punished with a harder recall standard — backwards from the
// protective intent, and it feeds the live unlock gate. Additive subtracts motor
// time out instead of multiplying it in, so every child gets the SAME recall budget
// (RETRIEVAL_BUDGET_S) regardless of writing speed; a faster hand raises the items/
// min aim only because the hand is faster. (Reproduces ~14/min at 26 dpm, ~18 at 45.)
//
// Alternative not taken: an EMPIRICAL per-child fraction (achieved ÷ tap-rate on a
// genuinely mastered skill). Equally valid and more "demonstrated-over-assumed", but
// it needs a clean mastered reference to bootstrap; additive works from the first
// tool_rate. Swap here if the reference becomes reliable.
export const RETRIEVAL_BUDGET_S = 2; // seconds of recall time granted to every child, on top of motor

// items/min afforded by a digits/min tap rate: 60 / (motor_time + retrieval_budget),
// where motor_time = expected_answer_digits × seconds_per_digit. `digits` is the
// skill's expected answer length (default 1 for the writing-speed probe and generic
// callers) — WITHOUT it a two-digit skill is judged by a one-digit motor budget, which
// understates every longer-answer skill and, because answers lengthen up the graph,
// manufactures a downstream "less fluent than its prerequisites" pattern shaped like a
// transfer signal. Always < tap_rate (the +budget guarantees a physically reachable
// aim), so no cap is needed — a fast writer can never be handed an unmeetable aim.
function aimFromTapRate(tapRate: number, digits = 1): number {
  const motorS = (digits * 60) / tapRate; // seconds to physically enter the whole answer
  return 60 / (motorS + RETRIEVAL_BUDGET_S);
}

// The copy-based writing-speed probe measures visual-search + decode + motor (read the
// target digit, find the key, tap); typing a number you already KNOW is pure motor. So
// the probe UNDER-reads the tapping ceiling — a child beats it ~2× on skills he knows
// (proven on prod: a child produced 54 keystrokes/min against a 26 probe). A rate the
// child has actually achieved is a hard lower bound on his ceiling, so demonstrated
// throughput overrides the assumed measurement — the same demonstrated-over-assumed
// move as ability overriding placement. `floorRate` (digits/min the child has actually
// produced) raises the effective tap; it self-corrects as more sprints land and needs
// no new probe. Zero (the default) leaves the probe/ceiling untouched.
export function bestObservedDigitRate(measured: { code: string; rate: number }[]): number {
  let best = 0;
  for (const m of measured) best = Math.max(best, m.rate * expectedPhysicalDigits(m.code));
  return best;
}

// Returns null when the child has never had their writing speed measured — used by
// the celeration chart, which wants a real ceiling or none. `code`, when given, digit-
// adjusts the motor budget; `floorRate` raises the tap by demonstrated throughput.
export function computeAim(latestToolRate: number | null, code?: string, floorRate = 0): number | null {
  if (latestToolRate == null && floorRate <= 0) return null;
  const tap = Math.max(latestToolRate ?? 0, floorRate);
  return aimFromTapRate(tap, code ? expectedAnswerDigits(code) : 1);
}

// A per-årskurs default writing ceiling (digits/min), standing in for the hand BEFORE
// any tool_rate exists (ui-lifecycle §4.5) — so it only ever sets a NEW player's aim,
// until their first writing-speed test replaces it. Writing speed climbs with age.
//
// Re-anchored 2026-07-24 from the first real copy-task measurements: intercept 25 → 12.
// The old curve badly over-estimated the young/middle grades (åk0 measured ~13 vs 25;
// åk3 measured ~27 across two kids vs 40) — and a too-high default hands a new player a
// too-hard fluency aim, the "I'm bad at speed runs" trap. `12 + 5·grade` sits on the two
// best-anchored points (åk0≈13, åk3≈27) and errs slightly LOW everywhere else, which is
// the fair direction for a new player (a forgiving opening bar that their own measured
// rate, and the demonstrated-throughput floor, correct upward). CALIBRATED ON n=4 across
// grades 0/3/4 only — provisional; re-fit as more grades report a measurement.
export function defaultCeiling(schoolYear: number): number {
  return 12 + 5 * Math.max(0, Math.min(9, schoolYear));
}

// Spelling's per-årskurs default LETTER ceiling (letters/min) — the sibling of
// defaultCeiling for the letter pad, standing in for a NEW speller before any letter-tap
// probe exists. PURE PLACEHOLDER, n=0 letter data: seeded LOW and to be re-anchored from
// the first probes, exactly as the digit ceiling already was — trusting this past first
// contact would repeat a mistake we've twice paid for. UNWIRED until the spelling subject
// is threaded (letters/min must never share best_observed or a table with digits/min).
export function defaultLetterCeiling(schoolYear: number): number {
  return 10 + 3 * Math.max(0, Math.min(9, schoolYear));
}

// The aim that always exists: from the child's measured writing speed if we have it,
// else the årskurs default ceiling. Additive and digit-adjusted — see above. `code`,
// when given, budgets motor time for THAT skill's expected answer length; omit it only
// where no skill applies (the writing-speed probe), which falls back to one digit.
// `floorRate` raises the effective tap by the child's demonstrated keystroke throughput
// (bestObservedDigitRate) so the copy-probe's under-read can't leave aims loose — see
// above; default 0 leaves callers without a player context (tests, the probe) unchanged.
export function aimFor(latestToolRate: number | null, schoolYear: number, code?: string, floorRate = 0): number {
  const tapRate = Math.max(latestToolRate ?? defaultCeiling(schoolYear), floorRate);
  return aimFromTapRate(tapRate, code ? expectedAnswerDigits(code) : 1);
}

// The spelling sibling of aimFor: an additive LETTERS/min aim — motor time to write the
// word (letters × sec/letter) plus the shared retrieval budget. Uses defaultLetterCeiling
// as the tap until a real letter-tap probe exists (letters/min seed stays provisional, per
// the spelling plan). Kept unit-separate from digits/min on purpose: a spelling skill must
// NEVER be judged by a digit aim, nor a maths skill by a letter aim.
export function letterAimFor(schoolYear: number, code: string): number {
  const perMin = defaultLetterCeiling(schoolYear);
  const motorS = (expectedAnswerLetters(code) * 60) / perMin;
  return 60 / (motorS + RETRIEVAL_BUDGET_S);
}

// Dispatch the aim to the skill's OWN subject units (spelling increment 3 — the highest-
// stakes scoping site: the replay seed and the transfer signal both call this so a skill is
// never seeded/measured in the wrong units). This does NOT make the selector/θ/gate reason
// about subject — the gate still compares a scalar rate to a scalar aim, subject-blind; only
// the aim's UNITS are chosen here by subject. See A11.
export function aimForSkill(
  skill: { code: string; subject: Subject },
  latestToolRate: number | null,
  schoolYear: number,
  floorRate = 0,
): number {
  // Every WORD subject (Swedish spelling, English) is measured in letters/min; only maths uses the
  // digit/keystroke aim. The units partition is by modality, not per-subject — same letter pad.
  return skill.subject !== 'maths' ? letterAimFor(schoolYear, skill.code) : aimFor(latestToolRate, schoolYear, skill.code, floorRate);
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
