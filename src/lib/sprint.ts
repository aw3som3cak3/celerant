import 'server-only';
import { randomUUID } from 'node:crypto';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon } from '@/skills';
import { aimFor, celeration, classifySprint, sprintRateIsCredible, MILESTONE_BONUS, type SprintOutcome, type SprintPoint } from './fluency';
import { isSprintEligible } from './sprint-eligibility';
import { rewardState } from './reward';
import { makeRng, randomSeed } from './rng';
import { grade } from './grade';
import { answerLengthOf, gradeBySeed } from './item';
import { isValidInterval } from './rate';

const SKILL_META = new Map(SKILLS.map((s) => [s.code, s]));

function schoolYearOf(playerId: string): number {
  return repo.playerById(playerId)?.school_year ?? 0;
}

// Sprint eligibility and the end-of-session offer live in ./sprint-eligibility (the
// eligibility subsystem). Re-exported here so existing importers keep working.
export { eligibleSprintSkills, sprintOffer, isSprintEligible, hasSprintAvailable, skillEligibility } from './sprint-eligibility';
export type { SprintOffer, SprintEligibility, SprintBand } from './sprint-eligibility';

// --- Live sprint sessions (in-process; a single-process home server) --------

type SprintSession = {
  id: string;
  playerId: string;
  schoolYear: number;
  skillCode: string;
  durationS: number;
  endsAt: number;
  correct: number;
  errors: number;
  current: { prompt: string; answer: string } | null;
  finalized: boolean;
};
type ToolSession = { id: string; playerId: string; target: string; durationS: number; endsAt: number };

const g = globalThis as unknown as { __sprints?: Map<string, SprintSession>; __tools?: Map<string, ToolSession> };
const sprints = (g.__sprints ??= new Map());
const tools = (g.__tools ??= new Map());

function genItem(code: string): { prompt: string; answer: string } {
  const it = generateCanon(code, makeRng(randomSeed()));
  return { prompt: it.prompt, answer: it.answer };
}

// `family` travels to the client so the answer input renders the right mobile
// keypad (numeric vs the full keyboard for fractions/negatives) — the same
// AnswerInput component practice uses, so the sprint can never again ship an input
// a child can't submit on a tablet.
export type SprintStart = { sprintId: string; prompt: string; durationS: number; endsAt: number; family: string };

export function startSprint(playerId: string, code: string, durationS: number, now: number): SprintStart | null {
  const meta = SKILL_META.get(code);
  if (!meta || !meta.sprintable) return null; // never time a compound or a written procedure
  if (!isSprintEligible(playerId, code)) return null; // must be in the fluency-building band

  const first = genItem(code);
  const id = randomUUID();
  const endsAt = now + durationS * 1000;
  sprints.set(id, {
    id,
    playerId,
    schoolYear: schoolYearOf(playerId),
    skillCode: code,
    durationS,
    endsAt,
    correct: 0,
    errors: 0,
    current: first,
    finalized: false,
  });
  return { sprintId: id, prompt: first.prompt, durationS, endsAt, family: meta.family };
}

export type SprintBonus = { sprintId: number; units: number };
export type SprintResult = {
  correct: number;
  errors: number;
  durationS: number;
  correctPerMin: number;
  errorsPerMin: number;
  aim: number;
  outcome: SprintOutcome | null; // null only for an empty run (no graded answer)
  bonus: SprintBonus | null; // present only on a first milestone crossing
};
export type SprintStep = { done: false; prompt: string; endsAt: number } | { done: true; result: SprintResult };

function finalize(s: SprintSession, now: number): SprintResult {
  const correctPerMin = (s.correct * 60) / s.durationS;
  const aim = aimFor(repo.latestToolRate(s.playerId), s.schoolYear);
  const graded = s.correct + s.errors;
  let outcome: SprintOutcome | null = graded > 0 ? classifySprint(s.correct, s.errors, correctPerMin, aim) : null;
  let bonus: SprintBonus | null = null;

  if (!s.finalized) {
    s.finalized = true;
    // An empty run — not one answer graded right OR wrong (correct + errors == 0)
    // — is not a measurement. It is the same non-event as an aborted sprint (see
    // abortSprint): persisting it would mint a spurious rate on a skill the child
    // never actually sprinted. So write nothing — the run simply didn't happen.
    if (graded > 0 && outcome) {
      // Write a rate ONLY if accuracy HELD (≥ SPRINT_ACC_FLOOR). A collapse or a
      // fast-but-sloppy run measures unreadiness, not speed — recording it would
      // poison the celeration chart and the parent view. Same principle as voiding
      // an interrupted interval.
      let sprintId: number | null = null;
      if (sprintRateIsCredible(s.correct, s.errors)) {
        sprintId = repo.appendSprint(s.playerId, s.skillCode, s.durationS, s.correct, s.errors, now); // ledger write → replay
        repo.appendUsageEvent(s.playerId, 'sprint_done', s.skillCode, now); // motivational-layer only
      }

      if (outcome.kind === 'milestone' && sprintId != null) {
        // The child CROSSED the aim, cleanly — a one-time milestone. Award the bonus
        // UNITS into the family's current default target (redirectable on the done
        // screen, keyed to this crossing sprint). One-time by construction: crossing
        // makes the skill measured-fluent → sprint-ineligible, so it can't recur.
        const player = repo.playerById(s.playerId);
        if (player) {
          const target = rewardState(player.family_id).sharedTarget;
          repo.setBonusAllocation(sprintId, s.playerId, player.family_id, target.kind, target.id, MILESTONE_BONUS, now);
          repo.appendUsageEvent(s.playerId, 'sprint_milestone', s.skillCode, now);
          bonus = { sprintId, units: MILESTONE_BONUS };
        }
      } else if (outcome.kind === 'collapse') {
        // Accuracy fell apart under time — the skill wasn't truly ready. DEMOTE it to
        // untimed practice: sprint-ineligible until fresh accuracy re-solidifies (a
        // state-based cooldown, not a timer, not a nag). Recorded as a usage_event,
        // which replay never reads — so a collapse never dents θ or re-locks anything.
        repo.appendUsageEvent(s.playerId, 'sprint_demoted', s.skillCode, now);
      }
    }
  }

  return {
    correct: s.correct,
    errors: s.errors,
    durationS: s.durationS,
    correctPerMin,
    errorsPerMin: (s.errors * 60) / s.durationS,
    aim,
    outcome,
    bonus,
  };
}

export function sprintAnswer(playerId: string, sprintId: string, given: string, now: number): SprintStep | null {
  const s = sprints.get(sprintId);
  if (!s || s.playerId !== playerId) return null;
  if (now <= s.endsAt && s.current) {
    if (grade(given, s.current.answer)) s.correct++;
    else s.errors++;
  }
  if (now >= s.endsAt) {
    const result = finalize(s, now);
    sprints.delete(sprintId);
    return { done: true, result };
  }
  s.current = genItem(s.skillCode);
  return { done: false, prompt: s.current.prompt, endsAt: s.endsAt };
}

// Abort an in-flight sprint WITHOUT finalizing (#3). A sprint interrupted mid-run
// (the pad backgrounded) would otherwise finalize a cut-short, deflated rate on
// resume. Aborting drops the in-memory run so nothing is ever written to the
// ledger — an interrupted sprint simply didn't happen. No rate, honest or not.
export function abortSprint(playerId: string, sprintId: string): void {
  const s = sprints.get(sprintId);
  if (s && s.playerId === playerId) sprints.delete(sprintId);
}

export function finishSprint(playerId: string, sprintId: string, now: number): SprintResult | null {
  const s = sprints.get(sprintId);
  if (!s || s.playerId !== playerId) return null;
  const result = finalize(s, now);
  sprints.delete(sprintId);
  return result;
}

// --- Interval-based sprint (input-timing Phase A2) --------------------------
// The InputStage path: the server issues a batch of seeds, the client builds each
// item locally (shared buildItem), auto-submits, and measures a CLEAN per-item
// interval; ingest re-grades from the seeds and RE-BASES the rate onto those
// intervals (correct×60000/Σvalid) — feeding the SAME Phase B outcome/reward
// (classifySprint, milestone bonus, demote), which is untouched. This is the switch
// that turns the milestone on: it had been comparing a wall-clock rate polluted by
// keyboard-appear + load + round-trips, so it was effectively unreachable.

export const SPRINT_ITEMS = 20; // items per interval-based sprint (client auto-advances the batch)
export type SprintBatchItem = { seed: number; answerLength: number };
export type SprintBatchStart = { skillCode: string; family: string; items: SprintBatchItem[] };

export function sprintBatch(playerId: string, code: string, now: number): SprintBatchStart | null {
  const meta = SKILL_META.get(code);
  if (!meta || !meta.sprintable) return null; // never a compound or a written procedure
  if (!isSprintEligible(playerId, code)) return null; // must be in the fluency-building band
  const items = Array.from({ length: SPRINT_ITEMS }, () => {
    const seed = randomSeed(); // seeds are server-issued — no client fishing
    return { seed, answerLength: answerLengthOf(code, seed) };
  });
  return { skillCode: code, family: meta.family, items };
}

export type SprintIngestResult = {
  correct: number;
  errors: number;
  correctPerMin: number;
  errorsPerMin: number;
  aim: number;
  outcome: SprintOutcome | null;
  bonus: SprintBonus | null;
};

// Idempotent on sprintKey. Grades each result by re-generating from its seed; counts
// and times only VALID intervals (an interrupted item is not a clean point); derives
// the rate the interval way; then runs the UNCHANGED Phase B outcome/reward.
export function ingestSprint(
  playerId: string,
  code: string,
  sprintKey: string,
  results: { seed: number; given: string; intervalMs: number }[],
  now: number,
): SprintIngestResult {
  let correct = 0;
  let errors = 0;
  let intervalMs = 0;
  for (const r of results) {
    if (!isValidInterval(r.intervalMs)) continue; // interrupted → excluded from BOTH accuracy and time
    if (gradeBySeed(code, r.seed, r.given).correct) correct++;
    else errors++;
    intervalMs += r.intervalMs;
  }
  const aim = aimFor(repo.latestToolRate(playerId), schoolYearOf(playerId));
  const graded = correct + errors;
  const correctPerMin = intervalMs > 0 ? (correct * 60000) / intervalMs : 0;
  const errorsPerMin = intervalMs > 0 ? (errors * 60000) / intervalMs : 0;
  const outcome: SprintOutcome | null = graded > 0 ? classifySprint(correct, errors, correctPerMin, aim) : null;
  let bonus: SprintBonus | null = null;

  if (graded > 0 && outcome) {
    const credible = sprintRateIsCredible(correct, errors);
    const sprintId = repo.appendSprintIngest(playerId, code, correct, errors, intervalMs, credible, sprintKey, now);
    if (sprintId != null) {
      // Newly ingested (a retried batch returns null → these side effects fire once).
      if (credible) repo.appendUsageEvent(playerId, 'sprint_done', code, now);
      if (outcome.kind === 'milestone' && credible) {
        const player = repo.playerById(playerId);
        if (player) {
          const target = rewardState(player.family_id).sharedTarget;
          repo.setBonusAllocation(sprintId, playerId, player.family_id, target.kind, target.id, MILESTONE_BONUS, now);
          repo.appendUsageEvent(playerId, 'sprint_milestone', code, now);
          bonus = { sprintId, units: MILESTONE_BONUS };
        }
      } else if (outcome.kind === 'collapse') {
        repo.appendUsageEvent(playerId, 'sprint_demoted', code, now);
      }
    }
  }

  return { correct, errors, correctPerMin, errorsPerMin, aim, outcome, bonus };
}

// --- Tool-skill (writing-speed) measurement (addendum §4, ui-lifecycle §4.5) -
// Opt-in; runs the first time a child opens sprint mode. A measurement
// overwrites the provisional default outright on the next replay.

export type ToolStart = { toolId: string; target: string; durationS: number; endsAt: number };

export function startToolMeasure(playerId: string, durationS: number, now: number): ToolStart {
  const rng = makeRng(randomSeed());
  let target = '';
  for (let i = 0; i < 600; i++) target += rng.int(0, 9);
  const id = randomUUID();
  const endsAt = now + durationS * 1000;
  tools.set(id, { id, playerId, target, durationS, endsAt });
  return { toolId: id, target, durationS, endsAt };
}

export function submitToolMeasure(playerId: string, toolId: string, typed: string, now: number): { digitsPerMin: number } | null {
  const t = tools.get(toolId);
  if (!t || t.playerId !== playerId) return null;
  tools.delete(toolId);
  const clean = typed.replace(/\D/g, '');
  let matches = 0;
  for (let i = 0; i < clean.length && i < t.target.length; i++) if (clean[i] === t.target[i]) matches++;
  const digitsPerMin = (matches * 60) / t.durationS;
  repo.appendToolRate(playerId, digitsPerMin, now); // ledger write → replay
  return { digitsPerMin };
}

// --- The celeration chart (addendum §5) ------------------------------------

export type ChartData = { code: string; points: SprintPoint[]; aim: number; celeration: number | null };

export function chartForSkill(playerId: string, code: string): ChartData {
  const asc = repo.sprintsForSkill(playerId, code, 8).slice().reverse();
  const day0 = asc.length ? asc[0].at : 0;
  const points: SprintPoint[] = asc.map((sp) => ({
    day: (sp.at - day0) / (24 * 3600 * 1000),
    correctPerMin: (sp.correct * 60) / sp.duration_s,
    errorsPerMin: (sp.errors * 60) / sp.duration_s,
  }));
  return { code, points, aim: aimFor(repo.latestToolRate(playerId), schoolYearOf(playerId)), celeration: celeration(points) };
}
