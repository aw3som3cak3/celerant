import 'server-only';
import { randomUUID } from 'node:crypto';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon } from '@/skills';
import { selectItem, computeUnlocked, P_BAND, TARGET_SUCCESS, type SelState, type RateEvidence } from './selector';
import { aimFor } from './fluency';
import { seedGradeFor } from './onboarding';
import { makeRng, randomSeed } from './rng';
import { grade } from './grade';
import { skillLabel } from './labels';
import { extractFeatures, FEATURES_VERSION } from './features';

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
  // Aim uses the SEED grade (seedGradeFor), the same grade the cache's provisional
  // rates were seeded under (replay.ts). If the live aim used the raw chosen grade
  // while the cache used the seed grade, the fluency gate would flip on the
  // mismatch (fix-grade-source-of-truth §1 — one grade, applied one way).
  const aim = aimFor(toolRate, seedGradeFor(schoolYear));

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
      volatility: ab?.volatility,
    };
  });
}

// Pending items: item generation writes nothing to any ledger (§6.7). The answer
// is stashed server-side keyed by an opaque itemId; the client never sees it.
// Persisted in SQLite (not in memory) so a machine suspend/restart can't orphan
// an in-flight answer — otherwise the answer is silently dropped and the session
// counter stalls. Items self-expire; the client just fetches a fresh one.
const PENDING_TTL_MS = 6 * 3600 * 1000;

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
  warmupTarget?: number; // onboarding ramp (§2): serve near this predicted success, marks warmup
  baseTarget?: number; // start-from-below (§4): the honest target for this player (0.90 new -> 0.80)
};

// Three eligible skills near the success target, for the child to choose from at
// the start of a session (§3.2). Difficulty is never an axis. Each carries a
// `sample` — a real example problem — so a child who can't yet read the label
// still recognises the kind of maths. Order is randomised; none is recommended.
export type SkillChoice = { code: string; label: string; sample: string };

export function sessionChoices(playerId: string, schoolYear: number, stretch: boolean, now: number): SkillChoice[] {
  const states = buildStates(playerId, schoolYear);
  const target = stretch ? STRETCH_TARGET : TARGET_SUCCESS;
  const { scores } = selectItem(states, {
    now,
    previousCode: null,
    recentCodes: repo.recentAttemptSkillCodes(playerId, 8),
    rand: Math.random,
    target: stretch ? STRETCH_TARGET : undefined,
  });
  // Only offer skills inside the band — never present the child a choice the
  // system expects them to miss (the p-band gate, applied to the chooser too).
  return scores
    .filter((s) => s.eligible && Math.abs(s.p - target) <= P_BAND)
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
  // Warm-up (onboarding-ramp §2): serve near a high predicted success, climbing to
  // the edge. It overrides the target, suppresses the chooser and the introduce
  // slot, and still interleaves (recency term varies the skill). The θ reduction
  // is applied later, on the attempt — the ramp only moves what she sees.
  const warmup = opts.warmupTarget != null;
  // Warm-up climbs to its target; otherwise stretch (0.65) or the player's honest
  // base target (0.90 for a new/fragile player, easing to 0.80 — start-from-below).
  const target = warmup ? opts.warmupTarget : opts.stretch ? STRETCH_TARGET : opts.baseTarget;

  // The child's session-start choice serves as the first item, if still eligible.
  let pick: SelState | undefined;
  let scores: unknown;
  let introduced = false;
  if (!warmup && opts.chosenCode && unlocked.get(opts.chosenCode)) {
    pick = states.find((s) => s.code === opts.chosenCode);
  }
  if (!pick) {
    const r = selectItem(states, {
      now,
      previousCode,
      recentCodes,
      rand: Math.random,
      target,
      peakEnd: warmup ? false : opts.peakEnd,
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

  repo.savePendingItem({
    itemId,
    playerId,
    skillCode: pick.code,
    prompt: item.prompt,
    answer: item.answer,
    stepsJson: JSON.stringify(item.steps),
    seed,
    scoresJson: JSON.stringify({ scores, introduced }),
    servedAt: now,
    warmup,
  });
  repo.cleanupPendingItems(now - PENDING_TTL_MS);

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
  const p = repo.getPendingItem(itemId);
  if (!p || p.player_id !== playerId) return { status: 'expired' };

  if (!idk) {
    const isCorrect = grade(given ?? '', p.answer);
    if (!isCorrect && p.tries === 0) {
      repo.markPendingRetry(itemId, given ?? ''); // one retry; nothing recorded yet
      return { status: 'retry' };
    }
  }

  const triesRecorded = idk ? 0 : p.tries + 1;
  const finalCorrect = !idk && grade(given ?? '', p.answer) ? 1 : 0;

  // Feature-tag the item (instrumentation.md §2). Deterministic from the stored
  // prompt/answer; written once, read only by a future offline analysis.
  const features = extractFeatures(p.skill_code, p.prompt, p.answer);
  const warmup = p.warmup === 1;
  const itemJson = JSON.stringify({
    prompt: p.prompt,
    seed: p.seed,
    scores: JSON.parse(p.scores_json),
    firstWrong: p.first_wrong,
    features,
    features_version: FEATURES_VERSION,
    warmup, // onboarding-ramp §4 — also excludes it from probe/quasi analyses
  });
  const attemptId = repo.appendAttempt({
    playerId,
    skillCode: p.skill_code,
    itemJson,
    given: idk ? null : given,
    correct: finalCorrect,
    tries: triesRecorded,
    dontKnow: idk,
    warmup,
    latencyMs: now - p.served_at,
    at: now,
  });
  repo.deletePendingItem(itemId);

  // A card is the first problem of this kind the child ever solved (§3.4).
  // Silent — it goes to the shelf, no notification. Downstream of the model.
  if (finalCorrect === 1 && repo.insertCardIfFirst(playerId, p.skill_code, attemptId, now)) {
    repo.appendUsageEvent(playerId, 'card_earned', p.skill_code, now); // §4.3
  }

  // The session counter advances on every resolved item, "vet inte" included.
  let session: SessionProgress | undefined;
  if (sessionId != null) {
    const run = repo.bumpSessionRun(sessionId, now);
    session = { completed: run.completed, target: run.target, done: run.ended_at != null };
    if (session.done) {
      repo.appendUsageEvent(playerId, 'session_ended', 'completed', now); // §4.3
      checkFamilyGoal(playerId, now);
    }
  }

  if (finalCorrect === 1) return { status: 'correct', session };
  return { status: 'revealed', steps: JSON.parse(p.steps_json) as string[], session };
}

// When a session completes, a family goal may be reached — cooperative, in
// sessions, no per-child contribution stored (§4.1).
function checkFamilyGoal(playerId: string, now: number): void {
  const player = repo.playerById(playerId);
  if (!player) return;
  const goal = repo.getGoal(player.family_id);
  if (!goal || goal.reached_at != null) return;
  // Log the family-wide count crossing (never which child — §4.1), then, if the
  // target is met, mark reached (which logs the 'reached' event).
  const count = repo.completedSessionsForFamily(player.family_id, goal.created_at);
  repo.appendGoalEvent(player.family_id, goal.label, goal.target, 'progressed', count, now);
  if (count >= goal.target) repo.markGoalReached(player.family_id, now);
}

// Test-only: read the stashed answer for a pending item (the client never can).
export function __peekPendingAnswer(itemId: string): string | undefined {
  return repo.getPendingItem(itemId)?.answer;
}
