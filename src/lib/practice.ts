import 'server-only';
import { randomUUID } from 'node:crypto';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon } from '@/skills';
import { selectItem, computeUnlocked, type SelState, type RateEvidence } from './selector';
import { aimFor } from './fluency';
import { makeRng, randomSeed } from './rng';
import { grade } from './grade';
import { skillLabel } from './labels';

const STRETCH_TARGET = 0.65; // "svårare" toggle (motivation §3.2)

const SKILL_META = new Map(SKILLS.map((s) => [s.code, s]));

function rateEvidence(rateState: string, rate: number | null): RateEvidence {
  if (rate == null || rateState === 'unknown') return { source: 'unknown' };
  return rateState === 'measured' ? { source: 'measured', value: rate } : { source: 'provisional', value: rate };
}

// Per-player selector state, from the ability cache. There is no gate: a player
// is seeded with provisional rates at creation (ui-lifecycle §4.5), so the
// fluency gate is already satisfied and the first screen is a problem.
export function buildStates(playerId: string, schoolYear: number): SelState[] {
  const ability = repo.abilities(playerId);
  const toolRate = repo.latestToolRate(playerId);
  const aim = aimFor(toolRate, schoolYear);

  return SKILLS.map((s) => {
    const ab = ability.get(s.code);
    const rate: RateEvidence =
      s.mode === 'component' ? rateEvidence(ab?.rate_state ?? 'unknown', ab?.rate ?? null) : { source: 'unknown' };
    return {
      code: s.code,
      family: s.family,
      year: s.year,
      mode: s.mode,
      skillId: 0,
      theta: ab ? ab.theta : 0,
      lastSeenAt: ab ? ab.last_seen_at : null,
      requires: s.requires,
      rate,
      aim,
    };
  });
}

// In-memory pending items: item generation writes nothing to any ledger (§6.7).
// The answer is stashed server-side keyed by an opaque itemId; the client never
// sees it. A process restart drops these — the client just fetches a fresh item.
type Pending = {
  playerId: string;
  skillCode: string;
  prompt: string;
  answer: string;
  steps: string[];
  seed: number;
  scores: unknown;
  servedAt: number;
  tries: number;
  firstWrong: string | null;
};
const g = globalThis as unknown as { __pending?: Map<string, Pending> };
const pending = (g.__pending ??= new Map());

export type NextItem = {
  itemId: string;
  prompt: string;
  family: string;
  mode: 'component' | 'compound';
  level: number;
  novel: boolean; // first time this player has seen this kind of problem (§3.5)
};

export type NextOpts = {
  stretch?: boolean; // shift the success target 0.80 -> 0.65
  chosenCode?: string; // the child's session-start choice (§3.2) — first item only
  peakEnd?: boolean; // last item of a session: highest-p eligible (§3.3)
};

// Three eligible skills near the success target, for the child to choose from at
// the start of a session (§3.2). Difficulty is never an axis. Each carries a
// `sample` — a real example problem — so a child who can't yet read the label
// still recognises the kind of maths. Order is randomised; none is recommended.
export type SkillChoice = { code: string; label: string; sample: string };

export function sessionChoices(playerId: string, schoolYear: number, stretch: boolean, now: number): SkillChoice[] {
  const states = buildStates(playerId, schoolYear);
  const { scores } = selectItem(states, {
    now,
    previousCode: null,
    recentCodes: repo.recentAttemptSkillCodes(playerId, 8),
    rand: Math.random,
    target: stretch ? STRETCH_TARGET : undefined,
  });
  return scores
    .filter((s) => s.eligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => ({ code: s.code, label: skillLabel(s.code), sample: generateCanon(s.code, makeRng(randomSeed())).prompt, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ code, label, sample }) => ({ code, label, sample }));
}

export function nextItem(playerId: string, schoolYear: number, now: number, opts: NextOpts = {}): NextItem {
  const states = buildStates(playerId, schoolYear);
  const unlocked = computeUnlocked(states);
  const ability = repo.abilities(playerId);
  const recentCodes = repo.recentAttemptSkillCodes(playerId, 8);
  const previousCode = recentCodes[0] ?? null;
  const target = opts.stretch ? STRETCH_TARGET : undefined;

  // The child's session-start choice serves as the first item, if still eligible.
  let pick: SelState | undefined;
  let scores: unknown;
  let introduced = false;
  if (opts.chosenCode && unlocked.get(opts.chosenCode)) {
    pick = states.find((s) => s.code === opts.chosenCode);
  }
  if (!pick) {
    const r = selectItem(states, {
      now,
      previousCode,
      recentCodes,
      rand: Math.random,
      introduce: { recentAccuracy: repo.recentOverallFirstTryAccuracy(playerId, 10) },
      target,
      peakEnd: opts.peakEnd,
    });
    scores = r.scores;
    introduced = r.introduced;
    pick = r.chosen ?? states.find((s) => s.requires.length === 0)!;
  }

  // "Något nytt" marks a genuinely new unlock, not the session-1 flood where
  // every skill is new. Only cue it once the player is past their first burst.
  const novel = (ability.get(pick.code)?.last_seen_at ?? null) === null && repo.totalAttempts(playerId) >= 15;
  const seed = randomSeed();
  const item = generateCanon(pick.code, makeRng(seed));
  const itemId = randomUUID();

  pending.set(itemId, {
    playerId,
    skillCode: pick.code,
    prompt: item.prompt,
    answer: item.answer,
    steps: item.steps,
    seed,
    scores: { scores, introduced },
    servedAt: now,
    tries: 0,
    firstWrong: null,
  });

  const unlockedCount = states.filter((s) => unlocked.get(s.code)).length;
  const level = Math.max(1, Math.min(8, Math.round((unlockedCount / states.length) * 8)));
  return { itemId, prompt: item.prompt, family: pick.family, mode: pick.mode, level, novel };
}

export type SessionProgress = { completed: number; target: number; done: boolean };
export type AnswerResult =
  | { status: 'retry' }
  | { status: 'correct'; session?: SessionProgress }
  | { status: 'revealed'; steps: string[]; session?: SessionProgress }
  | { status: 'expired' };

// Grade a submitted answer. `idk` true means the child pressed "vet inte" —
// which counts toward the session's twenty (§3.1), so honesty costs nothing.
// The answer never came from the client; we grade against the pending item.
export function answer(
  playerId: string,
  itemId: string,
  given: string | null,
  idk: boolean,
  now: number,
  sessionId?: number,
): AnswerResult {
  const p = pending.get(itemId);
  if (!p || p.playerId !== playerId) return { status: 'expired' };

  if (!idk) {
    const isCorrect = grade(given ?? '', p.answer);
    if (!isCorrect && p.tries === 0) {
      p.tries = 1;
      p.firstWrong = given ?? '';
      return { status: 'retry' }; // a retry is not a resolved item; nothing recorded
    }
  }

  const triesRecorded = idk ? 0 : p.tries + 1;
  const finalCorrect = !idk && grade(given ?? '', p.answer) ? 1 : 0;

  const itemJson = JSON.stringify({ prompt: p.prompt, seed: p.seed, scores: p.scores, firstWrong: p.firstWrong });
  const attemptId = repo.appendAttempt({
    playerId,
    skillCode: p.skillCode,
    itemJson,
    given: idk ? null : given,
    correct: finalCorrect,
    tries: triesRecorded,
    dontKnow: idk,
    latencyMs: now - p.servedAt,
    at: now,
  });
  pending.delete(itemId);

  // A card is the first problem of this kind the child ever solved (§3.4).
  // Silent — it goes to the shelf, no notification. Downstream of the model.
  if (finalCorrect === 1) repo.insertCardIfFirst(playerId, p.skillCode, attemptId, now);

  // The session counter advances on every resolved item, "vet inte" included.
  let session: SessionProgress | undefined;
  if (sessionId != null) {
    const run = repo.bumpSessionRun(sessionId, now);
    session = { completed: run.completed, target: run.target, done: run.ended_at != null };
    if (session.done) checkFamilyGoal(playerId, now);
  }

  if (finalCorrect === 1) return { status: 'correct', session };
  return { status: 'revealed', steps: p.steps, session };
}

// When a session completes, a family goal may be reached — cooperative, in
// sessions, no per-child contribution stored (§4.1).
function checkFamilyGoal(playerId: string, now: number): void {
  const player = repo.playerById(playerId);
  if (!player) return;
  const goal = repo.getGoal(player.family_id);
  if (!goal || goal.reached_at != null) return;
  if (repo.completedSessionsForFamily(player.family_id, goal.created_at) >= goal.target) {
    repo.markGoalReached(player.family_id, now);
  }
}

// Test-only: read the stashed answer for a pending item (the client never can).
export function __peekPendingAnswer(itemId: string): string | undefined {
  return pending.get(itemId)?.answer;
}
