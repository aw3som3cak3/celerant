import 'server-only';
import { randomUUID } from 'node:crypto';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon } from '@/skills';
import { buildStates } from './practice';
import { computeUnlocked } from './selector';
import { aimFor, celeration, SPRINT_ACCURACY_GATE, SPRINT_ACCURACY_WINDOW, type SprintPoint } from './fluency';
import { makeRng, randomSeed } from './rng';
import { grade } from './grade';
import { skillLabel } from './labels';

const SKILL_META = new Map(SKILLS.map((s) => [s.code, s]));

function schoolYearOf(playerId: string): number {
  return repo.playerById(playerId)?.school_year ?? 0;
}

// --- Sprint eligibility (addendum §3) --------------------------------------
// A component, unlocked, at ≥95% first-try accuracy over the last 20 practice
// attempts. Fluency building on an inaccurate skill drills the error in.
export type SprintEligible = { code: string; family: string; accuracy: number; aim: number; rate: number | null };

export function eligibleSprintSkills(playerId: string): SprintEligible[] {
  const schoolYear = schoolYearOf(playerId);
  const states = buildStates(playerId, schoolYear);
  const unlocked = computeUnlocked(states);
  const ability = repo.abilities(playerId);
  const aim = aimFor(repo.latestToolRate(playerId), schoolYear);

  const out: SprintEligible[] = [];
  for (const s of states) {
    if (s.mode !== 'component' || !unlocked.get(s.code)) continue;
    const { acc, count } = repo.recentFirstTryAccuracy(playerId, s.code, SPRINT_ACCURACY_WINDOW);
    if (count < SPRINT_ACCURACY_WINDOW || acc < SPRINT_ACCURACY_GATE) continue;
    const ab = ability.get(s.code);
    out.push({ code: s.code, family: s.family, accuracy: acc, aim, rate: ab?.rate_state === 'measured' ? ab.rate : null });
  }
  return out;
}

// --- The offer (fluency-sprint-wiring §6) -----------------------------------
// A sprint is a VICTORY LAP the app offers sparingly at a peak moment — never a
// gate, never first-thing, never forced ("a sprint can never be failed, only
// done"). This picks AT MOST ONE skill to offer on a just-finished session's done
// screen, and throttles proactive offers so they stay rare. A null return means
// "don't offer" — the common case. The shelf's ⚡ affordance is deliberately NOT
// throttled through here: that one is the child reaching for it, not us nudging.
const OFFER_COOLDOWN_SESSIONS = 3; // ≥ this many completed sessions between proactive offers
const OFFER_DECLINE_COOLDOWN_MS = 7 * 24 * 3600 * 1000; // don't re-nag a skill the child waved off, for a week
const OFFER_SESSION_WINDOW = 15; // "practised this session" ≈ the last N attempts (the done screen fires right after)

export type SprintOffer = { code: string; label: string; family: string };

export function sprintOffer(playerId: string, now: number): SprintOffer | null {
  const elig = eligibleSprintSkills(playerId);
  if (!elig.length) return null;

  // Throttle: stay rare. Skip if we showed an offer within the last few completed
  // sessions. (The client logs 'sprint_offered' when the card is actually shown.)
  const lastOfferAt = repo.lastUsageEventAt(playerId, 'sprint_offered');
  if (lastOfferAt != null && repo.completedSessionsSince(playerId, lastOfferAt) < OFFER_COOLDOWN_SESSIONS) return null;

  // Offer only a skill the child JUST practised well (the peak moment), and never
  // one they recently waved off. Highest accuracy wins — the surest victory lap.
  const justPractised = new Set(repo.recentAttemptSkillCodes(playerId, OFFER_SESSION_WINDOW));
  const declined = new Set(repo.usageDetailsSince(playerId, 'sprint_declined', now - OFFER_DECLINE_COOLDOWN_MS));
  const cands = elig
    .filter((e) => justPractised.has(e.code) && !declined.has(e.code))
    .sort((a, b) => b.accuracy - a.accuracy);
  if (!cands.length) return null;

  const c = cands[0];
  return { code: c.code, label: skillLabel(c.code), family: c.family };
}

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
  if (!meta || meta.mode !== 'component') return null; // never time a compound
  if (!eligibleSprintSkills(playerId).some((e) => e.code === code)) return null;

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

export type SprintResult = {
  correct: number;
  errors: number;
  durationS: number;
  correctPerMin: number;
  errorsPerMin: number;
  aim: number;
};
export type SprintStep = { done: false; prompt: string; endsAt: number } | { done: true; result: SprintResult };

function finalize(s: SprintSession, now: number): SprintResult {
  if (!s.finalized) {
    s.finalized = true;
    // An empty run — not one answer graded right OR wrong (correct + errors == 0)
    // — is not a measurement. It is the same non-event as an aborted sprint (see
    // abortSprint): persisting it would mint a spurious `measured` rate of 0 on a
    // skill the child never actually sprinted, reading in the parent view as
    // "0/aim (mätt)" on what may be their strongest skill. So write nothing — the
    // run simply didn't happen. (WHY a completed run captures zero answers is a
    // separate diagnosis; this only stops the bad rate from ever being recorded.)
    if (s.correct + s.errors > 0) {
      repo.appendSprint(s.playerId, s.skillCode, s.durationS, s.correct, s.errors, now); // ledger write → replay
      repo.appendUsageEvent(s.playerId, 'sprint_done', s.skillCode, now); // motivational-layer only; also feeds the offer throttle
    }
  }
  return {
    correct: s.correct,
    errors: s.errors,
    durationS: s.durationS,
    correctPerMin: (s.correct * 60) / s.durationS,
    errorsPerMin: (s.errors * 60) / s.durationS,
    aim: aimFor(repo.latestToolRate(s.playerId), s.schoolYear),
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
