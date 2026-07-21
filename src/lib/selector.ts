import { predict } from '@/model/elo';

// Item selection (brief §6, addendum §7). This is where the pedagogy lives.
// Chess Elo pairs at p ≈ 0.5; we deliberately target 0.80. We also interleave
// (penalise recent skills), space (surface overdue ones), and gate unlocks on
// prerequisite fluency, not merely accuracy.

const DAY_MS = 24 * 3600 * 1000;
export const TARGET_SUCCESS = 0.8;

// The p-band: how far below/above the success target an item may sit and still be
// served. The gate that makes the target a wall rather than a term (handoff §6,
// fix). ~0.20 → for the 0.80 target the served band is p ∈ [0.60, 1.00]; for a
// new/fragile player on the ~0.90 start-from-below target it tightens to
// [0.70, 1.00], so the floor and the gate agree. A skill outside the band is
// never served — spacing and interleaving rank only within it. The frontier
// introduction slot that used to breach this (serving p < 0.6 neglected skills)
// is removed: an in-band neglected skill now surfaces on its own decay bonus, and
// an out-of-band one waits until the child's θ brings it into the band.
export const P_BAND = 0.2;

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
  seedFluent?: boolean; // did the child's grade SEED grant this component fluency? (the
  // provisional decision, recoverable from grade + skill year). Used to keep a
  // measured rate monotonic-up for unlock — see componentFluent.
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
      // LATENT-BUG FIX (fluency-sprint-wiring, "Option B"). The unlock gate is
      // MONOTONIC-UP under measurement: a real sprint can CONFIRM fluency (rate ≥
      // aim) but must never REVOKE an unlock the seed already granted and the child
      // has since built past. The old line dropped the skill on a single below-aim
      // sprint — which re-locked everything downstream and re-created the exact
      // fragile "accurate but slow" failure the whole design guards against. So:
      // fluent-for-unlock = the SEED's own decision passed (seedFluent), OR the
      // measured rate clears aim. Either way still gated on `steady` (the accuracy /
      // volatility side is untouched, and a sprint never writes volatility). The
      // measured value is still recorded — chart, parent view, later inspection; it
      // simply can't retroactively lock. This changes UNLOCK only: never θ, never
      // the selector's difficulty score (which reads θ, not rate), so a below-aim
      // sprint is inert with respect to what gets served.
      return steady && (s.seedFluent === true || (s.aim != null && s.rate.value >= s.aim - EPS));
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
// `isGrounded` is the GROUND Level-3 seam (GROUND-phase spec §5), and it is DISABLED
// by default: it defaults to always-true, so the gate is byte-for-byte the pre-GROUND
// gate. GROUND runs in shadow — no caller passes a real predicate. To enforce, a
// caller would pass `(code) => grounded(playerId, code)` from ground-gate.ts; that is
// the single, deliberate flip, documented there.
export function computeUnlocked(
  states: SelState[],
  isGrounded: (code: string) => boolean = () => true,
): Map<string, boolean> {
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
      isGrounded(code) && // shadow: always true (see the seam note above)
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
  // The child's "svårare" toggle / start-from-below shift the success target.
  target?: number;
  // Peak-end (motivation §3.3): item 20 of 20 serves the highest-p eligible
  // skill, ignoring interleaving, so a session never ends in failure.
  peakEnd?: boolean;
  // Reach-up (fix-reach-up.md §3): serve the next rung ABOVE the band for a
  // demonstrably coasting child — the upward mirror of the two-miss retreat.
  // Ignored (falls through to normal in-band selection) if there is no above-band
  // skill, i.e. the child is already at his ceiling.
  reachUp?: boolean;
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

  // THE p-BAND GATE (handoff §6). The success target is a WALL, not a term: only
  // skills the child can actually do — |p − target| ≤ P_BAND — are candidates;
  // spacing (decay) and interleaving (recency) rank WITHIN that band and can never
  // drag an above-band (too-hard) skill onto the screen, no matter how overdue or
  // newly unlocked. A skill that's too hard waits until the child's θ rises to
  // meet it (or its θ is re-seeded down). Nothing outside the band is ever served.
  const eligible = scores.filter((s) => s.eligible);
  let pool = eligible.filter((s) => Math.abs(s.p - target) <= P_BAND);

  // Empty band: never serve the least-bad too-hard item. Fall back to the item
  // closest to target from the SAFE side — err too-easy, never too-hard (failing
  // down is safe, failing up is the bug). Too-hard is penalised 3× so it only wins
  // when there is genuinely nothing easier.
  if (pool.length === 0 && eligible.length > 0) {
    const cost = (s: SkillScore) => (s.p >= target ? s.p - target : (target - s.p) * 3);
    pool = [eligible.reduce((best, s) => (cost(s) < cost(best) ? s : best))];
  }

  if (pool.length === 0) return { chosen: null, scores, introduced: false };

  // REACH-UP (fix-reach-up.md §3). A demonstrably coasting child is served the
  // closest skill just ABOVE the band — the next rung, never a leap. "Above the
  // band" in difficulty means p BELOW the lower edge (target − P_BAND), so the
  // next rung is the HIGHEST-p (least hard) of those too-hard skills: he climbs by
  // one rung at a time. This fires only when the caller has already established
  // coasting (reachUpProbability, gated on accuracy + steadiness + trivial share),
  // so it can never reach a fragile kid. If nothing sits above the band he is at
  // his ceiling — fall through to normal in-band ranking. See fix-reach-up.md.
  if (opts.reachUp) {
    const aboveBand = eligible.filter((s) => s.p < target - P_BAND);
    if (aboveBand.length > 0) {
      let rung = aboveBand[0];
      for (const sc of aboveBand) if (sc.p > rung.p) rung = sc;
      return { chosen: byCode.get(rung.code)!, scores, introduced: false };
    }
  }

  // Peak-end: the last item is the highest-p skill IN THE BAND (a real problem she
  // can almost surely do), so a session never ends in failure.
  if (opts.peakEnd) {
    let peak = pool[0];
    for (const sc of pool) if (sc.p > peak.p) peak = sc;
    return { chosen: byCode.get(peak.code)!, scores, introduced: false };
  }

  // Rank within the band: the full score (a mild pull toward target plus spacing
  // and interleaving). Because everything here is already winnable, an overdue
  // in-band skill can win on decay — surfacing spacing — without any too-hard
  // skill ever being reachable.
  let best = pool[0];
  for (const sc of pool) if (sc.score > best.score) best = sc;
  return { chosen: byCode.get(best.code)!, scores, introduced: false };
}
