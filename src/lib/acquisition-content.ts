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
  | 'x10_plus_x2'
  // ── bridging-through-10 (the second derivational domain, same faded-scaffold shape) ──
  | 'make_ten_add' // 8 + 5 → 8 + 2 = 10, + 3 = 13
  | 'make_ten_sub' // 14 − 6 → 14 − 4 = 10, − 2 = 8
  // ── generic rule domains (division / 2-digit / negatives / decimals / fractions) ──
  | 'div_inverse_mult' // 56 / 8 → 8 × ? = 56 → 7   (shared by every div_table_t)
  | 'mf_inverse_div'; // 7 × □ = 63 → 63 / 7 → 9

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

// ── SECOND DOMAIN · bridging-through-10 addition/subtraction (spec §4 "later slices") ────────
//
// The same faded-scaffold pedagogy as multiplication, on the ADDITIVE seam the child meets first:
// crossing ten by MAKING TEN. 8 + 5 is not a fact to memorise — it is derived from two she owns,
// the bond to ten (8 + 2) and the leftover (10 + 3). The shape is identical to a multiplication
// derivation, with ONE structural difference: a sum/difference is not recoverable from its answer
// (13 could be 8+5 or 9+4), so the instance's BOTH operands are parsed from the built item's
// prompt rather than divided out of the answer. That is why additive derivations carry their own
// type and their substeps take (a, b), not the single multiplier b.
//
// Kept in a SEPARATE array/type from DERIVATIONS so the multiplication slice is byte-for-byte
// untouched (its tests iterate DERIVATIONS and read d.table / d.substeps(b)); the two are merged
// only at the lookup helpers below, which every consumer already goes through.
export type AdditiveDerivation = {
  id: StrategyId;
  code: string; // the skill this derives — 'add_cross_10' | 'sub_cross_10'
  op: '+' | '−'; // U+2212 for subtraction, matching the generator's prompt
  // Every skill whose fluency the strategy ASSUMES (spec §2.2, invariant 3): the bond to ten
  // (missing_addend_10 — "8 + □ = 10") and the single-digit op she splits/recombines with. Both
  // sit at/below year 1, so a child who lacks them is dropped lower by the graph, never scaffolded.
  inputs: string[];
  // The L0 walk for `a op b`, EXCLUDING the target (2 steps: make ten, then add/subtract the rest).
  substeps: (a: number, b: number) => SubStep[];
  // The L1 partial — the make-ten decomposition already done, one operation left.
  partial: (a: number, b: number) => string;
  // The pivot number filled to/from ten, for the L2 hint (the number the make-ten acts on).
  pivot: (a: number, b: number) => number;
};

export const ADDITIVE_DERIVATIONS: AdditiveDerivation[] = [
  {
    id: 'make_ten_add', code: 'add_cross_10', op: '+', inputs: ['add_within_10', 'missing_addend_10'],
    // Fill the LARGER operand to ten (the smaller bump), then add the leftover. rem = a+b−10 > 0
    // and the complement c = 10−hi < lo, so both steps land inside add_within_10 (invariant 3).
    substeps: (a, b) => {
      const hi = Math.max(a, b), c = 10 - hi, rem = a + b - 10;
      return [PLUS(hi, c), PLUS(10, rem)];
    },
    partial: (a, b) => `${a} + ${b} = 10 + ${a + b - 10} =`,
    pivot: (a, b) => Math.max(a, b),
  },
  {
    id: 'make_ten_sub', code: 'sub_cross_10', op: '−', inputs: ['sub_within_10', 'missing_addend_10'],
    // Subtract DOWN to ten first (take the minuend's ones off), then subtract what's left of b.
    // ones = a−10 ∈ [1,8]; the generator guarantees a−b < 10, i.e. b > ones, so rem2 = b−ones > 0
    // and 10 − rem2 ≥ 1 — every step is a real sub_within_10 fact.
    substeps: (a, b) => {
      const ones = a - 10, rem2 = b - ones;
      return [MINUS(a, ones), MINUS(10, rem2)];
    },
    partial: (a, b) => `${a} − ${b} = 10 − ${b - (a - 10)} =`,
    pivot: (a) => a,
  },
];

export const ADDITIVE_BY_STRATEGY = new Map(ADDITIVE_DERIVATIONS.map((d) => [d.id, d]));
export const ADDITIVE_BY_CODE = new Map<string, AdditiveDerivation[]>();
for (const d of ADDITIVE_DERIVATIONS) {
  const list = ADDITIVE_BY_CODE.get(d.code) ?? [];
  list.push(d);
  ADDITIVE_BY_CODE.set(d.code, list);
}

// ── GENERIC RULE DERIVATIONS (division, 2-digit place value, negatives, decimals, fractions) ──
//
// A THIRD structure, deliberately separate from DERIVATIONS (multiplication) and
// ADDITIVE_DERIVATIONS (bridging) so both earlier slices stay byte-for-byte untouched. Where those
// two carry domain-specific shapes (a table `b`; an operator `op` + two operands), the remaining
// maths domains each parse a differently-shaped prompt, so each derivation OWNS its parse: `build`
// reads the built item and returns the L0 walk + the L1 partial, or null when the item doesn't fit
// (the same "fall back to the bare item, child never stuck" contract as buildAdditiveScaffold).
//
// One strategy id may be SHARED across many codes (e.g. every div_table_t is `div_inverse_mult`):
// buildScaffold disambiguates by (code, strategy), and hintFor/STRATEGY_COPY need only ONE entry
// per id. `pivot` is the single number the L2 hint speaks about (a divisor, a rounded subtrahend);
// it is meaningless for sign-rule strategies, which pass 0 and render a pivot-free hint.
export type RuleScaffoldParts = { substeps: SubStep[]; partial: string; pivot: number };
export type RuleDerivation = {
  id: StrategyId;
  code: string;
  inputs: string[];
  build: (item: { prompt: string; answer: string }) => RuleScaffoldParts | null;
};

// ── DIVISION · inverse-multiplication (spec gap-map domain 1) ───────────────────────────────
// A division fact is a multiplication fact the child already owns, read backwards: 56 / 8 → "8
// times what is 56?" → 7. The single sub-step reframes ÷ into the × she is fluent on; the fade
// then peels the × frame away until she reads the bare ÷. `div_mixed` has no single-table inverse,
// so it is NOT trained (its own tables are). Every div_table_t shares the one strategy id.
const divInverse = (t: number): RuleDerivation => ({
  id: 'div_inverse_mult', code: `div_table_${t}`, inputs: [`mult_table_${t}`],
  build: (item) => {
    const m = item.prompt.match(/^\s*(\d+)\s*\/\s*(\d+)\s*=/);
    if (!m || Number(m[2]) !== t) return null;
    const dividend = Number(m[1]);
    // The missing-factor form she answers with her × fluency; its answer IS the quotient.
    return { substeps: [{ prompt: `${t} × □ = ${dividend}`, answer: item.answer }], partial: `${t} × □ = ${dividend}`, pivot: t };
  },
});

export const RULE_DERIVATIONS: RuleDerivation[] = [
  ...[2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12].map(divInverse),
  {
    // The missing FACTOR is division read backwards, the mirror of div_table: 7 × □ = 63 → "63
    // shared into 7" → 9. By the time this skill is reached division is fluent (it requires
    // div_mixed), so the reframe lands on a fact she owns.
    id: 'mf_inverse_div', code: 'missing_factor', inputs: ['div_mixed'],
    build: (item) => {
      const m = item.prompt.match(/^\s*(\d+)\D+(\d+)/); // "a × □ = product" → a, product
      if (!m) return null;
      const a = Number(m[1]), product = Number(m[2]);
      return { substeps: [{ prompt: `${product} / ${a} =`, answer: item.answer }], partial: `${product} / ${a} =`, pivot: a };
    },
  },
];

export const RULE_BY_CODE = new Map<string, RuleDerivation[]>();
for (const d of RULE_DERIVATIONS) {
  const list = RULE_BY_CODE.get(d.code) ?? [];
  list.push(d);
  RULE_BY_CODE.set(d.code, list);
}

// Does this skill have a derivation at all? (Multiplication, bridging-through-10, or a rule domain.)
export function hasDerivation(code: string): boolean {
  return DERIVATIONS_BY_CODE.has(code) || ADDITIVE_BY_CODE.has(code) || RULE_BY_CODE.has(code);
}

// The shallowest derivation whose inputs are ALL fluent for this child, or null. `isFluent` is
// the caller's readiness predicate (componentFluent on the selector state) — this module never
// touches player state. Returning null is the readiness VETO: do NOT scaffold; let the graph
// drop lower and serve the missing input instead (invariant 3). Every derivation kind exposes
// `id` + `inputs`, so the trigger reads all three through one signature.
export function pickDerivation(code: string, isFluent: (c: string) => boolean): Derivation | AdditiveDerivation | RuleDerivation | null {
  for (const d of DERIVATIONS_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  for (const d of ADDITIVE_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  for (const d of RULE_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
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
  const item = buildItem(code, seed);
  // Bridging-through-10: the additive domain. Parse BOTH operands from the prompt (the answer
  // alone doesn't determine them) and decompose via make-ten.
  const add = ADDITIVE_BY_STRATEGY.get(strategy);
  if (add) return buildAdditiveScaffold(item, add, strategy);
  // Generic rule domains: look up by CODE (a strategy id may be shared across codes), then the
  // derivation that owns this strategy parses its own prompt.
  const rule = RULE_BY_CODE.get(code);
  if (rule) {
    const d = rule.find((x) => x.id === strategy);
    if (!d) return null;
    const parts = d.build(item);
    // Grade-identical guard: the walk MUST culminate in the item's own answer (invariant 1).
    if (!parts || parts.substeps[parts.substeps.length - 1].answer !== item.answer) return null;
    return { strategy, t: 0, b: parts.pivot, target: item.prompt, answer: item.answer, substeps: parts.substeps, partial: parts.partial };
  }
  const d = BY_STRATEGY.get(strategy);
  if (!d || `mult_table_${d.table}` !== code) return null;
  const answer = Number(item.answer);
  if (!Number.isFinite(answer)) return null;
  const b = answer / d.table;
  if (!Number.isInteger(b)) return null;
  return { strategy, t: d.table, b, target: item.prompt, answer: item.answer, substeps: d.substeps(b), partial: d.partial(b) };
}

// Parse "a op b =" from a built additive item, and decompose it. Returns null on any malformed
// prompt (AcquisitionStage then falls back to the bare item — the child is never left stuck).
function buildAdditiveScaffold(item: { prompt: string; answer: string }, d: AdditiveDerivation, strategy: StrategyId): Scaffold | null {
  const m = item.prompt.match(/^\s*(\d+)\s*([+−])\s*(\d+)\s*=/);
  if (!m || m[2] !== d.op) return null;
  const a = Number(m[1]), b = Number(m[3]);
  const substeps = d.substeps(a, b);
  // Grade-identical guard: the walk MUST land on the item's own answer, or we'd teach a wrong sum.
  if (substeps[substeps.length - 1].answer !== item.answer) return null;
  // t is unused for additive (no table); b carries the pivot the L2 hint speaks about.
  return { strategy, t: 0, b: d.pivot(a, b), target: item.prompt, answer: item.answer, substeps, partial: d.partial(a, b) };
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
    // Bridging: b is the pivot filled to/from ten. Name the make-ten step, never the answer.
    make_ten_add: `${b} + ${10 - b} = 10, sen resten`,
    make_ten_sub: `${b} − ${b - 10} = 10, sen resten`,
    // Division: b is the divisor. Point back to the × table she owns, never the quotient.
    div_inverse_mult: `tänk baklänges: ${b} × ? = talet`,
    mf_inverse_div: `dela istället: talet / ${b}`,
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
    make_ten_add: `${b} + ${10 - b} = 10, then the rest`,
    make_ten_sub: `${b} − ${b - 10} = 10, then the rest`,
    div_inverse_mult: `think ×: ${b} × ? = the number`,
    mf_inverse_div: `divide instead: the number / ${b}`,
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
  make_ten_add: 'Tiokamrat-strategin: fyll upp till tio först. 8 + 5 → 8 + 2 = 10, och 3 kvar → 13. Öva 3–4 stycken tillsammans med en tioram eller fingrarna.',
  make_ten_sub: 'Tiokamrat-strategin baklänges: gå ner till tio först. 14 − 6 → 14 − 4 = 10, och 2 kvar → 8. Öva 3–4 stycken tillsammans.',
  div_inverse_mult: 'Division är multiplikation baklänges: 56 / 8 → tänk "8 gånger vad blir 56?" → 7. Öva 3–4 stycken tillsammans med gångertabellen bredvid.',
  mf_inverse_div: 'Saknad faktor är en division: 7 × □ = 63 → tänk "63 delat med 7" → 9.',
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
