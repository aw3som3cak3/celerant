import { predict } from '@/model/elo';

// Item selection (brief §6, addendum §7). This is where the pedagogy lives.
// Chess Elo pairs at p ≈ 0.5; we deliberately target 0.80. We also interleave
// (penalise recent skills), space (surface overdue ones), and gate unlocks on
// prerequisite fluency, not merely accuracy.

const DAY_MS = 24 * 3600 * 1000;
const TARGET_SUCCESS = 0.8;

// Frontier introduction (see selectItem). A strict argmax on |p − 0.80| never
// serves a freshly-unlocked skill seeded far below the target — its distance
// penalty (up to ~0.6) dwarfs the 0.35 spacing term, so it is structurally
// invisible however long the child practices. That would strand a placed child
// at their frontier tier forever. So a small, bounded fraction of items is a
// reserved "introduction" slot that serves the neglected frontier directly,
// taken ONLY when the child is coasting. This does not touch the 0.80 target or
// the aim; a miss on an introduced item lands on the worked-solution reveal,
// which is where instruction for a genuinely new skill belongs (brief §2).
const INTRO_PROB = 0.15; // share of items given to introduction, when coasting
const INTRO_ACC_GATE = 0.8; // only introduce when recent success is at least this
const INTRO_P_CEILING = 0.6; // "neglected" = eligible but below this success prob

// Fluency evidence for a component, three-valued (addendum §7). `unknown` is
// distinct from a low measured/provisional value: it means nothing has been
// measured or seeded, which is only possible before placement has run.
export type RateEvidence =
  | { source: 'measured'; value: number }
  | { source: 'provisional'; value: number }
  | { source: 'unknown' };

export type SelState = {
  code: string;
  family: string;
  year: number;
  mode: 'component' | 'compound';
  skillId: number;
  theta: number;
  lastSeenAt: number | null;
  requires: string[];
  rate: RateEvidence; // child's fluency evidence for this skill
  aim: number | null; // fluency aim for this skill, or null
  volatility?: number; // Glicko-2 σ — erratic answering, the accuracy side of fluency
};

// A skill whose θ swings between mastery and misses is not yet fluent, distinct
// from "low ability": two children at the same accuracy, one steady and one
// erratic, differ, and only the steady one is ready to advance. This complements
// the sprint rate from the accuracy side (instrumentation.md §3). A GUESS; see
// README. Seeded volatility (0.06) is well under it, so it only ever blocks a
// genuinely unstable skill.
const VOL_GATE = 0.15;

export type SkillScore = {
  code: string;
  unlocked: boolean;
  eligible: boolean;
  p: number;
  decay: number;
  recency: number;
  score: number;
};

// A skill is "fluent enough to unlock what follows it" only if it is a compound
// (fluency does not apply) OR its rate — measured or provisional — meets its
// aim. Every branch is explicit on the evidence source; `unknown` is a bug,
// because a prerequisite should never be evaluated before placement seeds it.
function componentFluent(s: SelState): boolean {
  if (s.mode === 'compound') return true;
  // Epsilon compare: a provisional rate seeded at the aim, or a measured rate
  // that lands exactly on it, must not have the gate flip on IEEE-754 ordering.
  const EPS = 1e-9;
  const steady = (s.volatility ?? 0) <= VOL_GATE; // not erratic on this skill
  switch (s.rate.source) {
    case 'measured':
      // Latest sprint. A single sprint below aim drops the skill.
      return s.aim != null && s.rate.value >= s.aim - EPS && steady;
    case 'provisional':
      // Seeded at (or below) the aim from the child's school year.
      return s.aim != null && s.rate.value >= s.aim - EPS && steady;
    case 'unknown':
      throw new Error(
        `fluency gate reached '${s.code}' with an unknown rate: placement did not run for this child`,
      );
  }
}

// Spacing term. Rises with days since last seen, but a well-known skill (high θ,
// i.e. high predicted success) has a long memory half-life and decays slowly.
// Shape after Settles & Meeder's half-life regression; constants are ours.
function decay(s: SelState, now: number): number {
  const daysSince = s.lastSeenAt == null ? 3 : (now - s.lastSeenAt) / DAY_MS;
  const halfLife = Math.min(60, Math.max(0.5, Math.pow(2, s.theta)));
  const retrievability = Math.pow(2, -daysSince / halfLife);
  return 1 - retrievability;
}

// Interleaving term. 1.0 if the skill appeared in the last 3 items, tapering to
// 0 by 8. recentCodes is newest-first.
function recency(code: string, recentCodes: string[]): number {
  const idx = recentCodes.indexOf(code);
  if (idx === -1) return 0;
  if (idx < 3) return 1;
  if (idx >= 8) return 0;
  return (8 - idx) / 5;
}

// Which skills are unlocked, by code. Exposed for sprint eligibility, which must
// use the exact same gate as selection.
//
// The gate is transitive: a skill unlocks only when every prerequisite is
// itself unlocked AND accurate (theta >= 0, i.e. predicted success ≥ 50%) AND
// — if a component — fluent
// (rate >= aim). Transitivity matters because cold start seeds theta for every
// skill (including compounds) from the child's school year; a purely direct-
// requires check would let a two-levels-up compound slip past the component-
// fluency gate that the addendum (§7) intends to bite. It also prevents the
// nonsense of a harder variant unlocking before its simpler prerequisite.
export function computeUnlocked(states: SelState[]): Map<string, boolean> {
  const byCode = new Map(states.map((s) => [s.code, s]));
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  const isUnlocked = (code: string): boolean => {
    const cached = memo.get(code);
    if (cached !== undefined) return cached;
    if (visiting.has(code)) return false; // cycle guard; the graph is validated acyclic
    visiting.add(code);
    const s = byCode.get(code);
    const u =
      !!s &&
      s.requires.every((r) => {
        const req = byCode.get(r);
        if (!req) return false;
        return isUnlocked(r) && req.theta >= 0 && componentFluent(req);
      });
    visiting.delete(code);
    memo.set(code, u);
    return u;
  };

  const out = new Map<string, boolean>();
  for (const s of states) out.set(s.code, isUnlocked(s.code));
  return out;
}

export type SelectOptions = {
  now: number;
  previousCode: string | null; // the immediately previous skill, never repeated
  recentCodes: string[]; // newest first, for interleaving
  rand: () => number;
  // Opt-in frontier introduction. Omitted -> pure §6 selection (used by the
  // acceptance simulation, which must see the unmodified 0.80 behaviour).
  introduce?: { recentAccuracy: number };
  // The child's "svårare" toggle shifts the success target (motivation §3.2).
  target?: number;
  // Peak-end (motivation §3.3): item 20 of 20 serves the highest-p eligible
  // skill, ignoring interleaving, so a session never ends in failure.
  peakEnd?: boolean;
};

export type SelectResult = { chosen: SelState | null; scores: SkillScore[]; introduced: boolean };

export function selectItem(states: SelState[], opts: SelectOptions): SelectResult {
  const byCode = new Map(states.map((s) => [s.code, s]));
  const unlockedMap = computeUnlocked(states);
  const target = opts.target ?? TARGET_SUCCESS;

  const scores: SkillScore[] = states.map((s) => {
    const isUnlocked = unlockedMap.get(s.code) ?? false;
    const isEligible = isUnlocked && s.code !== opts.previousCode;
    const p = predict(s.theta);
    const d = decay(s, opts.now);
    const r = recency(s.code, opts.recentCodes);
    const score = -Math.abs(p - target) + 0.35 * d - 0.5 * r + 0.05 * opts.rand();
    return { code: s.code, unlocked: isUnlocked, eligible: isEligible, p, decay: d, recency: r, score };
  });

  let best: SkillScore | null = null;
  for (const sc of scores) {
    if (!sc.eligible) continue;
    if (!best || sc.score > best.score) best = sc;
  }

  // Peak-end: the last item of a session is the highest-p eligible skill (not a
  // manufactured gimme). Overrides interleaving and introduction.
  if (opts.peakEnd) {
    let peak: SkillScore | null = null;
    for (const sc of scores) {
      if (!sc.eligible) continue;
      if (!peak || sc.p > peak.p) peak = sc;
    }
    if (peak) return { chosen: byCode.get(peak.code)!, scores, introduced: false };
  }

  // Reserved introduction slot: when the child is coasting, occasionally serve
  // the best-scored eligible skill the 0.80 argmax is neglecting (a frontier
  // skill below the success ceiling that `best` did not pick). Bounded by
  // INTRO_PROB and gated on recent accuracy so a struggling child is left alone.
  if (opts.introduce && best && opts.introduce.recentAccuracy >= INTRO_ACC_GATE && opts.rand() < INTRO_PROB) {
    let introBest: SkillScore | null = null;
    for (const sc of scores) {
      if (!sc.eligible || sc.code === best.code) continue;
      if (sc.p >= INTRO_P_CEILING) continue;
      if (!introBest || sc.score > introBest.score) introBest = sc;
    }
    if (introBest) return { chosen: byCode.get(introBest.code)!, scores, introduced: true };
  }

  return { chosen: best ? byCode.get(best.code)! : null, scores, introduced: false };
}
