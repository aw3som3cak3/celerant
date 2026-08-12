import 'server-only';
import { randomUUID } from 'node:crypto';
import * as repo from '@/db/repo';
import { SKILLS, generateCanon, type Subject } from '@/skills';
import { skillsForSubject } from './subjects';
import { SPELLING_POOLS, encodeSpellingSeed, type SpellingPhase } from './spelling-content';
import { selectItem, computeUnlocked, P_BAND, TARGET_SUCCESS, type SelState, type RateEvidence } from './selector';
import { aimForSkill } from './fluency';
import { seedGradeFor, subjectSeedGrade, playerTarget, reachUpProbability, rampLen, rampTargetP, RAMP_FLOOR_P } from './onboarding';
import { rewardState } from './reward';
import { makeRng, randomSeed } from './rng';
import { grade } from './grade';
import { skillLabel } from './labels';
import { extractFeatures, FEATURES_VERSION } from './features';
import { answerLengthOf, buildItem } from './item';
import { nextBurstCode, settleBurstOnAnswer } from './burst';

const STRETCH_TARGET = 0.65; // "svårare" toggle (motivation §3.2)

const SKILL_META = new Map(SKILLS.map((s) => [s.code, s]));

function rateEvidence(rateState: string, rate: number | null): RateEvidence {
  if (rate == null || rateState === 'unknown') return { source: 'unknown' };
  return rateState === 'measured' ? { source: 'measured', value: rate } : { source: 'provisional', value: rate };
}

// Per-player selector state, from the ability cache. There is no gate: a player
// is seeded with provisional rates at creation (ui-lifecycle §4.5), so the
// fluency gate is already satisfied and the first screen is a problem.
export function buildStates(playerId: string, schoolYear: number, subject: Subject = 'maths'): SelState[] {
  const ability = repo.abilities(playerId);
  const toolRate = repo.latestToolRate(playerId);
  // Aim uses the SEED grade (seedGradeFor), the same grade the cache's provisional
  // rates were seeded under (replay.ts). If the live aim used the raw chosen grade
  // while the cache used the seed grade, the fluency gate would flip on the
  // mismatch (fix-grade-source-of-truth §1 — one grade, applied one way). PER SKILL,
  // digit-adjusted: a longer answer costs more motor time, so it gets a lower items/
  // min aim — otherwise every multi-digit skill reads as slower than it is.
  // Floor the effective tap by demonstrated throughput (copy-probe under-reads tapping).
  const floor = repo.bestObservedDigitRate(playerId);
  // Skills whose fluency the child has EARNED (a clean sprint crossed the aim). A stored,
  // monotonic grant — see componentFluent's invariant; a drifting aim never revokes it.
  const earned = repo.everMilestonedSkills(playerId);
  // Recognition rungs the child has CROSSED (accuracy+volume) — D2a's monotonic ordering grant.
  const recogCrossed = repo.recogCrossedSkills(playerId);

  return skillsForSubject(subject).map((s) => {
    const ab = ability.get(s.code);
    const rate: RateEvidence =
      s.mode === 'component' ? rateEvidence(ab?.rate_state ?? 'unknown', ab?.rate ?? null) : { source: 'unknown' };
    // Recognition/choice rung — spelling t0…t1c AND maths GROUND (fler/färre, count, …). Year 0, so
    // seedGrade≥year auto-fluents them all → no ORDER (a fresh F child jumps to add_within_10 / t15).
    // Instead they seed-pass at åk≥1 (an older child skips the floor) and the YOUNGEST (åk0) must EARN
    // each — the recog_shadow accuracy+volume crossing — so her floor is ORDERED: fler/färre first,
    // then count once accurate, …; the numpad on-ramp stays gated behind ground_sum (D2a).
    const isRecog = s.format === 'choice';
    // Subject-aware seed grade — must match the grade the cache's provisional rate was seeded under
    // (replay), or the fluency gate flips on the mismatch. English seeds from a beginner level, so a
    // Swedish åkN child earns the English floor rather than seed-passing it.
    const sg = subjectSeedGrade(schoolYear, s.subject);
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
      aim: aimForSkill(s, toolRate, sg, floor),
      volatility: ab?.volatility,
      // The seed's own fluency decision (grade ≥ year). Recognition rungs use a ≥1 threshold
      // instead of their year-0 so åk0 must earn them (recogFluent) while åk≥1 seed-passes.
      seedFluent: s.mode === 'component' ? (isRecog ? sg >= 1 : sg >= s.year) : true,
      earnedFluent: earned.has(s.code),
      recogFluent: isRecog ? recogCrossed.has(s.code) : undefined,
    };
  });
}

// Pending items: item generation writes nothing to any ledger (§6.7). The answer
// is stashed server-side keyed by an opaque itemId; the client never sees it.
// Persisted in SQLite (not in memory) so a machine suspend/restart can't orphan
// an in-flight answer — otherwise the answer is silently dropped and the session
// counter stalls. Items self-expire; the client just fetches a fresh one.
const PENDING_TTL_MS = 6 * 3600 * 1000;

// Timing-void threshold (#3). An item still open this long after it was served
// was almost certainly interrupted — a parent said "brush your teeth" mid-problem
// — not genuinely being worked on (a problem at the child's level is seconds, not
// minutes). We DISCARD it rather than record it, so an interruption-inflated
// latency can never reach the fluency/transfer data: a 13-hour problem never
// becomes an attempt. The child is simply served a fresh item (the client also
// refetches proactively on resume). Completed-before items keep their real
// timings. Generous enough not to clip a legitimately slow answer.
export const TIMING_STALE_MS = 3 * 60 * 1000;

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
  reachUp?: boolean; // reach-up (fix-reach-up.md §3): serve the next rung above the band for a coasting child
  subject?: Subject; // which subject's pool to select from (default maths) — spelling scoping
  subjects?: Subject[]; // a MIXED session: interleave these subjects (laggard up-weighted). When
  // absent or length<=1 the selector is single-subject and byte-identical to before.
  sessionId?: number; // the active session run; enables the burst hook (WS III B0). Absent outside a session.
  remaining?: number; // items left in the session (target - completed); the burst only starts if it fits.
};

// Order the active subjects for the NEXT item when a session spans several (a mixed Öva).
// Pure + rand-injected. Weights each subject inversely to its share of recent attempts, so the
// UNDER-represented (lagging) subject tends to come first — this is the imbalance fix, and the
// full ordering doubles as the eligibility-fallback order (try the laggard; if it has nothing
// in-band, fall through to the next). A single-subject list returns as-is (no weighting).
export function orderSubjectsForNext(recentCodes: string[], subjects: Subject[], rand: () => number): Subject[] {
  if (subjects.length <= 1) return [...subjects];
  const counts = new Map<Subject, number>(subjects.map((s) => [s, 0]));
  for (const code of recentCodes) {
    const subj = SKILL_META.get(code)?.subject;
    if (subj && counts.has(subj)) counts.set(subj, counts.get(subj)! + 1);
  }
  const pool = [...subjects];
  const out: Subject[] = [];
  while (pool.length) {
    const max = Math.max(...pool.map((s) => counts.get(s)!));
    const weights = pool.map((s) => max + 1 - counts.get(s)!); // laggard → highest weight
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) { idx = i; break; }
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// Three eligible skills near the success target, for the child to choose from at
// the start of a session (§3.2). Difficulty is never an axis. Each carries a
// `sample` — a real example problem — so a child who can't yet read the label
// still recognises the kind of maths. Order is randomised; none is recommended.
export type SkillChoice = { code: string; label: string; sample: string };

export function sessionChoices(playerId: string, schoolYear: number, stretch: boolean, now: number, subject: Subject = 'maths'): SkillChoice[] {
  const states = buildStates(playerId, schoolYear, subject);
  const target = stretch ? STRETCH_TARGET : TARGET_SUCCESS;
  const { scores } = selectItem(states, {
    now,
    previousCode: null,
    recentCodes: repo.recentAttemptSkillCodes(playerId, 8),
    rand: Math.random,
    target: stretch ? STRETCH_TARGET : undefined,
    seedGrade: seedGradeFor(schoolYear),
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

type Picked = { pick: SelState; novel: boolean; level: number; scores: unknown; introduced: boolean };

// The selection core — buildStates → selectItem → the chosen skill and display
// flags — shared by the server-generated path (nextItem) and the client-generated
// path (issueNext), so the ADAPTIVE SELECTOR behaves identically on both and there
// is no second implementation to drift (input-timing Phase A invariant).
function pickNext(playerId: string, schoolYear: number, now: number, opts: NextOpts): Picked {
  const ability = repo.abilities(playerId);
  const recentCodes = repo.recentAttemptSkillCodes(playerId, 8);
  const previousCode = recentCodes[0] ?? null;
  // Warm-up (onboarding-ramp §2) overrides the target and suppresses the chooser;
  // otherwise stretch (0.65) or the player's honest base target (start-from-below).
  const warmup = opts.warmupTarget != null;
  const target = warmup ? opts.warmupTarget : opts.stretch ? STRETCH_TARGET : opts.baseTarget;

  // A mixed session interleaves several subjects; a normal session has exactly one. The
  // ordering up-weights the lagging subject AND is the eligibility-fallback order: try each
  // subject's in-band pick in turn, take the first that yields one. With a single subject the
  // loop runs once, byte-identical to the pre-mixed selector.
  const activeSubjects = opts.subjects && opts.subjects.length > 1 ? opts.subjects : [opts.subject ?? 'maths'];
  const order = orderSubjectsForNext(recentCodes, activeSubjects, Math.random);

  let pick: SelState | undefined;
  let scores: unknown;
  let introduced = false;
  let firstStates: SelState[] | undefined;
  let chosenStates: SelState[] | undefined;

  for (const subject of order) {
    const states = buildStates(playerId, schoolYear, subject); // subject-scoped pool
    if (!firstStates) firstStates = states;
    const unlocked = computeUnlocked(states);
    // The child's session-start choice serves as the first item, if still eligible — but only
    // within its own subject.
    if (!warmup && opts.chosenCode && unlocked.get(opts.chosenCode)) {
      const c = states.find((s) => s.code === opts.chosenCode);
      if (c) { pick = c; chosenStates = states; break; }
    }
    const r = selectItem(states, {
      now,
      previousCode,
      recentCodes,
      rand: Math.random,
      target,
      peakEnd: warmup ? false : opts.peakEnd,
      // Reach-up never fires during warm-up or on the peak-end item — the opening
      // must stay easy and the session must end on a sure win.
      reachUp: warmup || opts.peakEnd ? false : opts.reachUp,
      seedGrade: seedGradeFor(schoolYear),
    });
    scores = r.scores;
    introduced = r.introduced;
    if (r.chosen) { pick = r.chosen; chosenStates = states; break; }
  }
  // Nothing in-band in any active subject → the floor of the first subject (unchanged fallback).
  if (!pick) { pick = firstStates!.find((s) => s.requires.length === 0)!; chosenStates = firstStates; }
  const states = chosenStates!;

  // "Något nytt" marks a genuinely new unlock, not the session-1 flood where every
  // skill is new. Only cue it once the player is past their first burst.
  const novel = (ability.get(pick.code)?.last_seen_at ?? null) === null && repo.totalAttempts(playerId) >= 15;
  const unlocked = computeUnlocked(states);
  const unlockedCount = states.filter((s) => unlocked.get(s.code)).length;
  const level = Math.max(1, Math.min(8, Math.round((unlockedCount / states.length) * 8)));
  return { pick, novel, level, scores, introduced };
}

export function nextItem(playerId: string, schoolYear: number, now: number, opts: NextOpts = {}): NextItem {
  const { pick, novel, level, scores, introduced } = pickNext(playerId, schoolYear, now, opts);
  const warmup = opts.warmupTarget != null;
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
// Render a graded answer to a readable string for the question log — for a spelling item, the word.
function answerText(a: unknown): string {
  if (a == null) return '';
  if (typeof a === 'string' || typeof a === 'number') return String(a);
  if (typeof a === 'object') {
    const o = a as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (o.value != null) return String(o.value);
  }
  return JSON.stringify(a);
}

// Log a resolved wrong/idk answer with the QUESTION rebuilt from its seed (deterministic), so a
// broken generated item is inspectable, not hidden behind an opaque seed. Callers exclude warm-up.
// Wrapped so a logging failure can never break the grade path.
function logFailedQuestion(playerId: string, code: string, seed: number, given: string | null, idk: boolean, now: number, prebuilt?: ReturnType<typeof buildItem>): void {
  try {
    const it = prebuilt ?? buildItem(code, seed);
    const item = it as { prompt?: string; answer?: unknown; choice?: unknown; steps?: unknown };
    repo.logWrongQuestion({
      playerId,
      skillCode: code,
      subject: SKILL_META.get(code)?.subject ?? null,
      seed,
      prompt: item.prompt ?? '',
      answer: answerText(item.answer),
      given: idk ? null : given,
      dontKnow: idk,
      detail: JSON.stringify({ answer: item.answer, choice: item.choice, steps: item.steps }),
      at: now,
    });
  } catch {
    /* diagnostics must never break grading */
  }
}

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

  // Timing void (#3): an item open past the stale threshold was interrupted, not
  // solved. Discard it — write NO attempt — so its contaminated latency never
  // lands in the rate/transfer data, and hand the client a fresh item ('expired'
  // is exactly what it already re-fetches on). The session counter is untouched:
  // a discarded item never counted, so nothing double-counts on resume.
  if (now - p.served_at > TIMING_STALE_MS) {
    repo.deletePendingItem(itemId);
    return { status: 'expired' };
  }

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
    sessionRunId: sessionId ?? null,
  });
  repo.deletePendingItem(itemId);

  // Diagnostics: a resolved wrong/idk answer → log the rebuilt question (never warm-up).
  if (finalCorrect === 0 && !warmup) logFailedQuestion(playerId, p.skill_code, p.seed, given, idk, now);

  // A card is the first problem of this kind the child ever solved (§3.4).
  // Silent — it goes to the shelf, no notification. Downstream of the model.
  if (finalCorrect === 1 && repo.insertCardIfFirst(playerId, p.skill_code, attemptId, now)) {
    repo.appendUsageEvent(playerId, 'card_earned', p.skill_code, now); // §4.3
  }

  // WS III-a shadow detector — invisible; notes when a mastered skill looks fluency-ready.
  repo.recordShadowFluency(playerId, p.skill_code, now);
  repo.recordRecogShadow(playerId, p.skill_code, now); // D1: recognition-rung shadow (invisible)

  // The session counter advances on every resolved item, "vet inte" included.
  const session = sessionId != null ? advanceSession(playerId, sessionId, now) : undefined;

  if (finalCorrect === 1) return { status: 'correct', session };
  return { status: 'revealed', steps: JSON.parse(p.steps_json) as string[], session };
}

// Advance the session counter and, on completion, fire the completion side effects
// (usage event, cat allocation set BEFORE the goal check so a cat genuinely costs
// the residual goal a session, family-goal check). Shared by the pending-item path
// (answer) and the client-generated path (sessionAnswer) so both are identical.
function advanceSession(playerId: string, sessionId: number, now: number): SessionProgress {
  const run = repo.bumpSessionRun(sessionId, now);
  const session = { completed: run.completed, target: run.target, done: run.ended_at != null };
  // The session counts as STARTED only now, on its first answered item (§4.3) — not
  // when it was merely opened — so an accidental open never registers as a session.
  if (run.completed === 1) repo.appendUsageEvent(playerId, 'session_started', null, now);
  if (session.done) {
    repo.appendUsageEvent(playerId, 'session_ended', 'completed', now);
    const player = repo.playerById(playerId);
    if (player) {
      const shared = rewardState(player.family_id, playerId).sharedTarget; // this child's own default
      repo.setAllocation(sessionId, playerId, player.family_id, shared.kind, shared.id, now);
    }
    checkFamilyGoal(playerId, now);
  }
  return session;
}

// When a session completes, a family goal may be reached — cooperative, in
// sessions, no per-child contribution stored (§4.1).
function checkFamilyGoal(playerId: string, now: number): void {
  const player = repo.playerById(playerId);
  if (!player) return;
  const goal = repo.getGoal(player.family_id);
  if (!goal || goal.reached_at != null) return;
  // Log the family-wide count crossing (never which child — §4.1), then, if the
  // target is met, mark reached (which logs the 'reached' event). The count is the
  // RESIDUAL — sessions directed to a cat don't count toward the goal.
  const count = repo.familyGoalProgress(player.family_id, goal.created_at, goal.carry_offset);
  repo.appendGoalEvent(player.family_id, goal.label, goal.target, 'progressed', count, now);
  if (count >= goal.target) repo.markGoalReached(player.family_id, now);
}

// ── Client-generated path (input-timing Phase A) ────────────────────────────
// The server issues (code, seed); the client builds the SAME item via the shared
// buildItem and measures the interval locally; the server re-generates from the
// seed to grade authoritatively and stores the client interval verbatim. No prompt
// is generated or stored server-side, no per-item pending_item write.

export type IssuedItem = {
  code: string;
  seed: number; // server-issued (no client fishing)
  family: string;
  answerLength: number; // digit count, for sprint auto-submit
  novel: boolean;
  level: number;
  warmup: boolean; // was this served under the warm-up ramp (client echoes it back on answer)
};

export function issueNext(playerId: string, schoolYear: number, now: number, opts: NextOpts = {}): IssuedItem {
  // WS III burst (B0, SHADOW, test family only): a burst may drive the next item's skill — a short
  // consecutive run of one mastered skill, silently timed. It never changes the answer path or the
  // client; when no burst is active/ready this is a no-op and selection is unchanged.
  if (opts.sessionId != null) {
    const burstCode = nextBurstCode(playerId, opts.sessionId, schoolYear, now, {
      warmupTarget: opts.warmupTarget,
      peakEnd: opts.peakEnd,
      remaining: opts.remaining ?? 0,
    });
    if (burstCode) {
      const meta = SKILL_META.get(burstCode)!;
      const seed = meta.subject !== 'maths' ? nextSpellingWord(playerId, burstCode, 'practice') : randomSeed();
      return { code: burstCode, seed, family: meta.family, answerLength: answerLengthOf(burstCode, seed), novel: false, level: 0, warmup: false };
    }
  }
  const { pick, novel, level } = pickNext(playerId, schoolYear, now, opts);
  // Word choice is downstream of skill selection (A11): the selector picked `pick.code`;
  // for a spelling skill the PROVIDER now picks the seed (an unseen practice word), else a
  // random seed as before. issueNext is the practice path → phase 'practice'.
  const seed = SKILL_META.get(pick.code)?.subject !== 'maths' ? nextSpellingWord(playerId, pick.code, 'practice') : randomSeed();
  return { code: pick.code, seed, family: pick.family, answerLength: answerLengthOf(pick.code, seed), novel, level, warmup: opts.warmupTarget != null };
}

// The A13/A14 content-side item provider: choose the seed encoding an UNSEEN word from the
// right pool (practice vs holdout by phase) for this child. Strictly downstream of skill
// selection — the selector never reasons about words. On exhaustion (A14) it recycles the
// least-recently-seen word (spacing). NOTE: holdout exhaustion would ideally mark the skill
// measurement-complete and let it leave the eligible pool via the existing fluent-drop, but
// that needs the eligibility layer to reason about word-state — an A11 boundary — so it is
// FLAGGED and deferred; recycling keeps the sprint flow safe until that's designed.
export function nextSpellingWord(playerId: string, code: string, phase: SpellingPhase): number {
  const pool = SPELLING_POOLS[code];
  if (!pool || !pool[phase].length) return randomSeed();
  const words = pool[phase];
  const seen = repo.spellingSeenWords(playerId, code);
  const unseen = words.map((w, i) => ({ w, i })).filter((x) => !seen.has(x.w));
  if (unseen.length) return encodeSpellingSeed(phase, unseen[Math.floor(Math.random() * unseen.length)].i);
  let lru = { i: 0, at: Infinity };
  words.forEach((w, i) => { const at = seen.get(w) ?? 0; if (at < lru.at) lru = { i, at }; });
  return encodeSpellingSeed(phase, lru.i);
}

// The per-item selection options (target, reach-up, peak-end, warm-up ramp/retreat)
// for a session — the exact logic /api/next used, extracted so the issue and answer
// endpoints share ONE implementation and the selector can't diverge between paths.
export type SessionPlayer = { id: string; school_year: number; stretch: number };

export function sessionSelectOpts(player: SessionPlayer, sessionId: number | undefined, now: number, chosenCode?: string): NextOpts {
  const completed = repo.completedSessionCount(player.id);
  const maxVol = repo.maxVolatility(player.id);
  const baseTarget = playerTarget(completed, maxVol);
  const recentAcc = repo.recentOverallFirstTryAccuracy(player.id, 12);
  const trivialProp = repo.recentTrivialProportion(player.id, 12);
  const reachUpProb = reachUpProbability(recentAcc, maxVol, trivialProp, repo.lastTwoMissed(player.id));
  const coasting = reachUpProb > 0;
  const reachUp = Math.random() < reachUpProb;

  let peakEnd = false;
  let warmupTarget: number | undefined;
  let subject: Subject = 'maths';
  let subjects: Subject[] | undefined;
  let remaining: number | undefined;
  if (sessionId != null) {
    const run = repo.sessionRunById(sessionId);
    if (run && run.player_id === player.id && run.ended_at == null) {
      subject = run.subject; // the primary subject (= subjects[0])
      // A MIXED Öva carries the active SET; the selector interleaves them (increment 1). A
      // single-subject session leaves run.subjects NULL and stays scalar, byte-identical.
      subjects = run.subjects ? (JSON.parse(run.subjects) as Subject[]) : undefined;
      peakEnd = run.completed === run.target - 1;
      remaining = run.target - run.completed; // items left, for the burst fits-the-session guard
      const ramp = rampLen(completed, run.target);
      if (run.completed < ramp) {
        warmupTarget = repo.lastTwoMissed(player.id) ? RAMP_FLOOR_P : rampTargetP(run.completed, ramp, baseTarget);
      } else if (repo.lastTwoMissed(player.id) && !coasting) {
        warmupTarget = RAMP_FLOOR_P;
      }
    }
  }
  return { stretch: player.stretch === 1, chosenCode, peakEnd, warmupTarget, baseTarget, reachUp, subject, subjects, sessionId, remaining };
}

export type SessionAnswerResult =
  | { status: 'retry' }
  | { status: 'correct' | 'revealed'; steps: string[]; session?: SessionProgress; next: IssuedItem | null };

// A1: idempotent on idemKey; grades authoritatively by re-generating from the seed;
// first-try-wrong returns retry and records NOTHING (identical to the pending flow);
// else records ONE attempt with the CLIENT interval and the client-tracked tries;
// then RECORDS-THEN-SELECTS (the attempt is already in the cache via the fast path)
// so the unchanged selector reacts to this very answer; returns the next (code, seed).
export function sessionAnswer(
  player: SessionPlayer,
  sessionId: number | undefined,
  code: string,
  seed: number,
  given: string | null,
  idk: boolean,
  tries: number,
  warmup: boolean,
  intervalMs: number,
  idemKey: string,
  now: number,
): SessionAnswerResult {
  const playerId = player.id;
  const it = buildItem(code, seed);
  const correct = !idk && grade(given ?? '', it.answer);
  const already = repo.attemptExistsByIdemKey(idemKey);

  // First-try wrong (not "vet inte"): one retry, record nothing — exactly today's
  // pending-flow semantics, so the ability model still sees a single resolved attempt.
  if (!already && !idk && !correct && tries <= 1) {
    return { status: 'retry' };
  }

  let session: SessionProgress | undefined;
  if (!already) {
    const features = extractFeatures(code, it.prompt, it.answer);
    const itemJson = JSON.stringify({ prompt: it.prompt, seed, features, features_version: FEATURES_VERSION, warmup, tries });
    const attemptId = repo.appendAttempt({
      playerId,
      skillCode: code,
      itemJson,
      given: idk ? null : given,
      correct: correct ? 1 : 0,
      tries: idk ? 0 : tries,
      dontKnow: idk,
      warmup,
      latencyMs: intervalMs, // CLIENT-measured render→capture; never a server round-trip
      at: now,
      idemKey,
      sessionRunId: sessionId ?? null,
    });
    if (correct && repo.insertCardIfFirst(playerId, code, attemptId, now)) {
      repo.appendUsageEvent(playerId, 'card_earned', code, now);
    }
    // Diagnostics: a resolved wrong/idk answer → log the rebuilt question (never warm-up).
    if (!correct && !warmup) logFailedQuestion(playerId, code, seed, given, idk, now, it);
    // WS III-a shadow detector — invisible; notes when a mastered skill looks fluency-ready.
    repo.recordShadowFluency(playerId, code, now);
    repo.recordRecogShadow(playerId, code, now); // D1: recognition-rung shadow (invisible)
    // WS III burst (B0, SHADOW): if this resolved answer belongs to an active burst run, advance it
    // and, on completion, record its silent measurement. Awards nothing; ignored when no run active.
    if (sessionId != null) settleBurstOnAnswer(playerId, sessionId, code, player.school_year, now);
    session = sessionId != null ? advanceSession(playerId, sessionId, now) : undefined;
  } else if (sessionId != null) {
    const run = repo.sessionRunById(sessionId);
    if (run) session = { completed: run.completed, target: run.target, done: run.ended_at != null };
  }

  const done = session?.done ?? false;
  const next = done ? null : issueNext(playerId, player.school_year, now, sessionSelectOpts(player, sessionId, now));
  return { status: correct ? 'correct' : 'revealed', steps: it.steps, session, next };
}

// Test-only: read the stashed answer for a pending item (the client never can).
export function __peekPendingAnswer(itemId: string): string | undefined {
  return repo.getPendingItem(itemId)?.answer;
}
