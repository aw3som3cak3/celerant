// ── SCAFFOLDED ACQUISITION — content + pure core (docs/scaffolded-acquisition-spec.md)
//
// THE PRINCIPLE: *teach, don't just test.* When the data shows a fact is UNLEARNED BUT
// DERIVABLE — the child fails/idk's it, yet every sub-fact a known strategy needs is already
// fluent — the engine teaches it in-app with a self-fading derived-fact puzzle instead of
// routing around it (the symmetric partner of cross-subject gating: that one says *don't
// serve what's blocked*, this one says *don't avoid what's ready-but-unlearned*).
//
// This module is PURE and CLIENT-SAFE (no 'server-only', no DB): the derivation table, the
// scaffold builder, and the fade-schedule fold. The client renders a scaffold by calling
// buildScaffold(code, seed, strategy) with the server-issued (code, seed, strategy) — the same
// discipline as buildItem: ONE builder, so the child sees exactly what the server reasons about.
// The server-side trigger, state and ledger flag live in acquisition.ts.

import { buildItem } from './item';

// ── The fade schedule (spec §3) ────────────────────────────────────────────
// L0 full     5 × 7 = ? → 35 + 7 = ? → 6 × 7 = ?   (each sub-step, then the target)
// L1 partial  6 × 7 = 35 + 7 =                      (the decomposition is done; she adds)
// L2 cued     6 × 7 =     (tips: 5 × 7 och en 7 till)
// L3 bare     6 × 7 =                               (= the ordinary retrieval rung)
export const L_FULL = 0;
export const L_PARTIAL = 1;
export const L_CUED = 2;
export const L_BARE = 3; // the ordinary item — served, timed and scored like any other
export const GRADUATED = 4; // acquisition stops firing; the skill is a normal rung again (spec §6)

// Advance/drop (spec §3, open question §9.1). Two clean first-try successes at a level advance
// it; ONE miss/idk drops one level (never below L_FULL). Two, not one, because a single lucky
// answer at L0 does not mean the scaffold can be thinned — and not three, because a child who
// can already do it must not be held at a scaffold she has outgrown (that is its own
// demotivator). The drop is deliberately faster than the climb: failing means the scaffold was
// too THIN, so soften immediately (motivation guardrail — a miss must never punish).
export const CLEAN_TO_ADVANCE = 2;

// Consecutive misses at L_FULL after which the in-app path is judged to have stalled — the
// grownup-alert FALLBACK seam (spec §7). At L0 every sub-step is answerable from a fluent
// input, so repeated failure there means an input we believed fluent isn't really there.
export const STALL_MISSES = 3;

export type StrategyId =
  | 'x2_plus_one'
  | 'x2_double'
  | 'x5_plus_one'
  | 'x5_plus_x2'
  | 'x4_double'
  | 'x2_double_double'
  | 'x10_minus_one'
  | 'x10_plus_one'
  | 'x10_plus_x2';

export type SubStep = { prompt: string; answer: string };

export type Derivation = {
  id: StrategyId;
  table: number; // the times-table this derives
  // Every skill whose fluency the strategy ASSUMES — the readiness check (spec §2.2, invariant
  // 3). Note these include the ADDITION/SUBTRACTION rung the last sub-step needs, not only the
  // easier table: "35 + 7" is a real step, and scaffolding a child who can't do it would hand
  // her a wall one level down. For the ages that meet these tables those rungs sit well below
  // the child's grade seed, so in practice the multiplication input is the one that bites.
  inputs: string[];
  // The L0 walk for t × b, EXCLUDING the target itself (2–3 steps).
  substeps: (b: number) => SubStep[];
  // The L1 partial prompt for t × b — the decomposition already done, one operation left.
  partial: (b: number) => string;
};

const ADD = 'add_2d_carry'; // "35 + 7", "14 + 14" — a two-digit add that may carry
const SUB = 'sub_2d_borrow'; // "70 − 7" — a two-digit subtract that may borrow

const M = (a: number, b: number): SubStep => ({ prompt: `${a} × ${b} =`, answer: String(a * b) });
const PLUS = (a: number, b: number): SubStep => ({ prompt: `${a} + ${b} =`, answer: String(a + b) });
const MINUS = (a: number, b: number): SubStep => ({ prompt: `${a} − ${b} =`, answer: String(a - b) });

// The derivations (spec §4). Doubling is rendered as ADDITION (14 + 14) rather than "× 2": the
// child's ×2 table only covers 2 × 2…12, so "14 × 2" is not actually a fact she owns — the
// double she owns is the sum. Every sub-step below lies inside a declared input skill.
export const DERIVATIONS: Derivation[] = [
  {
    id: 'x2_plus_one', table: 3, inputs: ['mult_table_2', ADD],
    substeps: (b) => [M(2, b), PLUS(2 * b, b)], partial: (b) => `3 × ${b} = ${2 * b} + ${b} =`,
  },
  {
    id: 'x2_double', table: 4, inputs: ['mult_table_2', ADD],
    substeps: (b) => [M(2, b), PLUS(2 * b, 2 * b)], partial: (b) => `4 × ${b} = ${2 * b} + ${2 * b} =`,
  },
  {
    id: 'x5_plus_one', table: 6, inputs: ['mult_table_5', ADD],
    substeps: (b) => [M(5, b), PLUS(5 * b, b)], partial: (b) => `6 × ${b} = ${5 * b} + ${b} =`,
  },
  {
    id: 'x5_plus_x2', table: 7, inputs: ['mult_table_5', 'mult_table_2', ADD],
    substeps: (b) => [M(5, b), M(2, b), PLUS(5 * b, 2 * b)], partial: (b) => `7 × ${b} = ${5 * b} + ${2 * b} =`,
  },
  {
    id: 'x4_double', table: 8, inputs: ['mult_table_4', ADD],
    substeps: (b) => [M(4, b), PLUS(4 * b, 4 * b)], partial: (b) => `8 × ${b} = ${4 * b} + ${4 * b} =`,
  },
  // ×8 fallback when ×4 isn't fluent yet: double-double from ×2 (one step deeper, so it is only
  // chosen when the shallower path's inputs aren't there — see pickDerivation).
  {
    id: 'x2_double_double', table: 8, inputs: ['mult_table_2', ADD],
    substeps: (b) => [M(2, b), PLUS(2 * b, 2 * b), PLUS(4 * b, 4 * b)], partial: (b) => `8 × ${b} = ${4 * b} + ${4 * b} =`,
  },
  {
    id: 'x10_minus_one', table: 9, inputs: ['mult_table_10', SUB],
    substeps: (b) => [M(10, b), MINUS(10 * b, b)], partial: (b) => `9 × ${b} = ${10 * b} − ${b} =`,
  },
  {
    id: 'x10_plus_one', table: 11, inputs: ['mult_table_10', ADD],
    substeps: (b) => [M(10, b), PLUS(10 * b, b)], partial: (b) => `11 × ${b} = ${10 * b} + ${b} =`,
  },
  {
    id: 'x10_plus_x2', table: 12, inputs: ['mult_table_10', 'mult_table_2', ADD],
    substeps: (b) => [M(10, b), M(2, b), PLUS(10 * b, 2 * b)], partial: (b) => `12 × ${b} = ${10 * b} + ${2 * b} =`,
  },
];

export const BY_STRATEGY = new Map(DERIVATIONS.map((d) => [d.id, d]));

// Skill code → its candidate derivations, SHALLOWEST FIRST (open question §9.2: prefer the
// fewest sub-steps among the paths whose inputs are fluent).
export const DERIVATIONS_BY_CODE = new Map<string, Derivation[]>();
for (const d of DERIVATIONS) {
  const code = `mult_table_${d.table}`;
  const list = DERIVATIONS_BY_CODE.get(code) ?? [];
  list.push(d);
  DERIVATIONS_BY_CODE.set(code, list);
}
for (const list of DERIVATIONS_BY_CODE.values()) list.sort((a, b) => a.substeps(7).length - b.substeps(7).length);

// Does this skill have a derivation at all? (The first slice is multiplication tables only —
// bridging-through-10 addition is the same shape and comes later.)
export function hasDerivation(code: string): boolean {
  return DERIVATIONS_BY_CODE.has(code);
}

// The shallowest derivation whose inputs are ALL fluent for this child, or null. `isFluent` is
// the caller's readiness predicate (componentFluent on the selector state) — this module never
// touches player state. Returning null is the readiness VETO: do NOT scaffold; let the graph
// drop lower and serve the missing input instead (invariant 3).
export function pickDerivation(code: string, isFluent: (c: string) => boolean): Derivation | null {
  for (const d of DERIVATIONS_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  return null;
}

export type Scaffold = {
  strategy: StrategyId;
  t: number; // the table
  b: number; // the multiplier of THIS instance
  target: string; // the bare prompt, e.g. "6 × 7 ="
  answer: string; // the canonical answer, identical to buildItem's — the server grades this
  substeps: SubStep[]; // the L0 walk (2–3), excluding the target
  partial: string; // the L1 prompt
};

// Build the faded scaffold for the ITEM (code, seed) — the item the ordinary generator would
// have produced, decomposed. Same (code, seed) → same scaffold on client and server, and its
// `answer` is byte-identical to buildItem's, so grading is completely unchanged.
export function buildScaffold(code: string, seed: number, strategy: StrategyId): Scaffold | null {
  const d = BY_STRATEGY.get(strategy);
  if (!d || `mult_table_${d.table}` !== code) return null;
  const item = buildItem(code, seed);
  const answer = Number(item.answer);
  if (!Number.isFinite(answer)) return null;
  const b = answer / d.table;
  if (!Number.isInteger(b)) return null;
  return { strategy, t: d.table, b, target: item.prompt, answer: item.answer, substeps: d.substeps(b), partial: d.partial(b) };
}

// The L2 cue — a plain-language nudge at the bare fact, in the child's language. Never the
// answer; just the strategy she has been walking for the last few items.
export function hintFor(strategy: StrategyId, b: number, locale: string): string {
  const sv: Record<StrategyId, string> = {
    x2_plus_one: `2 × ${b} och en ${b} till`,
    x2_double: `2 × ${b}, och så dubbelt`,
    x5_plus_one: `5 × ${b} och en ${b} till`,
    x5_plus_x2: `5 × ${b} plus 2 × ${b}`,
    x4_double: `4 × ${b}, och så dubbelt`,
    x2_double_double: `2 × ${b}, dubbelt, och dubbelt igen`,
    x10_minus_one: `10 × ${b} minus en ${b}`,
    x10_plus_one: `10 × ${b} och en ${b} till`,
    x10_plus_x2: `10 × ${b} plus 2 × ${b}`,
  };
  const en: Record<StrategyId, string> = {
    x2_plus_one: `2 × ${b}, and one more ${b}`,
    x2_double: `2 × ${b}, then double it`,
    x5_plus_one: `5 × ${b}, and one more ${b}`,
    x5_plus_x2: `5 × ${b} plus 2 × ${b}`,
    x4_double: `4 × ${b}, then double it`,
    x2_double_double: `2 × ${b}, double, and double again`,
    x10_minus_one: `10 × ${b} minus one ${b}`,
    x10_plus_one: `10 × ${b}, and one more ${b}`,
    x10_plus_x2: `10 × ${b} plus 2 × ${b}`,
  };
  return (locale === 'en' ? en : sv)[strategy];
}

// ── The grownup-alert FALLBACK copy (spec §7) ───────────────────────────────
// The rare exception, not the front line: a child who keeps missing at L0 is missing an input
// we believed fluent, and no thinner scaffold will fix that. Here is the strategy in plain
// parent language, ready for the alert surface.
// TODO(grownup-alert): no surface renders this yet — `stalledAcquisitions()` in acquisition.ts
// is the query it will read. Wire it into the parent view (spec §7) once the in-app path has
// run on real children; until then a stalled skill simply stays at L0 (never punished).
export const STRATEGY_COPY: Record<StrategyId, string> = {
  x2_plus_one: 'Treans tabell byggs från tvåans: 2 × 7 = 14, och sedan en 7 till → 21. Gör 3–4 stycken tillsammans med papper och penna.',
  x2_double: 'Fyrans tabell är tvåans, dubblad: 2 × 7 = 14, och 14 + 14 = 28. Gör 3–4 stycken tillsammans.',
  x5_plus_one: 'Sexans tabell byggs från femmans: 5 × 7 = 35, och sedan en 7 till → 42. Gör 3–4 stycken tillsammans med papper och penna.',
  x5_plus_x2: 'Sjuans tabell är femman plus tvåan: 5 × 7 = 35, 2 × 7 = 14, och 35 + 14 = 49. Gör 3–4 stycken tillsammans.',
  x4_double: 'Åttans tabell är fyrans, dubblad: 4 × 7 = 28, och 28 + 28 = 56. Gör 3–4 stycken tillsammans.',
  x2_double_double: 'Åttans tabell är tvåans, dubblad två gånger: 2 × 7 = 14, 14 + 14 = 28, 28 + 28 = 56.',
  x10_minus_one: 'Nians tabell byggs från tians: 10 × 7 = 70, minus en 7 → 63. Gör 3–4 stycken tillsammans.',
  x10_plus_one: 'Elvans tabell är tians plus en till: 10 × 7 = 70, och en 7 till → 77.',
  x10_plus_x2: 'Tolvans tabell är tian plus tvåan: 10 × 7 = 70, 2 × 7 = 14, och 70 + 14 = 84.',
};

// ── The fade fold (state from the ledger) ──────────────────────────────────
// acquisition_state is a CACHE, exactly like `ability`: the truth is the attempt ledger, where
// every acquisition-managed attempt carries the level it was SERVED at (attempt.acq_level).
// This fold rebuilds the state from those rows, and the live path applies the very same
// transition to one row — so replay and the fast path can never drift.

export type FadeState = {
  level: number; // 0..3 = the fade schedule, 4 = GRADUATED
  clean: number; // consecutive first-try successes at the current level
  l0Misses: number; // consecutive misses while served at L_FULL (the grownup-alert seam)
};

export type AcqOutcomeRow = { acqLevel: number; ok: boolean };

// Whether a resolved attempt counts as a clean success — the SAME rule the θ model scores by
// (score the first response only): right on the first try, and not an "vet inte".
export function isClean(correct: number, tries: number, dontKnow: boolean): boolean {
  return correct === 1 && tries === 1 && !dontKnow;
}

// One transition. `served` is the level the item was actually served at (from the ledger), so a
// state that somehow drifted re-syncs to the ledger instead of compounding the error.
export function applyOutcome(prev: FadeState | null, served: number, ok: boolean): FadeState {
  if (prev && prev.level >= GRADUATED) return prev; // graduation is monotonic — acquisition never re-fires
  const s: FadeState =
    prev == null || prev.level !== served ? { level: served, clean: 0, l0Misses: prev?.l0Misses ?? 0 } : { ...prev };
  if (ok) {
    s.l0Misses = 0;
    s.clean += 1;
    if (s.clean >= CLEAN_TO_ADVANCE) {
      s.level += 1; // L3 + two clean = GRADUATED (spec §6)
      s.clean = 0;
    }
  } else {
    // A miss SOFTENS the scaffold, never punishes: one level down, never below L0.
    s.clean = 0;
    s.l0Misses = s.level === L_FULL ? s.l0Misses + 1 : 0;
    s.level = Math.max(L_FULL, s.level - 1);
  }
  return s;
}

// Fold one skill's acquisition-managed attempts (oldest first) into its fade state.
export function foldFade(rows: AcqOutcomeRow[]): FadeState | null {
  let s: FadeState | null = null;
  for (const r of rows) s = applyOutcome(s, r.acqLevel, r.ok);
  return s;
}

// Has the in-app path stalled for this skill? (The grownup-alert fallback condition, §7.)
export function isStalled(s: FadeState): boolean {
  return s.level === L_FULL && s.l0Misses >= STALL_MISSES;
}
