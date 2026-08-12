/**
 * skills.ts — the difficulty model.
 *
 * There is no beta. Difficulty is not a number attached to a problem; it is
 * the shape of this graph. Each skill is one seam in Sweller's element-
 * interactivity sense: one cognitive operation that can be absent or present.
 * Carrying is a seam. Borrowing across a zero is a seam. A negative solution
 * is a seam. Where a seam exists, there is a separate skill code.
 *
 * `year` is the Swedish school year (Lgr22 central content) in which a child
 * would normally have this automatic. It is the ONLY judgement call in the
 * file, and the only thing used to seed theta.
 *
 * Answers are exact. Never a decimal.
 *
 * Delivered as docs/skills.ts with the handoff; this is its home in the app.
 */

import type { ChoiceSpec, ChoiceOption } from "./lib/choice";
import { T2_WORDS, T3_WORDS, T1_5_WORDS, RECOG_WORDS, SPELLING_LETTERS, SPELLING_VOWELS, TRANSPARENT_WORDS } from "./lib/spelling-content";
import { EN_ED_REGULAR, EN_PAST_IRREGULAR, enNounItem, enColorItem, enVerbItem } from "./lib/english-content";

export type Rng = {
  int(a: number, b: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
};

// The subject a skill belongs to. Today every skill is maths; the field exists so a
// second subject (spelling) can be pooled, mapped, seeded and gated SEPARATELY without
// silently mixing — see the SKILLS-iteration register. Defaulted in S() so authoring a
// maths skill never has to name it.
export type Subject = "maths" | "spelling" | "english";

export type Answer =
  | { kind: "int"; v: number }
  | { kind: "frac"; n: number; d: number } // always in lowest terms
  | { kind: "dec"; v: number; scale: number } // exact value = v / 10^scale (scale ≥ 1); a
  // terminating decimal IS an exact rational, so "never a decimal" (line 14) is honoured in
  // spirit — never an INEXACT answer, never a float. Notation is decimal only in what the
  // child reads and types; storage and grading stay exact (see dec() and grade.ts).
  | { kind: "word"; text: string }; // spelling: the CANONICAL lower-case form (A16); the
// displayed pad glyphs are a separate concern, so a versaler pad is a view swap, not a
// data migration. Grading is case-insensitive against this canonical (see grade.ts).

export type Item = {
  prompt: string; // "3x + 7 = 22"  |  "47 + 28 ="  (empty for a recognition rung)
  answer: Answer;
  steps: string[]; // shown on the second miss; genuine intermediate lines
  // Present ⇒ a RECOGNITION rung: the picture prompt + tap-one-of-N options are rendered
  // by ChoiceStage, and `answer` (an int for a numeral/group pick, the word combine/
  // separate for structure) is graded by the same grade(). Absent ⇒ typed on a pad.
  choice?: ChoiceSpec;
};

export type Skill = {
  code: string;
  family: string;
  subject: Subject; // maths | spelling — the partition key (defaulted to maths in S())
  year: number; // Lgr22 school year
  mode: "component" | "compound"; // compounds combine across operations
  // Whether a 30-second fluency SPRINT belongs on this skill. `mode` alone is the
  // wrong gate: a compound (an equation, fraction arithmetic, order-of-operations)
  // is never sprinted, but neither should a multi-column WRITTEN algorithm be —
  // written ×/÷ of ≥2 digits, or 3-digit add/sub with carrying/borrowing across
  // columns. Sprints are for facts and single seams that should become AUTOMATIC;
  // clocking a written procedure teaches rushing, and its "rate" measures pencil
  // speed, not recall. Derived by default (a component IS sprintable) and turned
  // off for the written procedures listed in NON_SPRINTABLE — the one judgement
  // call here, alongside `year`. Single-carry 2-digit and 3-digit-carry-once are
  // deliberately KEPT sprintable as still-mental; tune the set to move the line.
  sprintable: boolean;
  // The input surface a rung is answered on: a typed 'numpad' (the default — digits, and
  // for a word-answer skill the letter pad reads it as text) or a 'choice' recognition
  // pad (ChoiceStage). Choice rungs are never sprintable — a timer on a tap rewards fast
  // guessing; they are timed only as grounding evidence.
  format: "numpad" | "choice";
  // RULE vs LEXICAL (A3), first-class because English is where they diverge hardest: a RULE skill
  // measures GENERALIZATION on a disjoint holdout (-ed on unseen verbs), a LEXICAL skill is fixed
  // retrieval (irregular pasts — the word IS the skill). Content-metadata only: the pool shape and
  // the sprint word source read it; the selector/θ/gate never do. Absent ⇒ untagged (maths, where
  // every generated item is already generalization; Swedish spelling carries it via pool shape).
  kind?: "rule" | "lexical";
  requires: string[];
  // CROSS-SUBJECT prerequisites (A11-aware): codes in ANOTHER subject that must be passed before this
  // unlocks — the reading gate (English spelling / maths-with-words needs reading, earned in Swedish).
  // The selector/θ stay subject-blind; this only gates UNLOCK, via the global passedSkills predicate.
  crossRequires?: string[];
  generate(r: Rng): Item;
};

// Written multi-column algorithms: sprint-INELIGIBLE (see Skill.sprintable). The
// single source of truth for the tool/procedure line — grep here to adjust it.
const NON_SPRINTABLE: ReadonlySet<string> = new Set([
  "mult_2d_by_1d_no_carry",
  "mult_2d_by_1d_carry",
  "div_2d_by_1d_exact",
  "add_3d_carry_twice",
  "sub_3d_borrow",
  "sub_3d_borrow_across_zero",
  "spelling_t15", // scaffolded production (tiles given) — not a clean free-recall fluency measure
]);

/* ── helpers ─────────────────────────────────────────────────────────── */

const int = (v: number): Answer => ({ kind: "int", v });

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d: number): Answer => {
  const g = gcd(n, d) || 1;
  return { kind: "frac", n: n / g, d: d / g };
};

// An exact decimal answer, normalised to the MINIMAL scale so the canonical form is
// natural: dec(70, 2) → "0,7" not "0,70", and a whole result collapses to an int so it
// grades/reads like one (0,4 × 10 → int 4). value = v / 10^scale, always exact.
const dec = (v: number, scale: number): Answer => {
  while (scale > 0 && v % 10 === 0) { v /= 10; scale -= 1; }
  return scale === 0 ? { kind: "int", v } : { kind: "dec", v, scale };
};

/** "+ 7" or "− 7"; the minus is U+2212, not a hyphen. */
const sg = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);
/** "-7" or "7", for standalone terms. */
const nn = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);

/**
 * Build a fraction item, appending a reduction step iff the raw result is not
 * already in lowest terms. The final step always states the actual answer —
 * a child who is shown `4/6` and marked wrong for writing it has been lied to.
 */
const fracItem = (prompt: string, n: number, d: number, steps: string[]): Item => {
  const a = frac(n, d) as Extract<Answer, { kind: "frac" }>;
  const out = [...steps];
  if (a.n !== n || a.d !== d) out.push(`Förkorta med ${gcd(n, d)}: = ${a.n}/${a.d}`);
  return { prompt, answer: a, steps: out };
};

const nz = (r: Rng, a: number, b: number) => {
  let n = 0;
  while (n === 0) n = r.int(a, b);
  return n;
};

const digits = (n: number) => String(Math.abs(n)).split("").map(Number).reverse();
const hasCarry = (a: number, b: number) => {
  const [x, y] = [digits(a), digits(b)];
  let c = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const s = (x[i] ?? 0) + (y[i] ?? 0) + c;
    if (s >= 10) { c = 1; return true; }
    c = 0;
  }
  return false;
};
const carryCount = (a: number, b: number) => {
  const [x, y] = [digits(a), digits(b)];
  let c = 0, n = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const s = (x[i] ?? 0) + (y[i] ?? 0) + c;
    if (s >= 10) { c = 1; n++; } else c = 0;
  }
  return n;
};
const hasBorrow = (a: number, b: number) => {
  const [x, y] = [digits(a), digits(b)];
  for (let i = 0; i < y.length; i++) if ((y[i] ?? 0) > (x[i] ?? 0)) return true;
  return false;
};

/** retry a generator until a predicate holds; generators must stay cheap */
const until = <T>(f: () => T, ok: (t: T) => boolean, tries = 400): T => {
  for (let i = 0; i < tries; i++) { const t = f(); if (ok(t)) return t; }
  throw new Error("generator could not satisfy its constraint");
};

const S = (s: Omit<Skill, "family" | "sprintable" | "subject" | "format"> & { family?: string; subject?: Subject; format?: "numpad" | "choice" }): Skill => ({
  family: s.code.split("_")[0],
  // A component is sprintable unless it's a written multi-column algorithm OR a recognition
  // (choice) rung. One derived flag, one exception set, one format gate.
  sprintable: s.mode === "component" && !NON_SPRINTABLE.has(s.code) && (s.format ?? "numpad") !== "choice",
  ...s,
  // After the spread so the defaults always win when the fields are omitted.
  subject: s.subject ?? "maths",
  format: s.format ?? "numpad",
} as Skill);

/* ═══ TIER −1 · GROUND — meaning before symbol (recognition) ════════ year 0 */
// The pre-symbolic floor, absorbed from the old separate GROUND scene INTO the graph
// (one-ova-track WS II). Recognition rungs — TAP, not type: the MEANING of + / − (Fler /
// Färre), then how-many (count), name-the-amount (numeral), recognise-a-sum (sum).
// format:"choice" ⇒ rendered by ChoiceStage, non-sprintable (grounding evidence, never a
// fluency target — a timer on a tap rewards guessing). The old 'produce' rung is dropped:
// the on-ramp add rungs ARE the "type the sum" bridge (audit). `answer` is the tapped
// value — a word for structure, an int for the amount picks — graded by the same grade().
const GKIND = ["apple", "fish", "duck", "star", "cookie", "cherries"] as const;

// 4 distinct options in [1,max] including the answer, distractors drawn near it, shuffled.
const choiceOptions = (r: Rng, answer: number, max = 10): number[] => {
  const out = [answer];
  const near = [answer - 1, answer + 1, answer - 2, answer + 2, answer + 3, answer - 3].filter((n) => n >= 1 && n <= max);
  for (let i = near.length - 1; i > 0; i--) { const j = r.int(0, i); [near[i], near[j]] = [near[j], near[i]]; }
  for (const n of near) { if (out.length >= 4) break; if (!out.includes(n)) out.push(n); }
  for (let n = 1; out.length < 4 && n <= max; n++) if (!out.includes(n)) out.push(n);
  for (let i = out.length - 1; i > 0; i--) { const j = r.int(0, i); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

const tierGround: Skill[] = [
  S({
    code: "ground_structure", year: 0, mode: "component", format: "choice", requires: [],
    generate: (r) => {
      const kind = r.pick(GKIND);
      const combine = r.int(0, 1) === 0;
      const a = combine ? r.int(2, 5) : r.int(3, 6);
      const b = combine ? r.int(1, 4) : r.int(1, a - 1);
      const structure: "combine" | "separate" = combine ? "combine" : "separate";
      return {
        prompt: "", answer: { kind: "word", text: structure },
        steps: [combine ? "Fler kom till" : "Färre blev kvar"],
        choice: {
          prompt: { show: "structure", kind, a, b, structure },
          question: "Kommer det fler eller färre?",
          options: [
            { value: "combine", render: "more", label: "Fler" },
            { value: "separate", render: "fewer", label: "Färre" },
          ],
        },
      };
    },
  }),
  S({
    // The GENTLE combine: two bunches, pick the bunch with that many. Totals stay ≤ 5, small
    // enough that a beginner at the edge of her counting range lands them by counting-all
    // without miscounting — this is the entry rung. The to-10 combine is a SEAM away at
    // ground_sum (difficulty is graph shape, not a θ-scaled generator): she grows into the
    // bigger totals by CROSSING ground_count → ground_numeral → ground_sum, not by this rung
    // silently getting harder. (Was a=1..5,b→10, which put 6–9 totals on a child who could
    // reliably combine only to ~5 — a floor she sat under at ~37%.)
    code: "ground_count", year: 0, mode: "component", format: "choice", requires: ["ground_structure"],
    generate: (r) => {
      const kind = r.pick(GKIND);
      const a = r.int(1, 4), b = r.int(1, Math.min(4, 5 - a)); // totals 2..5
      const answer = a + b;
      return {
        prompt: "", answer: int(answer), steps: [`${a} + ${b} = ${answer}`],
        choice: {
          prompt: { show: "sum", kind, a, b },
          question: "Hur många tillsammans?",
          options: choiceOptions(r, answer).map((n): ChoiceOption => ({ value: n, render: "group", kind })),
        },
      };
    },
  }),
  S({
    code: "ground_numeral", year: 0, mode: "component", format: "choice", requires: ["ground_count"],
    generate: (r) => {
      const kind = r.pick(GKIND);
      const a = r.int(2, 9);
      return {
        prompt: "", answer: int(a), steps: [`${a}`],
        choice: {
          prompt: { show: "group", kind, a },
          question: "Hur många?",
          options: choiceOptions(r, a).map((n): ChoiceOption => ({ value: n, render: "numeral" })),
        },
      };
    },
  }),
  S({
    code: "ground_sum", year: 0, mode: "component", format: "choice", requires: ["ground_numeral"],
    generate: (r) => {
      const kind = r.pick(GKIND);
      const a = r.int(1, 5), b = r.int(1, Math.min(5, 10 - a));
      const answer = a + b;
      return {
        prompt: "", answer: int(answer), steps: [`${a} + ${b} = ${answer}`],
        choice: {
          prompt: { show: "sum", kind, a, b },
          question: "Hur många tillsammans?",
          options: choiceOptions(r, answer).map((n): ChoiceOption => ({ value: n, render: "numeral" })),
        },
      };
    },
  }),
];

/* ═══ TIER 0 · number sense — the on-ramp into add-within-10 ═════════ year 0 */
// A pre-reading beginner (a five-year-old) cannot START on add_within_10. It used to
// be the graph ROOT (requires: []), so when a child kept failing it the selector had
// nothing easier to fall back to and simply re-served the one problem she could not
// do — the "full circle" a real beginner hit. These three rungs give the selector
// reachable, pre-symbolic content BELOW add_within_10 (which now requires them): the
// same more → count → add arc the GROUND scene teaches, but in the numpad drill so it
// sits on the child's ordinary path, not a separate scene. PICTURES (emoji), never
// bare digits, so a child who cannot yet read numerals can still answer by counting.
//
// year 0 is deliberate: seedGradeFor floors at 0, so `seedGrade >= year` holds for
// EVERY child and these rungs seed FLUENT for everyone — add_within_10 therefore
// stays unlocked for every child who already does it (no older child is bricked). The
// only child who drops to these is one whose add_within_10 θ has fallen below her own
// p-band, i.e. she genuinely cannot do it yet — which is exactly who they are for.
const PIC = ["🍎", "🐟", "🦆", "⭐", "🍪", "🍒"] as const;

const tier0: Skill[] = [
  S({
    // THE ROOT. The meaning of "more": two bunches, type how many the BIGGER holds.
    // "eller" (never "+"), so it can't be misread as an addition to sum.
    code: "more_or_less", year: 0, mode: "component", requires: ["ground_sum"],
    generate: (r) => {
      const e = r.pick(PIC);
      const [x, y] = until(() => [r.int(1, 6), r.int(1, 6)], ([x, y]) => x !== y);
      const hi = Math.max(x, y), lo = Math.min(x, y);
      return { prompt: `${e.repeat(x)} eller ${e.repeat(y)}`, answer: int(hi),
        steps: [`${hi} är fler än ${lo}`, `Flest är ${hi}`] };
    },
  }),
  S({
    // Subitizing / early counting: how many in one SMALL bunch (≤5). The true entry to
    // counting — a starting counter reliably reads ≤5 at a glance. Split from count_within_10
    // (prod: dog, åk0, counted ≤4 fine but stalled 20s+ then "vet inte" on 7–10). As its own
    // skill its θ tracks this range alone, so success here keeps it in-band while the harder
    // 6–10 rung can fall out of band independently — the p-band adapting at the right grain.
    code: "count_to_5", year: 0, mode: "component", requires: ["more_or_less"],
    generate: (r) => {
      const e = r.pick(PIC);
      const n = r.int(1, 5);
      return { prompt: `${e.repeat(n)} =`, answer: int(n), steps: [`Räkna: ${n}`] };
    },
  }),
  S({
    // Cardinality into the harder range (6–10) — counting past a glance. Requires count_to_5,
    // so a child meets small counts first; if the big counts are still beyond them, this rung's
    // own θ drops out of their band and it stops being served until they're ready.
    code: "count_within_10", year: 0, mode: "component", requires: ["count_to_5"],
    generate: (r) => {
      const e = r.pick(PIC);
      const n = r.int(6, 10);
      return { prompt: `${e.repeat(n)} =`, answer: int(n), steps: [`Räkna: ${n}`] };
    },
  }),
  S({
    // First symbolic addition, pictured and tiny (sum ≤ 5): the step before add_within_10.
    // Draw the SUM uniformly, then split it, so no single answer dominates the draws. Needs
    // counting to 5 (count_to_5) — NOT counting to 10, so a beginner who can add within 5
    // isn't gated behind the harder 6–10 rung she may not have yet.
    code: "add_within_5", year: 0, mode: "component", requires: ["count_to_5"],
    generate: (r) => {
      const e = r.pick(PIC);
      const sum = r.int(2, 5);
      const a = r.int(1, sum - 1), b = sum - a;
      return { prompt: `${e.repeat(a)} + ${e.repeat(b)} =`, answer: int(sum),
        steps: [`${a} + ${b} = ${sum}`] };
    },
  }),
];

/* ═══ TIER 1 · additive within 20 ═══════════════════════════════ year 1 */

const tier1: Skill[] = [
  S({
    code: "add_within_10", year: 1, mode: "component", requires: ["add_within_5"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(1, 8), r.int(1, 8)], ([a, b]) => a + b <= 10 && a !== b);
      return { prompt: `${a} + ${b} =`, answer: int(a + b), steps: [`${a} + ${b} = ${a + b}`] };
    },
  }),
  S({
    code: "add_doubles", year: 1, mode: "component", requires: ["add_within_10"],
    generate: (r) => { const a = r.int(2, 10);
      return { prompt: `${a} + ${a} =`, answer: int(2 * a), steps: [`${a} + ${a} = ${2 * a}`] }; },
  }),
  S({
    code: "sub_within_10", year: 1, mode: "component", requires: ["add_within_10"],
    generate: (r) => { const a = r.int(3, 10), b = r.int(1, a - 1);
      return { prompt: `${a} − ${b} =`, answer: int(a - b), steps: [`${a} − ${b} = ${a - b}`] }; },
  }),
  S({
    code: "missing_addend_10", year: 1, mode: "component", requires: ["sub_within_10"],
    generate: (r) => { const a = r.int(1, 9);
      return { prompt: `${a} + □ = 10`, answer: int(10 - a), steps: [`□ = 10 − ${a}`, `□ = ${10 - a}`] }; },
  }),
  S({
    code: "add_cross_10", year: 1, mode: "component", requires: ["missing_addend_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(6, 9), r.int(3, 9)], ([a, b]) => a + b > 10 && a + b <= 18);
      return { prompt: `${a} + ${b} =`, answer: int(a + b),
        steps: [`${a} + ${10 - a} = 10`, `10 + ${b - (10 - a)} = ${a + b}`] };
    },
  }),
  S({
    code: "sub_cross_10", year: 1, mode: "component", requires: ["add_cross_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(11, 18), r.int(3, 9)], ([a, b]) => a - b < 10 && a - b >= 1);
      return { prompt: `${a} − ${b} =`, answer: int(a - b),
        steps: [`${a} − ${a - 10} = 10`, `10 − ${b - (a - 10)} = ${a - b}`] };
    },
  }),
  S({
    code: "bond_to_20", year: 1, mode: "component", requires: ["add_cross_10"],
    generate: (r) => { const a = r.int(11, 19);
      return { prompt: `${a} + □ = 20`, answer: int(20 - a), steps: [`□ = 20 − ${a}`, `□ = ${20 - a}`] }; },
  }),
  S({
    code: "add_tens", year: 1, mode: "component", requires: ["add_within_10"],
    generate: (r) => { const a = r.int(2, 8) * 10, b = r.int(1, 9 - a / 10) * 10;
      return { prompt: `${a} + ${b} =`, answer: int(a + b), steps: [`${a / 10} + ${b / 10} tiotal`, `= ${a + b}`] }; },
  }),
];

/* ═══ TIER 2 · place value ═════════════════════════════════ year 2 – 3 */

const tier2: Skill[] = [
  S({
    code: "add_2d_no_carry", year: 2, mode: "component", requires: ["add_tens", "add_within_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(11, 88), r.int(11, 88)], ([a, b]) => !hasCarry(a, b) && a + b < 100);
      return { prompt: `${a} + ${b} =`, answer: int(a + b),
        steps: [`Tiotal: ${Math.floor(a / 10) + Math.floor(b / 10)}`, `Ental: ${(a % 10) + (b % 10)}`, `= ${a + b}`] };
    },
  }),
  S({
    code: "add_2d_carry", year: 2, mode: "component", requires: ["add_2d_no_carry", "add_cross_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(15, 89), r.int(15, 89)], ([a, b]) => hasCarry(a, b) && a + b < 200);
      return { prompt: `${a} + ${b} =`, answer: int(a + b),
        steps: [`Ental: ${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}  → minnessiffra 1`, `= ${a + b}`] };
    },
  }),
  S({
    code: "sub_2d_no_borrow", year: 2, mode: "component", requires: ["add_2d_no_carry", "sub_within_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(21, 99), r.int(11, 88)], ([a, b]) => a > b && !hasBorrow(a, b));
      return { prompt: `${a} − ${b} =`, answer: int(a - b), steps: [`${a} − ${b} = ${a - b}`] };
    },
  }),
  S({
    code: "sub_2d_borrow", year: 3, mode: "component", requires: ["sub_2d_no_borrow", "sub_cross_10"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(21, 99), r.int(12, 89)], ([a, b]) => a > b && hasBorrow(a, b));
      return { prompt: `${a} − ${b} =`, answer: int(a - b),
        steps: [`Låna 1 tiotal: ${a % 10} + 10 = ${(a % 10) + 10}`, `= ${a - b}`] };
    },
  }),
  S({
    code: "add_3d_no_carry", year: 3, mode: "component", requires: ["add_2d_no_carry"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(111, 444), r.int(111, 444)], ([a, b]) => !hasCarry(a, b));
      return { prompt: `${a} + ${b} =`, answer: int(a + b), steps: [`${a} + ${b} = ${a + b}`] };
    },
  }),
  S({
    code: "add_3d_carry_once", year: 3, mode: "component", requires: ["add_3d_no_carry", "add_2d_carry"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(115, 799), r.int(115, 199)], ([a, b]) => carryCount(a, b) === 1);
      return { prompt: `${a} + ${b} =`, answer: int(a + b), steps: [`En minnessiffra`, `= ${a + b}`] };
    },
  }),
  S({
    code: "add_3d_carry_twice", year: 3, mode: "component", requires: ["add_3d_carry_once"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(155, 799), r.int(155, 199)], ([a, b]) => carryCount(a, b) >= 2);
      return { prompt: `${a} + ${b} =`, answer: int(a + b), steps: [`Två minnessiffror`, `= ${a + b}`] };
    },
  }),
  S({
    code: "sub_3d_borrow", year: 3, mode: "component", requires: ["sub_2d_borrow", "add_3d_no_carry"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(211, 899), r.int(111, 199)],
        ([a, b]) => a > b && hasBorrow(a, b) && String(a).includes("0") === false);
      return { prompt: `${a} − ${b} =`, answer: int(a - b), steps: [`Låna över tiotalet`, `= ${a - b}`] };
    },
  }),
  S({
    /* Brown & VanLehn's canonical bug site. Its own competence, its own skill. */
    code: "sub_3d_borrow_across_zero", year: 4, mode: "component", requires: ["sub_3d_borrow"],
    generate: (r) => {
      const [a, b] = until(() => {
        const h = r.int(2, 9), u = r.int(0, 4);
        return [h * 100 + u, r.int(11, 89)] as [number, number];
      }, ([a, b]) => a > b && (a % 100) - (b % 100) < 0);
      return { prompt: `${a} − ${b} =`, answer: int(a - b),
        steps: [`Tiotalssiffran är 0 — låna från hundratalet`, `= ${a - b}`] };
    },
  }),
];

/* ═══ TIER 3 · multiplication ══════════════════════════════ year 2 – 4 */

const tableYear: Record<number, number> = { 2: 2, 5: 2, 10: 2, 3: 3, 4: 3, 6: 3, 7: 4, 8: 4, 9: 4, 11: 4, 12: 4 };

const multTable = (t: number): Skill => S({
  code: `mult_table_${t}`, family: "multiplication", year: tableYear[t], mode: "component",
  requires: t === 2 ? ["add_doubles"] : ["mult_table_2"],
  generate: (r) => { const b = r.int(2, 12);
    return { prompt: `${t} × ${b} =`, answer: int(t * b), steps: [`${t} × ${b} = ${t * b}`] }; },
});

const tier3: Skill[] = [
  ...[2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12].map(multTable),
  S({
    code: "mult_mixed", family: "multiplication", year: 4, mode: "component",
    requires: [2, 3, 4, 5, 6, 7, 8, 9].map((t) => `mult_table_${t}`),
    generate: (r) => { const a = r.int(2, 9), b = r.int(2, 9);
      return { prompt: `${a} × ${b} =`, answer: int(a * b), steps: [`${a} × ${b} = ${a * b}`] }; },
  }),
  S({
    code: "mult_by_powers_of_ten", family: "multiplication", year: 4, mode: "component",
    requires: ["mult_table_10"],
    generate: (r) => { const a = r.int(2, 99), p = r.pick([10, 100, 1000]);
      return { prompt: `${a} × ${p} =`, answer: int(a * p), steps: [`Flytta siffrorna ${String(p).length - 1} steg`, `= ${a * p}`] }; },
  }),
  S({
    code: "mult_2d_by_1d_no_carry", family: "multiplication", year: 4, mode: "component",
    requires: ["mult_mixed", "add_2d_no_carry"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(11, 44), r.int(2, 4)] as [number, number],
        ([a, b]) => (a % 10) * b < 10 && a * b < 100);
      return { prompt: `${a} × ${b} =`, answer: int(a * b),
        steps: [`${Math.floor(a / 10) * 10} × ${b} = ${Math.floor(a / 10) * 10 * b}`, `${a % 10} × ${b} = ${(a % 10) * b}`, `= ${a * b}`] };
    },
  }),
  S({
    code: "mult_2d_by_1d_carry", family: "multiplication", year: 5, mode: "component",
    requires: ["mult_2d_by_1d_no_carry", "add_2d_carry"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(13, 89), r.int(3, 9)] as [number, number], ([a, b]) => (a % 10) * b >= 10);
      return { prompt: `${a} × ${b} =`, answer: int(a * b),
        steps: [`${Math.floor(a / 10) * 10} × ${b} = ${Math.floor(a / 10) * 10 * b}`, `${a % 10} × ${b} = ${(a % 10) * b}`, `= ${a * b}`] };
    },
  }),
];

/* ═══ TIER 4 · division ════════════════════════════════════════ year 4 */

const divTable = (t: number): Skill => S({
  code: `div_table_${t}`, family: "division", year: tableYear[t] + 1, mode: "component",
  requires: [`mult_table_${t}`],
  generate: (r) => { const b = r.int(2, 12);
    return { prompt: `${t * b} / ${t} =`, answer: int(b), steps: [`${t} × ${b} = ${t * b}`, `alltså ${t * b} / ${t} = ${b}`] }; },
});

const tier4: Skill[] = [
  ...[2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12].map(divTable),
  S({
    code: "div_mixed", family: "division", year: 5, mode: "component",
    requires: [2, 3, 4, 5, 6, 7, 8, 9].map((t) => `div_table_${t}`),
    generate: (r) => { const a = r.int(2, 9), b = r.int(2, 9);
      return { prompt: `${a * b} / ${a} =`, answer: int(b), steps: [`${a} × ${b} = ${a * b}`, `= ${b}`] }; },
  }),
  S({
    code: "missing_factor", family: "division", year: 5, mode: "component",
    requires: ["div_mixed"],
    generate: (r) => { const a = r.int(3, 9), b = r.int(3, 12);
      return { prompt: `${a} × □ = ${a * b}`, answer: int(b), steps: [`□ = ${a * b} / ${a}`, `□ = ${b}`] }; },
  }),
  S({
    code: "div_2d_by_1d_exact", family: "division", year: 5, mode: "component",
    requires: ["div_mixed", "mult_2d_by_1d_carry"],
    generate: (r) => { const b = r.int(3, 9), q = r.int(11, 24);
      return { prompt: `${b * q} / ${b} =`, answer: int(q), steps: [`${b} × ${q} = ${b * q}`, `= ${q}`] }; },
  }),
];

/* ═══ TIER 5 · order of operations ════════════════════════════ year 5+ */
/* COMPOUND. Never sprinted. */

const tier5: Skill[] = [
  S({
    code: "ooo_mult_then_add", family: "order", year: 5, mode: "compound",
    requires: ["mult_mixed", "add_2d_carry"],
    generate: (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(2, 20);
      return { prompt: `${a} × ${b} + ${c} =`, answer: int(a * b + c),
        steps: [`Multiplikation först: ${a} × ${b} = ${a * b}`, `${a * b} + ${c} = ${a * b + c}`] }; },
  }),
  S({
    code: "ooo_add_then_mult", family: "order", year: 5, mode: "compound",
    requires: ["ooo_mult_then_add"],
    generate: (r) => { const a = r.int(2, 20), b = r.int(2, 9), c = r.int(2, 9);
      return { prompt: `${a} + ${b} × ${c} =`, answer: int(a + b * c),
        steps: [`Multiplikation först: ${b} × ${c} = ${b * c}`, `${a} + ${b * c} = ${a + b * c}`] }; },
  }),
  S({
    code: "ooo_parentheses", family: "order", year: 5, mode: "compound",
    requires: ["ooo_add_then_mult"],
    generate: (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(2, 9);
      return { prompt: `${a} × (${b} + ${c}) =`, answer: int(a * (b + c)),
        steps: [`Parentesen först: ${b} + ${c} = ${b + c}`, `${a} × ${b + c} = ${a * (b + c)}`] }; },
  }),
  S({
    code: "ooo_three_ops", family: "order", year: 6, mode: "compound",
    requires: ["ooo_parentheses", "div_mixed"],
    generate: (r) => { const a = r.int(2, 9), b = r.int(2, 9), c = r.int(2, 6), d = r.int(2, 6);
      return { prompt: `${a} × ${b} − ${c * d} / ${c} =`, answer: int(a * b - d),
        steps: [`${a} × ${b} = ${a * b}`, `${c * d} / ${c} = ${d}`, `${a * b} − ${d} = ${a * b - d}`] }; },
  }),
];

/* ═══ TIER 6 · negative integers ═══════════════════════════════ year 6 */

const tier6: Skill[] = [
  S({
    code: "neg_sub_to_negative", family: "negatives", year: 6, mode: "component",
    requires: ["sub_cross_10"],
    generate: (r) => { const a = r.int(2, 9), b = r.int(a + 1, 15);
      return { prompt: `${a} − ${b} =`, answer: int(a - b), steps: [`${a} − ${a} = 0`, `0 − ${b - a} = ${nn(a - b)}`] }; },
  }),
  S({
    code: "neg_add_pos", family: "negatives", year: 6, mode: "component",
    requires: ["neg_sub_to_negative"],
    generate: (r) => { const a = -r.int(2, 12), b = r.int(2, 15);
      return { prompt: `${nn(a)} + ${b} =`, answer: int(a + b), steps: [`Gå ${b} steg åt höger från ${nn(a)}`, `= ${nn(a + b)}`] }; },
  }),
  S({
    code: "neg_add_neg", family: "negatives", year: 6, mode: "component",
    requires: ["neg_add_pos"],
    generate: (r) => { const a = -r.int(2, 12), b = -r.int(2, 12);
      return { prompt: `${nn(a)} + (${nn(b)}) =`, answer: int(a + b), steps: [`= ${nn(a)} − ${Math.abs(b)}`, `= ${nn(a + b)}`] }; },
  }),
  S({
    code: "neg_sub_neg", family: "negatives", year: 6, mode: "component",
    requires: ["neg_add_neg"],
    generate: (r) => { const a = nz(r, -9, 9), b = -r.int(2, 9);
      return { prompt: `${nn(a)} − (${nn(b)}) =`, answer: int(a - b), steps: [`Minus och minus blir plus`, `= ${nn(a)} + ${Math.abs(b)}`, `= ${nn(a - b)}`] }; },
  }),
  S({
    code: "neg_mult_pos_neg", family: "negatives", year: 6, mode: "component",
    requires: ["neg_add_pos", "mult_mixed"],
    generate: (r) => { const a = r.int(2, 9), b = -r.int(2, 9);
      return { prompt: `${a} × (${nn(b)}) =`, answer: int(a * b), steps: [`Olika tecken → negativt`, `= ${nn(a * b)}`] }; },
  }),
  S({
    code: "neg_mult_neg_neg", family: "negatives", year: 6, mode: "component",
    requires: ["neg_mult_pos_neg"],
    generate: (r) => { const a = -r.int(2, 9), b = -r.int(2, 9);
      return { prompt: `(${nn(a)}) × (${nn(b)}) =`, answer: int(a * b), steps: [`Lika tecken → positivt`, `= ${a * b}`] }; },
  }),
  S({
    code: "neg_div", family: "negatives", year: 6, mode: "component",
    requires: ["neg_mult_neg_neg", "div_mixed"],
    generate: (r) => { const a = r.int(2, 9), q = r.int(2, 9), neg = r.pick([true, false]);
      const num = neg ? -(a * q) : a * q, den = neg ? a : -a;
      return { prompt: `${nn(num)} / ${nn(den)} =`, answer: int(-q), steps: [`Olika tecken → negativt`, `= ${nn(-q)}`] }; },
  }),
];

/* ═══ TIER 7 · fractions ═══════════════════════════════════ year 5 – 6 */

const tier7: Skill[] = [
  S({
    code: "frac_of_quantity", family: "fractions", year: 5, mode: "component",
    requires: ["div_mixed"],
    generate: (r) => { const d = r.pick([2, 3, 4, 5]), n = r.int(1, d - 1), q = r.int(2, 8) * d;
      return { prompt: `${n}/${d} av ${q} =`, answer: int((q / d) * n),
        steps: [`${q} / ${d} = ${q / d}`, `${q / d} × ${n} = ${(q / d) * n}`] }; },
  }),
  S({
    code: "frac_equivalent", family: "fractions", year: 5, mode: "component",
    requires: ["mult_mixed"],
    generate: (r) => { const n = r.int(1, 5), d = r.int(n + 1, 9), k = r.int(2, 6);
      return { prompt: `${n}/${d} = □/${d * k}`, answer: int(n * k), steps: [`${d} × ${k} = ${d * k}`, `□ = ${n} × ${k} = ${n * k}`] }; },
  }),
  S({
    code: "frac_simplify", family: "fractions", year: 6, mode: "compound",
    requires: ["frac_equivalent", "div_mixed"],
    generate: (r) => {
      const [n, d] = until(() => [r.int(1, 6), r.int(2, 9)] as [number, number], ([n, d]) => d > n && gcd(n, d) === 1);
      const k = r.int(2, 5);
      return { prompt: `Förkorta ${n * k}/${d * k}`, answer: frac(n, d), steps: [`Dela båda med ${k}`, `= ${n}/${d}`] };
    },
  }),
  S({
    code: "frac_add_same_denom", family: "fractions", year: 5, mode: "compound",
    requires: ["frac_equivalent"],
    generate: (r) => { const d = r.int(3, 12), a = r.int(1, d - 2), b = r.int(1, d - a - 1);
      return fracItem(`${a}/${d} + ${b}/${d} =`, a + b, d,
        [`Samma nämnare: ${a} + ${b} = ${a + b}`, `= ${a + b}/${d}`]); },
  }),
  S({
    code: "frac_sub_same_denom", family: "fractions", year: 5, mode: "compound",
    requires: ["frac_add_same_denom"],
    generate: (r) => { const d = r.int(3, 12), a = r.int(2, d - 1), b = r.int(1, a - 1);
      return fracItem(`${a}/${d} − ${b}/${d} =`, a - b, d, [`${a} − ${b} = ${a - b}`, `= ${a - b}/${d}`]); },
  }),
  S({
    code: "frac_add_unlike_denom", family: "fractions", year: 6, mode: "compound",
    requires: ["frac_add_same_denom", "frac_simplify"],
    generate: (r) => {
      const [d1, d2] = until(() => [r.int(2, 6), r.int(2, 8)] as [number, number], ([x, y]) => x !== y && gcd(x, y) === 1);
      const a = r.int(1, d1 - 1), b = r.int(1, d2 - 1);
      return fracItem(`${a}/${d1} + ${b}/${d2} =`, a * d2 + b * d1, d1 * d2,
        [`Gemensam nämnare ${d1 * d2}`, `${a * d2}/${d1 * d2} + ${b * d1}/${d1 * d2}`, `= ${a * d2 + b * d1}/${d1 * d2}`]);
    },
  }),
  S({
    code: "frac_mult", family: "fractions", year: 6, mode: "compound",
    requires: ["frac_simplify"],
    generate: (r) => { const a = r.int(1, 5), b = r.int(a + 1, 8), c = r.int(1, 5), d = r.int(c + 1, 8);
      return fracItem(`${a}/${b} × ${c}/${d} =`, a * c, b * d,
        [`Täljare: ${a} × ${c} = ${a * c}`, `Nämnare: ${b} × ${d} = ${b * d}`, `= ${a * c}/${b * d}`]); },
  }),
];

/* ═══ TIER 8 · linear equations ════════════════════════════ year 7 – 8 */
/* COMPOUND, every one. No clock ever touches these. */

const tier8: Skill[] = [
  S({
    code: "lin_x_plus_a", family: "linear", year: 6, mode: "compound",
    requires: ["sub_2d_borrow", "missing_addend_10"],
    generate: (r) => { const x = r.int(1, 12), a = r.int(1, 12);
      return { prompt: `x + ${a} = ${x + a}`, answer: int(x), steps: [`x = ${x + a} − ${a}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_x_minus_a", family: "linear", year: 6, mode: "compound",
    requires: ["lin_x_plus_a"],
    generate: (r) => { const x = r.int(2, 14), a = r.int(1, 9);
      return { prompt: `x − ${a} = ${x - a}`, answer: int(x), steps: [`x = ${x - a} + ${a}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_a_minus_x", family: "linear", year: 7, mode: "compound",
    requires: ["lin_x_minus_a"],
    generate: (r) => { const x = r.int(2, 9), a = r.int(x + 1, 18);
      return { prompt: `${a} − x = ${a - x}`, answer: int(x), steps: [`x = ${a} − ${a - x}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_ax", family: "linear", year: 6, mode: "compound",
    requires: ["div_mixed"],
    generate: (r) => { const x = r.int(2, 12), a = r.int(2, 9);
      return { prompt: `${a}x = ${a * x}`, answer: int(x), steps: [`x = ${a * x} / ${a}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_x_over_a", family: "linear", year: 7, mode: "compound",
    requires: ["lin_ax"],
    generate: (r) => { const x = r.int(2, 10), a = r.int(2, 6);
      return { prompt: `x / ${a} = ${x}`, answer: int(x * a), steps: [`x = ${x} × ${a}`, `x = ${x * a}`] }; },
  }),
  S({
    code: "lin_ax_plus_b", family: "linear", year: 7, mode: "compound",
    requires: ["lin_ax", "lin_x_plus_a", "mult_2d_by_1d_carry"],
    generate: (r) => { const x = r.int(1, 10), a = r.int(2, 7), b = r.int(1, 12);
      return { prompt: `${a}x + ${b} = ${a * x + b}`, answer: int(x),
        steps: [`${a}x = ${a * x + b} − ${b}`, `${a}x = ${a * x}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_ax_minus_b", family: "linear", year: 7, mode: "compound",
    requires: ["lin_ax_plus_b"],
    generate: (r) => { const x = r.int(2, 10), a = r.int(2, 7), b = r.int(1, 12);
      return { prompt: `${a}x − ${b} = ${a * x - b}`, answer: int(x),
        steps: [`${a}x = ${a * x - b} + ${b}`, `${a}x = ${a * x}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_neg_solution", family: "linear", year: 8, mode: "compound",
    requires: ["lin_ax_minus_b", "neg_div"],
    generate: (r) => { const x = -r.int(1, 8), a = r.int(2, 7), b = r.int(1, 12);
      return { prompt: `${a}x + ${b} = ${nn(a * x + b)}`, answer: int(x),
        steps: [`${a}x = ${nn(a * x + b)} − ${b}`, `${a}x = ${nn(a * x)}`, `x = ${nn(x)}`] }; },
  }),
  S({
    code: "lin_neg_coefficient", family: "linear", year: 8, mode: "compound",
    requires: ["lin_neg_solution", "neg_mult_neg_neg"],
    generate: (r) => { const x = nz(r, -6, 8), a = -r.int(2, 6), b = r.int(1, 12);
      return { prompt: `${nn(a)}x + ${b} = ${nn(a * x + b)}`, answer: int(x),
        steps: [`${nn(a)}x = ${nn(a * x)}`, `x = ${nn(a * x)} / ${nn(a)}`, `x = ${nn(x)}`] }; },
  }),
  S({
    code: "lin_x_over_a_plus_b", family: "linear", year: 8, mode: "compound",
    requires: ["lin_x_over_a", "lin_ax_plus_b"],
    generate: (r) => { const q = r.int(2, 9), a = r.int(2, 6), b = r.int(1, 10);
      return { prompt: `x / ${a} + ${b} = ${q + b}`, answer: int(q * a),
        steps: [`x / ${a} = ${q}`, `x = ${q} × ${a}`, `x = ${q * a}`] }; },
  }),
  S({
    code: "lin_a_paren_x_plus_b", family: "linear", year: 8, mode: "compound",
    requires: ["lin_ax_plus_b", "ooo_parentheses"],
    generate: (r) => { const x = r.int(1, 9), a = r.int(2, 6), b = nz(r, -6, 6);
      return { prompt: `${a}(x ${sg(b)}) = ${a * (x + b)}`, answer: int(x),
        steps: [`x ${sg(b)} = ${a * (x + b)} / ${a}`, `x ${sg(b)} = ${x + b}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_x_both_sides", family: "linear", year: 8, mode: "compound",
    requires: ["lin_ax_plus_b", "neg_add_pos"],
    generate: (r) => {
      const { x, a, c, b, d } = until(() => {
        const x = r.int(1, 9), a = r.int(4, 9), c = r.int(2, a - 2), b = nz(r, -8, 8);
        return { x, a, c, b, d: (a - c) * x + b };
      }, (v) => v.d !== 0);
      return { prompt: `${a}x ${sg(b)} = ${c}x ${sg(d)}`, answer: int(x),
        steps: [`${a - c}x ${sg(b)} = ${nn(d)}`, `${a - c}x = ${(a - c) * x}`, `x = ${x}`] }; },
  }),
  S({
    code: "lin_paren_both_sides", family: "linear", year: 8, mode: "compound",
    requires: ["lin_x_both_sides", "lin_a_paren_x_plus_b"],
    generate: (r) => {
      const { x, a, c, b, d } = until(() => {
        const x = nz(r, -6, 9), a = r.int(4, 7), c = r.int(2, a - 2), b = nz(r, -5, 5);
        return { x, a, c, b, d: a * (x + b) - c * x };
      }, (v) => v.d !== 0 && v.a * v.b !== 0);
      return { prompt: `${a}(x ${sg(b)}) = ${c}x ${sg(d)}`, answer: int(x),
        steps: [`${a}x ${sg(a * b)} = ${c}x ${sg(d)}`, `${a - c}x = ${(a - c) * x}`, `x = ${nn(x)}`] }; },
  }),
];

/* ═══ TIER · decimals ═══════════════════════════════════════ year 4 – 6 */
// Tal i decimalform (Lgr22 åk4–6). Answers are EXACT rationals shown/typed in decimal
// notation — never a float (see the dec() constructor and the Answer comment). Hangs off
// place value + mult_by_powers_of_ten + the cross-10 carry/borrow seams, NOT behind
// fractions (which are year 5–6 and would invert the year order). Standard scope,
// increment 1: the notation gate + same-place add/sub. (Spec: docs/decimals-tier-spec.md.)
const tierDecimals: Skill[] = [
  S({
    // The notation-and-meaning gate: a decimal IS tenths. Shown a tenths fraction, type
    // the decimal. n∈1..9 → 0,1..0,9 uniform (no dominant answer). 6/10 = 6÷10 = 0,6, so
    // the offline feature tag reads it as division — mathematically exact.
    code: "dec_read_tenths", family: "decimals", year: 4, mode: "component", requires: ["add_2d_no_carry"],
    generate: (r) => { const n = r.int(1, 9);
      return { prompt: `${n}/10 =`, answer: dec(n, 1), steps: [`${n} tiondelar = 0,${n}`] }; },
  }),
  S({
    // Add decimals with the SAME number of places, no carry across the comma: tenths whose
    // tenths-sum stays < 10. Draw the tenths so no single sum dominates.
    code: "dec_add_same", family: "decimals", year: 5, mode: "component", requires: ["dec_read_tenths"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(1, 8), r.int(1, 8)], ([a, b]) => (a % 10) + (b % 10) <= 9 && a !== b);
      return { prompt: `0,${a} + 0,${b} =`, answer: dec(a + b, 1), steps: [`${a} + ${b} tiondelar = ${a + b}`, `= 0,${a + b}`] };
    },
  }),
  S({
    // Subtract decimals, same places, no borrow across the comma.
    code: "dec_sub_same", family: "decimals", year: 5, mode: "component", requires: ["dec_add_same"],
    generate: (r) => {
      const [a, b] = until(() => [r.int(2, 9), r.int(1, 8)], ([a, b]) => a - b >= 1);
      return { prompt: `0,${a} − 0,${b} =`, answer: dec(a - b, 1), steps: [`${a} − ${b} tiondelar = ${a - b}`, `= 0,${a - b}`] };
    },
  }),
  S({
    // ×10 / ×100 shifts the comma LEFT. The operand is a genuine decimal (tenths or
    // hundredths, last digit nonzero so it never reads as a whole); the answer may land
    // whole (0,4 × 10 = 4) or stay decimal (0,35 × 10 = 3,5).
    code: "dec_x10", family: "decimals", year: 5, mode: "component", requires: ["dec_read_tenths", "mult_by_powers_of_ten"],
    generate: (r) => {
      const scale = r.int(1, 2);
      const v = until(() => r.int(1, 6 * 10 ** scale), (v) => v % 10 !== 0);
      const pow = r.pick([10, 100] as const);
      const ans = dec(v * pow, scale);
      return { prompt: `${answerToString(dec(v, scale))} × ${pow} =`, answer: ans, steps: [`Flytta kommat: ${answerToString(ans)}`] };
    },
  }),
  S({
    // ÷10 / ÷100 shifts the comma RIGHT. The dividend is a whole NOT divisible by the
    // power, so the quotient is a genuine decimal (tenths for ÷10, hundredths for ÷100).
    code: "dec_div10", family: "decimals", year: 5, mode: "component", requires: ["dec_x10"],
    generate: (r) => {
      const pow = r.pick([10, 100] as const);
      const scale = pow === 10 ? 1 : 2;
      const dividend = until(() => r.int(1, 6 * pow), (d) => d % pow !== 0);
      const ans = dec(dividend, scale);
      return { prompt: `${dividend} ÷ ${pow} =`, answer: ans, steps: [`Flytta kommat: ${answerToString(ans)}`] };
    },
  }),
  S({
    // Add decimals with the SAME places but a tenths-sum that CARRIES into the ones. af+bf
    // ≥ 11 keeps a nonzero tenth in the answer, so the carry is always visible (never 1,0).
    code: "dec_add_carry", family: "decimals", year: 5, mode: "component", requires: ["dec_add_same", "add_cross_10"],
    generate: (r) => {
      const af = r.int(2, 9);
      const bf = until(() => r.int(2, 9), (bf) => af + bf >= 11);
      const aw = r.int(0, 3), bw = r.int(0, 3);
      const ans = dec((aw * 10 + af) + (bw * 10 + bf), 1);
      return { prompt: `${aw},${af} + ${bw},${bf} =`, answer: ans, steps: [`Tiondelarna växlar över: ${answerToString(ans)}`] };
    },
  }),
  S({
    // Add UNLIKE places: a tenths operand + a hundredths operand, aligned at the comma.
    // The hundredths digit is nonzero, so the answer is always a genuine hundredths value —
    // the seam is "give the tenths number a 0 in the hundredths place, then add".
    code: "dec_add_align", family: "decimals", year: 6, mode: "component", requires: ["dec_add_carry"],
    generate: (r) => {
      const aT = until(() => r.int(1, 49), (v) => v % 10 !== 0); // tenths operand 0,1..4,9
      const bH = until(() => r.int(1, 99), (v) => v % 10 !== 0); // hundredths operand 0,01..0,99
      const ans = dec(aT * 10 + bH, 2);
      const [x, y] = r.int(0, 1) === 0 ? [answerToString(dec(aT, 1)), answerToString(dec(bH, 2))] : [answerToString(dec(bH, 2)), answerToString(dec(aT, 1))];
      return { prompt: `${x} + ${y} =`, answer: ans, steps: [`Ställ upp med kommat: ${answerToString(ans)}`] };
    },
  }),
  S({
    // Subtract UNLIKE places with a borrow across the comma: a tenths minuend minus a
    // hundredths subtrahend (< 1). The minuend's hundredths digit is 0 and the subtrahend's
    // is nonzero, so the hundredths place ALWAYS borrows — the canonical error site.
    code: "dec_sub_borrow", family: "decimals", year: 6, mode: "component", requires: ["dec_sub_same", "sub_cross_10"],
    generate: (r) => {
      const mT = r.int(2, 49);          // minuend tenths → 0,2 .. 4,9
      const M = mT * 10;                 // in hundredths
      const S = until(() => r.int(1, Math.min(M - 1, 99)), (s) => s % 10 !== 0); // subtrahend 0,01..0,99, forces borrow
      const ans = dec(M - S, 2);
      return { prompt: `${answerToString(dec(mT, 1))} − ${answerToString(dec(S, 2))} =`, answer: ans, steps: [`Låna över kommat: ${answerToString(ans)}`] };
    },
  }),
  S({
    // Decimal × a whole number. Multiply as if there were no comma, then place it back:
    // 0,3 × 4 = 1,2. The product may land whole (0,25 × 4 = 1) or stay decimal.
    code: "dec_times_whole", family: "decimals", year: 6, mode: "component", requires: ["dec_add_carry", "mult_2d_by_1d_no_carry"],
    generate: (r) => {
      const scale = r.int(1, 2);
      const v = until(() => r.int(1, 5 * 10 ** scale), (v) => v % 10 !== 0); // genuine decimal operand
      const w = r.int(2, 9);
      const ans = dec(v * w, scale);
      const opStr = answerToString(dec(v, scale));
      return { prompt: `${opStr} × ${w} =`, answer: ans, steps: [`${w} × ${opStr} = ${answerToString(ans)}`] };
    },
  }),
  S({
    // Compare two decimals of UNLIKE length as points on one number line, then type the LARGER.
    // The misconception "more digits ⇒ bigger" (0,45 > 0,5) lives in the PAIR drawn: half the
    // draws are the trap (the longer number is smaller), half honest (the longer is bigger), so
    // "pick the shortest" never works — the child must read place value. Typed, not choice, so
    // it stays sprintable → reaches a measured rate (the reading must be earned, not guessed).
    code: "dec_compare", family: "decimals", year: 5, mode: "component", requires: ["dec_read_tenths"],
    generate: (r) => {
      const aN = r.int(1, 9);                                                     // tenths value aN/10
      const bN = until(() => r.int(1, 99), (b) => b % 10 !== 0 && b !== aN * 10); // hundredths, distinct value
      const bigger = aN * 10 > bN ? dec(aN, 1) : dec(bN, 2);
      const aStr = answerToString(dec(aN, 1)), bStr = answerToString(dec(bN, 2));
      const [x, y] = r.int(0, 1) === 0 ? [aStr, bStr] : [bStr, aStr];
      return { prompt: `${x} eller ${y} =`, answer: bigger, steps: [`Störst: ${answerToString(bigger)}`] };
    },
  }),
];

/* ═══ SPELLING (subject: 'spelling') · first slice T2→T3 ════════════ year 2+ */
// Swedish spelling as a second content pack on the SAME engine (increment 4). Words live in
// lib/spelling-content.ts; the real dictation item comes via buildItem's spelling branch
// (seed→word), so `generate` here only produces SAMPLES (map thumb, chooser). Namespaced
// family 'sp_encode' (increment-3 invariant: a family never spans subjects). Sprintable — a
// typed production rung (A8). T3 (vowel length / doubling) is authored in spelling-content
// but HELD out of the graph until its recorded audio exists (A12); flip it on by adding a
// spelling_t3 skill here + registering T3_WORDS in SPELLING_POOLS.
// Three shuffled letter options for a recognition rung: the answer + two distractors from `pool`.
const letterChoices = (r: Rng, answer: string, pool: readonly string[]): ChoiceOption[] => {
  const d = pool.filter((l) => l !== answer);
  for (let i = d.length - 1; i > 0; i--) { const j = r.int(0, i); [d[i], d[j]] = [d[j], d[i]]; }
  const letters = [answer, d[0], d[1]];
  for (let i = letters.length - 1; i > 0; i--) { const j = r.int(0, i); [letters[i], letters[j]] = [letters[j], letters[i]]; }
  return letters.map((l): ChoiceOption => ({ value: l, render: "letter" }));
};

// The PRE-LITERATE recognition ladder (year 0, format:'choice', family 'sp_listen'). All "hear the
// word, tap the answer" — no writing, so a child who can't yet spell still climbs the alphabetic
// principle: initial sound (by picture, then by letter) → segment → final sound → the vowel. Each
// requires the previous (Morningside small steps). Non-sprintable for now; the fluency lane is next.
const tierSpelling: Skill[] = [
  S({
    // T0 — phonological awareness, NO letters. Hear a word, tap the PICTURE that starts with the
    // same sound (a different word from the same initial-sound group).
    code: "spelling_t0", subject: "spelling", family: "sp_listen", year: 0, mode: "component", format: "choice", requires: [],
    generate: (r) => {
      const initials = [...new Set(RECOG_WORDS.map((w) => w.initial))].filter((i) => RECOG_WORDS.filter((w) => w.initial === i).length >= 2);
      const initial = r.pick(initials);
      const group = RECOG_WORDS.filter((w) => w.initial === initial);
      const target = r.pick(group);
      const match = r.pick(group.filter((w) => w.word !== target.word)); // the correct picture: same start, different word
      const others = RECOG_WORDS.filter((w) => w.initial !== initial);
      for (let i = others.length - 1; i > 0; i--) { const j = r.int(0, i); [others[i], others[j]] = [others[j], others[i]]; }
      const opts = [match, others[0], others[1]];
      for (let i = opts.length - 1; i > 0; i--) { const j = r.int(0, i); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      return {
        prompt: "", answer: { kind: "word", text: match.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "spelling_t0", word: target.word },
          question: "Vilken börjar likadant?",
          options: opts.map((w): ChoiceOption => ({ value: w.word, render: "picture", kind: w.emoji })),
        },
      };
    },
  }),
  S({
    // T0b — segmentation. Hear a (transparent) word, tap HOW MANY sounds it has.
    code: "spelling_t0b", subject: "spelling", family: "sp_listen", year: 0, mode: "component", format: "choice", requires: ["spelling_t0"],
    generate: (r) => {
      const w = r.pick(TRANSPARENT_WORDS);
      const near = [w.sounds - 1, w.sounds + 1, w.sounds + 2].filter((n) => n >= 1 && n !== w.sounds);
      for (let i = near.length - 1; i > 0; i--) { const j = r.int(0, i); [near[i], near[j]] = [near[j], near[i]]; }
      const nums = [w.sounds, near[0], near[1]];
      for (let i = nums.length - 1; i > 0; i--) { const j = r.int(0, i); [nums[i], nums[j]] = [nums[j], nums[i]]; }
      return {
        prompt: "", answer: int(w.sounds), steps: [`${w.word}: ${w.sounds} ljud`],
        choice: {
          prompt: { show: "listen", code: "spelling_t0b", word: w.word },
          question: "Hur många ljud hör du?",
          options: nums.map((n): ChoiceOption => ({ value: n, render: "numeral" })),
        },
      };
    },
  }),
  S({
    // T1 — letter knowledge / the reading-readiness probe. Hear a word, tap the FIRST letter.
    code: "spelling_t1", subject: "spelling", family: "sp_listen", year: 0, mode: "component", format: "choice", requires: ["spelling_t0b"],
    generate: (r) => {
      const w = r.pick(TRANSPARENT_WORDS).word; // the expanded pool (102) — first-letter over many words
      const first = w[0];
      return {
        prompt: "", answer: { kind: "word", text: first }, steps: [w],
        choice: {
          prompt: { show: "listen", code: "spelling_t1", word: w },
          question: "Vilken bokstav börjar ordet på?",
          options: letterChoices(r, first, SPELLING_LETTERS),
        },
      };
    },
  }),
  S({
    // T1b — final sound → letter. Hear a (transparent) word, tap the LAST letter.
    code: "spelling_t1b", subject: "spelling", family: "sp_listen", year: 0, mode: "component", format: "choice", requires: ["spelling_t1"],
    generate: (r) => {
      const w = r.pick(TRANSPARENT_WORDS);
      const last = w.word[w.word.length - 1];
      return {
        prompt: "", answer: { kind: "word", text: last }, steps: [w.word],
        choice: {
          prompt: { show: "listen", code: "spelling_t1b", word: w.word },
          question: "Vilken bokstav slutar ordet på?",
          options: letterChoices(r, last, SPELLING_LETTERS),
        },
      };
    },
  }),
  S({
    // T1c — the vowel → letter (the hardest position on Swedish). Hear a word, tap the VOWEL.
    code: "spelling_t1c", subject: "spelling", family: "sp_listen", year: 0, mode: "component", format: "choice", requires: ["spelling_t1b"],
    generate: (r) => {
      const w = r.pick(TRANSPARENT_WORDS);
      return {
        prompt: "", answer: { kind: "word", text: w.vowel }, steps: [w.word],
        choice: {
          prompt: { show: "listen", code: "spelling_t1c", word: w.word },
          question: "Vilken vokal hör du?",
          options: letterChoices(r, w.vowel, SPELLING_VOWELS),
        },
      };
    },
  }),
  S({
    // T1.5 — the recognition→production BRIDGE. Hear the word, BUILD it by tapping its letters in
    // order from a CONSTRAINED tile set (its letters + a couple distractors, plumbed client-side) —
    // sequenced production with the letters GIVEN, before free recall on the full pad (T2). A
    // word-dictation skill (SPELLING_POOLS, seed→word); non-sprintable (scaffolded, not a clean
    // fluency measure). family sp_build (production), not sp_listen (recognition).
    code: "spelling_t15", subject: "spelling", family: "sp_build", year: 1, mode: "component", requires: ["spelling_t1c"],
    generate: (r) => { const w = r.pick(T1_5_WORDS.practice); return { prompt: "", answer: { kind: "word", text: w }, steps: [w] }; },
  }),
  S({
    // E: word dictation now REQUIRES the recognition ladder (…→t1c) — a child recognises sounds &
    // letters before free-recall writing. t15 (build-from-tiles) is the band-served soft bridge
    // between t1c and t2 (not a hard prereq: it's non-sprintable, so a hard gate would brick the
    // youngest). The p-band keeps t2 out of reach of a pre-writer until she can.
    code: "spelling_t2", subject: "spelling", family: "sp_encode", year: 2, mode: "component", requires: ["spelling_t1c"],
    generate: (r) => { const w = r.pick(T2_WORDS.practice); return { prompt: "", answer: { kind: "word", text: w }, steps: [w] }; },
  }),
  S({
    // T3 vowel length / consonant doubling (vit/vitt …). Dictated from RECORDED audio (A12);
    // the child hears the word and types the spelling, so the doubling is a real discrimination.
    code: "spelling_t3", subject: "spelling", family: "sp_double", year: 3, mode: "component", requires: ["spelling_t2"],
    generate: (r) => { const w = r.pick(T3_WORDS.practice); return { prompt: "", answer: { kind: "word", text: w }, steps: [w] }; },
  }),
];

// The cross-subject READING capability: crossing the top of the Swedish recognition ladder (letter,
// sound-segmentation and vowel recognition) = decoding-ready, "can read simple words". Earned on
// ACCURACY (recognition crossing), so a pre-literate child reaches it without the fluency system;
// an åk≥1 child seed-passes it. Any subject's rung that needs reading (English spelling, a future
// maths word-problem) points its crossRequires here. One constant, tunable.
const READING_READY = "spelling_t1c";

/* ═══ TIER · ENGLISH (L1-Swedish) — morphographic, first slice ═════════════ */
// subject:'english' — pooled, mapped, seeded and gated SEPARATELY (the increment-3 scoping the
// three-subject audit confirmed). Dictation-to-type on the letter pad, form-identical to Swedish
// spelling; the real graded item comes from buildItem's pool branch (EN_POOLS). `year` is an
// ENGLISH difficulty rung — English seeds from a beginner level (subjectSeedGrade), so year-1 is
// the easy-win floor and the ladder climbs, for every learner regardless of Swedish grade. The
// -ed RULE (holdout = generalization) is split from the irregular-past LEXICAL node (closed set),
// tagged via `kind` before content (A3). See src/lib/english-content.ts.
const tierEnglish: Skill[] = [
  // ── Phase A · RECEPTIVE vocabulary (docs/english-onramp-spec.md) — first contact, NO letters.
  // Hear an English word → tap its PICTURE (the same listen+picture rung as Swedish spelling_t0). The
  // correct picture IS the word played (direct comprehension). Four seams: cognate wins → non-cognate
  // core → same-category distractors → same-onset (sound) discrimination. Crossed on the recognition
  // gate (12 @ 90%); English seeds at grade 0 for EVERY child, so nobody skips — even the 5yo climbs.
  S({
    code: "en_noun_cognate", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: [],
    generate: (r) => {
      const { target, options } = enNounItem(r, "cognate");
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_noun_cognate", word: target.word },
          question: "Vad hör du?",
          options: options.map((w): ChoiceOption => ({ value: w.word, render: "picture", kind: w.emoji })),
        },
      };
    },
  }),
  S({
    code: "en_noun_core", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: ["en_noun_cognate"],
    generate: (r) => {
      const { target, options } = enNounItem(r, "core");
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_noun_core", word: target.word },
          question: "Vad hör du?",
          options: options.map((w): ChoiceOption => ({ value: w.word, render: "picture", kind: w.emoji })),
        },
      };
    },
  }),
  S({
    code: "en_noun_category", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: ["en_noun_core"],
    generate: (r) => {
      const { target, options } = enNounItem(r, "category");
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_noun_category", word: target.word },
          question: "Vad hör du?",
          options: options.map((w): ChoiceOption => ({ value: w.word, render: "picture", kind: w.emoji })),
        },
      };
    },
  }),
  S({
    code: "en_noun_minpair", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: ["en_noun_category"],
    generate: (r) => {
      const { target, options } = enNounItem(r, "onset");
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_noun_minpair", word: target.word },
          question: "Vad hör du?",
          options: options.map((w): ChoiceOption => ({ value: w.word, render: "picture", kind: w.emoji })),
        },
      };
    },
  }),
  // ── Phase B (increment 1) · COLOURS — hear a colour → tap the swatch (no letters). A parallel
  // receptive rung after Phase A: gives a pre-literate child (whose spelling stays reading-locked)
  // more real English to climb. Crosses on the same recognition gate.
  S({
    code: "en_color", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: ["en_noun_minpair"],
    generate: (r) => {
      const { target, options } = enColorItem(r);
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_color", word: target.word },
          question: "Vad hör du?",
          options: options.map((c): ChoiceOption => ({ value: c.word, render: "swatch", color: c.color })),
        },
      };
    },
  }),
  // ── Phase C (increment 1) · ACTION VERBS — hear a verb → tap the pictogram (TPR). SVG pictos, no
  // letters. Programming-relevant verbs (run/stop/open/look…). After colours in the receptive ramp.
  S({
    code: "en_verb_action", subject: "english", family: "en_hear", year: 0, mode: "component", format: "choice", requires: ["en_color"],
    generate: (r) => {
      const { target, options } = enVerbItem(r);
      return {
        prompt: "", answer: { kind: "word", text: target.word }, steps: [target.word],
        choice: {
          prompt: { show: "listen", code: "en_verb_action", word: target.word },
          question: "Vad hör du?",
          options: options.map((v): ChoiceOption => ({ value: v.word, render: "picto", kind: v.picto })),
        },
      };
    },
  }),
  // ── Phase F · the morphographic slice — re-parented onto the receptive ramp AND reading-gated. It
  // is English SPELLING (produce the word), so it needs both: the English receptive ramp (requires) AND
  // READING, earned in Swedish (crossRequires READING_READY = spelling_t1c, the top of the Swedish
  // recognition ladder). A pre-literate child keeps her English COMPREHENSION open (Phases A–C) while
  // this production rung stays closed until she can read — the cross-subject relationship Erik asked
  // for. An åk≥1 child seed-passes the Swedish reading rung, so the gate is transparent for readers.
  S({
    code: "en_ed_regular", subject: "english", family: "en_verb", year: 1, mode: "component", kind: "rule",
    requires: ["en_noun_minpair"], crossRequires: [READING_READY],
    generate: (r) => { const w = r.pick(EN_ED_REGULAR.practice); return { prompt: "", answer: { kind: "word", text: w }, steps: [w] }; },
  }),
  S({
    code: "en_past_irregular", subject: "english", family: "en_irreg", year: 2, mode: "component", kind: "lexical", requires: ["en_ed_regular"],
    generate: (r) => { const w = r.pick(EN_PAST_IRREGULAR.practice); return { prompt: "", answer: { kind: "word", text: w }, steps: [w] }; },
  }),
];

/* ═══ export ══════════════════════════════════════════════════════════ */

export const SKILLS: Skill[] = [...tierGround, ...tier0, ...tier1, ...tier2, ...tierDecimals, ...tier3, ...tier4, ...tier5, ...tier6, ...tier7, ...tier8, ...tierSpelling, ...tierEnglish];

export const BY_CODE = new Map(SKILLS.map((s) => [s.code, s]));

// Prerequisite depth: 0 for a skill with no prerequisites, else 1 + the deepest
// prerequisite. Orders skills WITHIN a year by how far into the DAG they sit, so the
// curriculum profile reads left→right as genuine progression, not alphabetically.
// Memoized; the graph is acyclic (validated), so the recursion terminates.
const _depth = new Map<string, number>();
export function skillDepth(code: string): number {
  const cached = _depth.get(code);
  if (cached != null) return cached;
  const s = BY_CODE.get(code);
  const d = !s || s.requires.length === 0 ? 0 : 1 + Math.max(...s.requires.map(skillDepth));
  _depth.set(code, d);
  return d;
}

/**
 * Seed theta from the child's school year. There is no beta.
 *
 * Anchored so the child's PREVIOUS year sits at the 0.80 target (a warm-up they
 * get right), not below it. The old anchor (0.6·delta, clamped [-1.5, 1.0]) put
 * every skill two-plus years behind at p≈0.73 — nearer the target than the
 * child's actual year (p=0.5) — so a competent ten-year-old opened on number
 * bonds. This anchor fixes that:
 *   delta=1 (last year)  -> θ=1.4,  p≈0.80   warm-up, correct
 *   delta=0 (this year)  -> θ=0.6,  p≈0.65   being taught now
 *   delta=3              -> θ=3.0,  p≈0.95   far from target; only spacing serves it
 * Constants are guesses; the shape is checked by the phase-2 simulation.
 */
export function seedTheta(childYear: number, skill: Skill): number {
  const delta = childYear - skill.year;
  const base = Math.max(-2.0, Math.min(3.0, 1.4 + 0.8 * (delta - 1)));
  // start-from-below.md §2: the entry tier is always a genuine easy win (p ≈ 0.92),
  // for EVERY child regardless of grade — so a behind kid opens on problems he can
  // do and the app finds his level by climbing up, never by dropping after he
  // fails. The grade only decides how far up the easy floor extends; it can never
  // place the opener above it. (Supersedes the old "don't open on number bonds"
  // anchor: opening easy then climbing is the point.)
  if (skill.year <= 1) return Math.max(base, 2.4);
  return base;
}

/** Transitive closure of `requires`. */
export function ancestors(code: string, seen = new Set<string>()): Set<string> {
  for (const r of BY_CODE.get(code)?.requires ?? []) {
    if (!seen.has(r)) { seen.add(r); ancestors(r, seen); }
  }
  return seen;
}

/* ══ app-facing helpers (not part of the delivered graph) ══════════════ */

export function skillByCode(code: string): Skill {
  const s = BY_CODE.get(code);
  if (!s) throw new Error(`unknown skill code: ${code}`);
  return s;
}

/** Canonical answer string for storage and grading. */
export function answerToString(a: Answer): string {
  if (a.kind === "word") return a.text; // already canonical lower-case (A16)
  if (a.kind === "int") return String(a.v);
  if (a.kind === "dec") {
    const p = 10 ** a.scale, abs = Math.abs(a.v);
    return `${a.v < 0 ? "-" : ""}${Math.floor(abs / p)},${String(abs % p).padStart(a.scale, "0")}`;
  }
  return `${a.n}/${a.d}`;
}

export type CanonItem = { prompt: string; answer: string; steps: string[]; choice?: ChoiceSpec };

export function generateCanon(code: string, r: Rng): CanonItem {
  const it = skillByCode(code).generate(r);
  return { prompt: it.prompt, answer: answerToString(it.answer), steps: it.steps, choice: it.choice };
}

/** Swedish school year for a child: year 1 begins the year they turn 7. */
export function schoolYear(birthYear: number, currentYear: number): number {
  return currentYear - birthYear - 6;
}

export function seedThetaForChild(birthYear: number, currentYear: number, skill: Skill): number {
  return seedTheta(schoolYear(birthYear, currentYear), skill);
}
