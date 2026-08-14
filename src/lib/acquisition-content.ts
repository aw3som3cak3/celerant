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
import { T3_PAIRS } from './spelling-content';
import type { ChoicePromptData, ChoiceOption } from './choice';

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
  | 'mf_inverse_div' // 7 × □ = 63 → 63 / 7 → 9
  | 'split_add_2d' // 34 + 25 → 30+20, 4+5, 50+9
  | 'split_add_2d_carry' // 47 + 28 → 40+20, 7+8, 60+15
  | 'split_sub_2d' // 68 − 25 → 60−20, 8−5, 40+3
  | 'split_sub_2d_borrow' // 52 − 27 → 52−30=22, +3 = 25 (compensation)
  | 'neg_minus_minus' // −3 − (−5) → −3 + 5
  | 'neg_mult_same_sign' // (−4) × (−6) → 4 × 6 (same signs → +)
  | 'neg_div_signs' // −48 / 6 → 48 / 6, then negate
  | 'dec_add_tenths' // 2,7 + 1,8 → 27 + 18 tenths → 4,5 (shared no-carry/carry)
  | 'frac_of_qty' // 3/4 of 8 → 8/4, ×3
  | 'frac_equiv_scale' // 2/5 = □/15 → 15/5, ×2
  | 'frac_add_same' // 2/8 + 3/8 → (2+3)/8
  // ── word subjects (rule-application-fade + cue-fade) ──
  | 'sv_double' // spelling_t3 doubling: hear short vowel → double the consonant
  | 'en_irregular_cue' // en_past_irregular: cue-fade whole → gapped → first-letter → dictation
  | 'en_ed_rule'; // en_ed_regular: 3-way branching rule (double / drop-e / add)

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

// ── 2-DIGIT place value · split into tens + ones (spec gap-map domain 2) ─────────────────────
// A 2-digit sum/difference is partial sums: 34 + 25 → 30+20=50, 4+5=9, 50+9=59. Every sub-step is
// a fact she owns (round-tens ± , single-digit ± , the recombine). The carry/borrow variants are
// where this domain CHAINS onto bridging: 47+28's ones make-ten is add_cross_10, and sub-borrow
// uses compensation (round the subtrahend up, give the overshoot back) so every step stays
// no-borrow. Parses "a op b =" from the prompt; `t` here is a helper, not a table.
const parseBin = (prompt: string, op: '+' | '−'): [number, number] | null => {
  const m = prompt.match(/^\s*(\d+)\s*([+−])\s*(\d+)\s*=/);
  return !m || m[2] !== op ? null : [Number(m[1]), Number(m[3])];
};
const tensOf = (n: number) => Math.floor(n / 10) * 10;
// A signed integer parsed from a prompt token — the minus may be U+2212 (as skills.ts renders it)
// or an ASCII hyphen; Number() rejects U+2212, so normalise first.
const intOf = (s: string) => Number(s.replace(/−/g, '-'));
// Render a signed integer the way skills.ts does (U+2212 for the negative), for scaffold prompts.
const sgn = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);
const gcd2 = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
// Format a tenths-COUNT as the canonical decimal string (matches answerToString(dec(t,1))): 45 → "4,5".
const fmtTenths = (t: number) => (t % 10 === 0 ? String(t / 10) : `${Math.floor(t / 10)},${t % 10}`);

export const RULE_DERIVATIONS: RuleDerivation[] = [
  ...[2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12].map(divInverse),
  {
    id: 'split_add_2d', code: 'add_2d_no_carry', inputs: ['add_tens', 'add_within_10'],
    build: (item) => {
      const p = parseBin(item.prompt, '+'); if (!p) return null;
      const [a, b] = p, aT = tensOf(a), bT = tensOf(b), tens = aT + bT, ones = (a % 10) + (b % 10);
      return {
        substeps: [PLUS(aT, bT), PLUS(a % 10, b % 10), PLUS(tens, ones)],
        partial: `${a} + ${b} = ${tens} + ${ones} =`, pivot: 0,
      };
    },
  },
  {
    id: 'split_add_2d_carry', code: 'add_2d_carry', inputs: ['add_tens', 'add_cross_10', 'add_2d_no_carry'],
    build: (item) => {
      const p = parseBin(item.prompt, '+'); if (!p) return null;
      const [a, b] = p, aT = tensOf(a), bT = tensOf(b), tens = aT + bT, ones = (a % 10) + (b % 10);
      // ones may cross ten (→ add_cross_10) or not (a tens-only carry); the walk is the same.
      return {
        substeps: [PLUS(aT, bT), PLUS(a % 10, b % 10), PLUS(tens, ones)],
        partial: `${a} + ${b} = ${tens} + ${ones} =`, pivot: 0,
      };
    },
  },
  {
    id: 'split_sub_2d', code: 'sub_2d_no_borrow', inputs: ['sub_within_10', 'add_tens'],
    build: (item) => {
      const p = parseBin(item.prompt, '−'); if (!p) return null;
      const [a, b] = p, aT = tensOf(a), bT = tensOf(b), tens = aT - bT, ones = (a % 10) - (b % 10);
      return {
        substeps: [MINUS(aT, bT), MINUS(a % 10, b % 10), PLUS(tens, ones)],
        partial: `${a} − ${b} = ${tens} + ${ones} =`, pivot: 0,
      };
    },
  },
  {
    // Borrow via COMPENSATION: round the subtrahend up to a ten, subtract that (no borrow), then
    // add the overshoot back. Borrow ⟹ aT>bT ⟹ a ≥ bRoundUp, so a−bRoundUp is a clean
    // no-borrow subtraction and the add-back never crosses a ten (aO + overshoot < 10). Both
    // sub-steps land inside declared fluent inputs.
    id: 'split_sub_2d_borrow', code: 'sub_2d_borrow', inputs: ['sub_2d_no_borrow', 'add_within_10'],
    build: (item) => {
      const p = parseBin(item.prompt, '−'); if (!p) return null;
      const [a, b] = p, bRoundUp = tensOf(b) + 10, mid = a - bRoundUp, overshoot = bRoundUp - b;
      return {
        substeps: [MINUS(a, bRoundUp), PLUS(mid, overshoot)],
        partial: `${a} − ${b} = ${mid} + ${overshoot} =`, pivot: bRoundUp,
      };
    },
  },
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
  // ── NEGATIVE integers · sign-rule rewrites (spec gap-map domain 3) ─────────────────────────
  // A signed operation becomes the unsigned one she owns, plus a sign rule: (−4)×(−6) → 4×6 with
  // "same signs → plus"; a − (−b) → a + b; a negative quotient → divide the magnitudes, then
  // negate. Both the sub-steps AND the L1 partial must culminate in the SIGNED answer, so a
  // sign-flip domain (neg_div) rewrites the sign explicitly rather than stopping at the magnitude.
  {
    // Subtracting a negative is adding: −3 − (−5) → −3 + 5. Both signs are U+2212 in the prompt.
    id: 'neg_minus_minus', code: 'neg_sub_neg', inputs: ['neg_add_pos'],
    build: (item) => {
      const m = item.prompt.match(/^\s*([-−]?\d+)\s*−\s*\(\s*([-−]?\d+)\s*\)/);
      if (!m) return null;
      const a = intOf(m[1]), b = intOf(m[2]); // b is negative
      return { substeps: [{ prompt: `${sgn(a)} + ${Math.abs(b)} =`, answer: item.answer }], partial: `${sgn(a)} + ${Math.abs(b)} =`, pivot: 0 };
    },
  },
  {
    // Same signs → positive: (−4) × (−6) → 4 × 6. The magnitude product IS the answer (no flip).
    id: 'neg_mult_same_sign', code: 'neg_mult_neg_neg', inputs: ['mult_mixed'],
    build: (item) => {
      const m = item.prompt.match(/^\s*\(\s*([-−]?\d+)\s*\)\s*×\s*\(\s*([-−]?\d+)\s*\)/);
      if (!m) return null;
      const a = intOf(m[1]), b = intOf(m[2]);
      return { substeps: [{ prompt: `${Math.abs(a)} × ${Math.abs(b)} =`, answer: item.answer }], partial: `${Math.abs(a)} × ${Math.abs(b)} =`, pivot: 0 };
    },
  },
  {
    // Different signs → negative (neg_div is ALWAYS a mixed-sign quotient): divide the magnitudes,
    // then negate. The walk ends on 0 − q = −q so the last sub-step is the signed answer, and the
    // L1 partial pulls the minus out first (−(|num| / |den|)) so it too lands on −q, never +q.
    id: 'neg_div_signs', code: 'neg_div', inputs: ['div_mixed'],
    build: (item) => {
      const m = item.prompt.match(/^\s*([-−]?\d+)\s*\/\s*([-−]?\d+)\s*=/);
      if (!m) return null;
      const num = intOf(m[1]), den = intOf(m[2]);
      if (den === 0) return null;
      const q = Math.abs(num) / Math.abs(den);
      if (!Number.isInteger(q)) return null;
      return { substeps: [{ prompt: `${Math.abs(num)} / ${Math.abs(den)} =`, answer: String(q) }, MINUS(0, q)], partial: `−(${Math.abs(num)} / ${Math.abs(den)}) =`, pivot: 0 };
    },
  },
  // ── DECIMALS · read the tenths, add like whole numbers, place the comma (spec gap-map domain 4) ──
  // A tenths sum is a whole-number sum of tenth-COUNTS: 2,7 + 1,8 → 27 tenths + 18 tenths = 45
  // tenths → 4,5. One method covers no-carry (0,3+0,5) and carry (2,7+1,8); each code declares
  // the add its counts need (single-digit vs 2-digit-carry). dec_times_whole is NOT here: its
  // ×-core is frequently multi-digit (a written procedure, not a fluent fact) — see the report.
  ...(['dec_add_same', 'dec_add_carry'] as const).map((code): RuleDerivation => ({
    id: 'dec_add_tenths', code, inputs: code === 'dec_add_same' ? ['add_within_10', 'dec_read_tenths'] : ['add_2d_carry', 'dec_read_tenths'],
    build: (item) => {
      const m = item.prompt.match(/^\s*(\d+),(\d+)\s*\+\s*(\d+),(\d+)\s*=/);
      if (!m) return null;
      const ta = Number(m[1]) * 10 + Number(m[2]), tb = Number(m[3]) * 10 + Number(m[4]), total = ta + tb;
      return {
        substeps: [{ prompt: `${ta} + ${tb} =`, answer: String(total) }, { prompt: `${total} tiondelar =`, answer: fmtTenths(total) }],
        partial: `${item.prompt} ${total} tiondelar =`, pivot: 0,
      };
    },
  })),
  // ── FRACTIONS · the three trainable ones (integer + same-denominator answers) ────────────────
  {
    // "n/d of q": divide by the denominator, multiply by the numerator — exactly the item's own
    // two steps, each a fact she owns.
    id: 'frac_of_qty', code: 'frac_of_quantity', inputs: ['div_mixed', 'mult_mixed'],
    build: (item) => {
      const m = item.prompt.match(/^\s*(\d+)\/(\d+)\s+av\s+(\d+)/);
      if (!m || Number(m[3]) % Number(m[2]) !== 0) return null;
      const n = Number(m[1]), d = Number(m[2]), q = Number(m[3]), part = q / d;
      return { substeps: [{ prompt: `${q} / ${d} =`, answer: String(part) }, { prompt: `${part} × ${n} =`, answer: String(part * n) }], partial: `${part} × ${n} =`, pivot: 0 };
    },
  },
  {
    // Equivalent fraction: how many times bigger is the new denominator, then scale the numerator.
    id: 'frac_equiv_scale', code: 'frac_equivalent', inputs: ['div_mixed', 'mult_mixed'],
    build: (item) => {
      const m = item.prompt.match(/^\s*(\d+)\/(\d+)\s*=\s*□\/(\d+)/);
      if (!m || Number(m[3]) % Number(m[2]) !== 0) return null;
      const n = Number(m[1]), d = Number(m[2]), newD = Number(m[3]), k = newD / d;
      return { substeps: [{ prompt: `${newD} / ${d} =`, answer: String(k) }, { prompt: `${n} × ${k} =`, answer: String(n * k) }], partial: `${n} × ${k} =`, pivot: 0 };
    },
  },
  {
    // Same denominator: add the numerators, keep the denominator. The result is graded BY VALUE
    // (grade.ts reduces rationals), so a reducing sum is fine — the child may type 4/6 or 2/3 and
    // the internal check reconstructs answerToString(frac(a+b,d)) so the walk never teaches a wrong
    // fraction. The numerator add is the one non-trivial fact (add_within_10).
    id: 'frac_add_same', code: 'frac_add_same_denom', inputs: ['add_within_10'],
    build: (item) => {
      const m = item.prompt.match(/^\s*(\d+)\/(\d+)\s*\+\s*(\d+)\/(\d+)\s*=/);
      if (!m || m[2] !== m[4]) return null;
      const a = Number(m[1]), d = Number(m[2]), b = Number(m[3]), g = gcd2(a + b, d), rn = (a + b) / g, rd = d / g;
      if ((rd === 1 ? String(rn) : `${rn}/${rd}`) !== item.answer) return null; // reconstruct the canonical answer
      return { substeps: [{ prompt: `${a} + ${b} =`, answer: String(a + b) }, { prompt: `(${a} + ${b})/${d} =`, answer: item.answer }], partial: `(${a} + ${b})/${d} =`, pivot: 0 };
    },
  },
];

export const RULE_BY_CODE = new Map<string, RuleDerivation[]>();
for (const d of RULE_DERIVATIONS) {
  const list = RULE_BY_CODE.get(d.code) ?? [];
  list.push(d);
  RULE_BY_CODE.set(d.code, list);
}

// ── WORD SUBJECTS · the fade primitive with NON-derivation support (word-subjects-acquisition-spec) ──
//
// The reframe (spec §0): the maths scaffold is ONE instance of "fade the support from a fully-
// modelled example to independent recall". Spelling/English don't decompose into fluent sub-facts,
// so the support isn't a derivation — but the SAME engine (trigger, L0→L3 fade, warmup-θ,
// graduation, acquisitionCodes) teaches them once you add new SUPPORT-TYPES:
//   • rule  — Direct-Instruction rule-application-fade: a discrimination/rule walk (CHOICE taps),
//             then produce the form (letter pad). Has a fluent-input veto (the parts the rule joins).
//   • cuefade — errorless cue-fade: the atomic item, progressively hidden (whole → gapped →
//             first-letter → dictation). NO fluent-input veto (inputs:[] → the veto auto-passes).
//
// Rendered by AcquisitionStage's word path (ChoiceStage for a discrimination sub-step, the existing
// letter-pad InputStage for the produced target, a CUE node above the pad). Sub-steps are INERT; the
// grade-identical guard is generalised — the produced TARGET is always the item's real word
// (buildItem's answer), so grading is byte-unchanged, and a builder that can't form a clean walk
// returns null → bare-item fallback.

// One INERT L0 sub-step: a CHOICE tap (reuse ChoiceStage) or a letter-pad gap fill.
export type WordSubStep =
  | { kind: 'choice'; prompt: ChoicePromptData; question: string; options: ChoiceOption[]; answer: string }
  | { kind: 'letters'; cue: string; answer: string };

export type WordScaffoldParts = {
  substeps: WordSubStep[]; // the L0 walk (rule-fade); [] for cue-fade (the fade is entirely in the cue)
  cueAt: (level: number) => string | null; // the cue shown ABOVE the letter pad, per fade level (L0..L2)
};
export type WordDerivation = {
  id: StrategyId;
  code: string;
  kind: 'rule' | 'cuefade';
  inputs: string[]; // rule: the parts the rule joins (fluent-input veto); cuefade: [] (auto-pass)
  build: (item: { answer: string }, code: string) => WordScaffoldParts | null;
};

// Swedish doubling: given a T3 word, is it the SHORT (doubled-consonant) member, and the gapped cue
// that flags the doubling position (compare against the pair partner so medial doubles like
// villa/vila are found too). Returns null for a word not in the pair table → bare fallback.
function t3Doubling(word: string): { isShort: boolean; gap: string } | null {
  const pair = T3_PAIRS.find((p) => p.short === word || p.long === word);
  if (!pair) return null;
  const isShort = pair.short === word;
  // The short form is the long form with ONE extra consonant inserted at index i — this covers
  // both a repeated letter (vitt/vit, villa/vila) and the ck doubling (tack/tak). Pick the first i.
  let i = -1;
  for (let k = 0; k < pair.short.length; k++) {
    if (pair.short.slice(0, k) + pair.short.slice(k + 1) === pair.long) { i = k; break; }
  }
  if (i < 0) return null;
  const gap = isShort
    ? pair.short.slice(0, i) + '__' + pair.short.slice(i + 2) // two slots = double
    : pair.long.slice(0, i) + '_' + pair.long.slice(i + 1); //  one slot = single
  return { isShort, gap };
}

// English -ed: classify a regular past form into its base + which joining rule made it. The pool
// is doubling + just-add (no drop-e words), and reversing -ed from the form alone is ambiguous
// (called/added END in a double yet are just-add), so the doubling forms are listed explicitly and
// everything else is just-add. drop-e is handled (base + 'e') for future words but never fires on
// the current pool — where it is the built-in NON-EXAMPLE of the 3-way discrimination. A test
// asserts every en_ed_regular word classifies and rebuilds to itself.
const EN_ED_DOUBLING = new Set([
  'stopped', 'planned', 'grabbed', 'dropped', 'clapped', 'hugged',
  'nodded', 'patted', 'shopped', 'begged', 'jogged', 'slipped',
]);
type EdRule = 'double' | 'drop_e' | 'add';
function edClassify(form: string): { base: string; rule: EdRule } | null {
  if (!form.endsWith('ed') || form.length < 4) return null;
  const stem = form.slice(0, -2); // form without "ed"
  if (EN_ED_DOUBLING.has(form)) return { base: stem.slice(0, -1), rule: 'double' }; // hopp → hop
  return { base: stem, rule: 'add' }; // jump, call, add — the base is the stem
}
const ED_LABEL: Record<EdRule, string> = { double: 'dubbla', drop_e: 'ta bort e', add: 'lägg till -ed' };
const ED_TIP: Record<EdRule, string> = {
  double: 'kort vokal + en konsonant → dubbla',
  drop_e: 'slutar på tyst e → ta bort e',
  add: 'lägg bara till -ed',
};

export const WORD_DERIVATIONS: WordDerivation[] = [
  {
    // SLICE 1 · Swedish doubling (spelling_t3) — a rule-application procedure walk. She owns basic
    // transparent spelling (spelling_t2); she is failing the DOUBLING decision. The L0 walk is the
    // discrimination the rule turns on (hear the word → short vowel doubles, long vowel doesn't),
    // then she produces the word; L1 keeps the gapped cue; L2 is the bare rule tip.
    id: 'sv_double', code: 'spelling_t3', kind: 'rule', inputs: ['spelling_t2'],
    build: (item, code) => {
      const d = t3Doubling(item.answer);
      if (!d) return null;
      const tip = d.isShort ? 'kort vokal → dubbla' : 'lång vokal → enkel';
      const substeps: WordSubStep[] = [{
        kind: 'choice',
        prompt: { show: 'listen', code, word: item.answer },
        question: 'Hör du en kort eller lång vokal?',
        options: [{ value: 'kort', render: 'word' }, { value: 'lång', render: 'word' }],
        answer: d.isShort ? 'kort' : 'lång',
      }];
      return { substeps, cueAt: (lvl) => (lvl <= L_PARTIAL ? d.gap : tip) };
    },
  },
  {
    // SLICE 2 · English irregular past (en_past_irregular) — the purest CUE-FADE. Atomic
    // (inputs:[] → the fluent-input veto auto-passes; an atomic item derives from nothing), and
    // errorless: L0 shows the whole word to copy, L1 hides the interior (first+last kept), L2 shows
    // only the first letter + length, L3 is bare dictation. No discrimination walk — the fade IS the
    // cue. The produced target is always the real word, so grading is byte-unchanged.
    id: 'en_irregular_cue', code: 'en_past_irregular', kind: 'cuefade', inputs: [],
    build: (item) => {
      const w = item.answer;
      if (w.length < 2) return null;
      const interior = w[0] + '_'.repeat(w.length - 2) + w[w.length - 1];
      const firstOnly = w[0] + '_'.repeat(w.length - 1);
      return { substeps: [], cueAt: (lvl) => (lvl <= L_FULL ? w : lvl === L_PARTIAL ? interior : firstOnly) };
    },
  },
  {
    // SLICE A · English -ed (en_ed_regular) — the BRANCHING rule (Direct Instruction). Unlike Swedish
    // doubling (one procedure), -ed forks three ways, so the L0 walk is a real 3-way discrimination:
    // read the base → which rule makes the past? double (hop→hopped) / drop-e (like→liked) / just add
    // (jump→jumped) — with drop-e as the built-in NON-EXAMPLE (never right on this pool; she must
    // reject it when there's no silent e). Then she produces the -ed form on the letter pad. The cue
    // fades: L0 the form with the suffix marked (hopp·ed), L1 the stem with -ed blanked, L2 the tip.
    // Input veto: she can read the base (en_word_picture, the print bridge she must own first).
    id: 'en_ed_rule', code: 'en_ed_regular', kind: 'rule', inputs: ['en_word_picture'],
    build: (item) => {
      const c = edClassify(item.answer);
      if (!c) return null;
      const substeps: WordSubStep[] = [{
        kind: 'choice',
        prompt: { show: 'word', word: c.base }, // read the printed base
        question: 'Hur böjs ordet i dåtid?',
        options: (['double', 'drop_e', 'add'] as EdRule[]).map((r) => ({ value: ED_LABEL[r], render: 'word' })),
        answer: ED_LABEL[c.rule],
      }];
      const marked = item.answer.slice(0, -2) + '·ed'; // hopp·ed / jump·ed — the suffix highlighted
      const gapped = item.answer.slice(0, -2) + '__'; // hopp__ — stem shown, ending recalled
      return { substeps, cueAt: (lvl) => (lvl <= L_FULL ? marked : lvl === L_PARTIAL ? gapped : ED_TIP[c.rule]) };
    },
  },
];

export const WORD_BY_CODE = new Map<string, WordDerivation[]>();
for (const d of WORD_DERIVATIONS) {
  const list = WORD_BY_CODE.get(d.code) ?? [];
  list.push(d);
  WORD_BY_CODE.set(d.code, list);
}

// Does this skill have a derivation at all? (Maths derivation, OR a word-subject support-type.)
export function hasDerivation(code: string): boolean {
  return DERIVATIONS_BY_CODE.has(code) || ADDITIVE_BY_CODE.has(code) || RULE_BY_CODE.has(code) || WORD_BY_CODE.has(code);
}

// The shallowest derivation whose inputs are ALL fluent for this child, or null. `isFluent` is
// the caller's readiness predicate (componentFluent on the selector state) — this module never
// touches player state. Returning null is the readiness VETO: do NOT scaffold; let the graph
// drop lower and serve the missing input instead (invariant 3). Every derivation kind exposes
// `id` + `inputs`, so the trigger reads all three through one signature.
export function pickDerivation(code: string, isFluent: (c: string) => boolean): Derivation | AdditiveDerivation | RuleDerivation | WordDerivation | null {
  for (const d of DERIVATIONS_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  for (const d of ADDITIVE_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  for (const d of RULE_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
  // Word subjects: rule-fade has a fluent-input veto like maths; cue-fade declares inputs:[] so
  // `[].every(...) === true` auto-passes — an atomic item derives from nothing (spec §2).
  for (const d of WORD_BY_CODE.get(code) ?? []) if (d.inputs.every(isFluent)) return d;
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

// ── The WORD scaffold (built client-side by AcquisitionStage's word path) ───────────────────
// Parallel to Scaffold, for the word subjects. The produced `answer` is byte-identical to
// buildItem's (grading unchanged); `substeps` are the INERT L0 walk (rule-fade) or [] (cue-fade);
// `cueAt(level)` is the cue shown above the letter pad.
export type WordScaffold = {
  strategy: StrategyId;
  code: string;
  answer: string; // the word — the server grades this, exactly as for the bare rung
  isRule: boolean; // rule-fade (has a discrimination walk) vs cue-fade
  substeps: WordSubStep[];
  cueAt: (level: number) => string | null;
};

// Build the word scaffold for (code, seed, strategy). Returns null when the derivation can't form a
// clean walk (e.g. a T3 word not in the pair table) → AcquisitionStage falls back to the bare item.
export function buildWordScaffold(code: string, seed: number, strategy: StrategyId): WordScaffold | null {
  const d = WORD_BY_CODE.get(code)?.find((x) => x.id === strategy);
  if (!d) return null;
  const item = buildItem(code, seed);
  const parts = d.build(item, code);
  if (!parts) return null;
  return { strategy, code, answer: item.answer, isRule: d.kind === 'rule', substeps: parts.substeps, cueAt: parts.cueAt };
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
    // 2-digit: name the split; the borrow hint's b is the rounded subtrahend.
    split_add_2d: `tiotal för sig, ental för sig`,
    split_add_2d_carry: `tiotal för sig, ental för sig`,
    split_sub_2d: `tiotal minus tiotal, ental minus ental`,
    split_sub_2d_borrow: `ta bort ${b} istället, lägg tillbaka`,
    // Negatives: pivot-free sign rules — the strategy she has been walking.
    neg_minus_minus: `minus och minus blir plus`,
    neg_mult_same_sign: `lika tecken blir plus`,
    neg_div_signs: `olika tecken blir minus`,
    // Decimals + fractions: pivot-free method reminders.
    dec_add_tenths: `räkna tiondelarna, sätt kommat sen`,
    frac_of_qty: `dela med nämnaren, gånger täljaren`,
    frac_equiv_scale: `hur många gånger större är nämnaren?`,
    frac_add_same: `samma nämnare — addera täljarna`,
    // Word subjects render their L2 cue via cueAt(); these entries exist only for Record
    // completeness (AcquisitionStage's word path never calls hintFor).
    sv_double: `kort vokal → dubbla konsonanten`,
    en_irregular_cue: `minns ordet`,
    en_ed_rule: `vilken regel för -ed?`,
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
    split_add_2d: `tens on their own, ones on their own`,
    split_add_2d_carry: `tens on their own, ones on their own`,
    split_sub_2d: `tens − tens, ones − ones`,
    split_sub_2d_borrow: `subtract ${b} instead, then add back`,
    neg_minus_minus: `minus and minus make plus`,
    neg_mult_same_sign: `same signs make plus`,
    neg_div_signs: `different signs make minus`,
    dec_add_tenths: `add the tenths, place the comma after`,
    frac_of_qty: `divide by the bottom, times the top`,
    frac_equiv_scale: `how many times bigger is the bottom?`,
    frac_add_same: `same bottom — add the tops`,
    sv_double: `short vowel → double the consonant`,
    en_irregular_cue: `remember the word`,
    en_ed_rule: `which -ed rule?`,
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
  split_add_2d: 'Dela upp i tiotal och ental: 34 + 25 → 30 + 20 = 50, 4 + 5 = 9, 50 + 9 = 59.',
  split_add_2d_carry: 'Dela upp i tiotal och ental, växla i entalen: 47 + 28 → 40 + 20 = 60, 7 + 8 = 15, 60 + 15 = 75.',
  split_sub_2d: 'Dela upp i tiotal och ental: 68 − 25 → 60 − 20 = 40, 8 − 5 = 3, 40 + 3 = 43.',
  split_sub_2d_borrow: 'Runda av nedtalet uppåt och lägg tillbaka: 52 − 27 → 52 − 30 = 22, och 3 tillbaka → 25.',
  neg_minus_minus: 'Minus och minus blir plus: −3 − (−5) → −3 + 5 = 2. Skriv om det till en plus-uppgift.',
  neg_mult_same_sign: 'Lika tecken blir plus: (−4) × (−6) → 4 × 6 = 24. Räkna talen utan tecken, sätt sedan plus.',
  neg_div_signs: 'Olika tecken blir minus: −48 / 6 → 48 / 6 = 8, och sedan minus → −8.',
  dec_add_tenths: 'Tal i tiondelar adderas som vanliga tal: 2,7 + 1,8 → 27 tiondelar + 18 tiondelar = 45 tiondelar → 4,5.',
  frac_of_qty: 'Del av antal: 3/4 av 8 → dela med nämnaren (8 / 4 = 2), gånger täljaren (2 × 3 = 6).',
  frac_equiv_scale: 'Liknämnigt: 2/5 = □/15 → nämnaren blev 3 gånger större (15 / 5 = 3), så täljaren också: 2 × 3 = 6.',
  frac_add_same: 'Samma nämnare: addera täljarna, behåll nämnaren: 2/8 + 3/8 → (2 + 3)/8 = 5/8.',
  sv_double: 'Dubbelteckning: hör du en KORT vokal så dubblas konsonanten (vitt), en LÅNG vokal enkeltecknas (vit). Säg ordet långsamt tillsammans och lyssna på vokalen.',
  en_irregular_cue: 'Oregelbundna verb i dåtid måste läras utantill (go→went, inte "goed"). Titta på ordet, täck det, skriv det — några gånger tillsammans.',
  en_ed_rule: 'Regelbunden dåtid (-ed) böjs på tre sätt: dubbla konsonanten (hop→hopped), ta bort tyst e (like→liked), eller bara lägg till -ed (jump→jumped). Titta på grundordet och avgör vilken regel.',
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
