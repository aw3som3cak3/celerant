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

export type Rng = {
  int(a: number, b: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
};

export type Answer =
  | { kind: "int"; v: number }
  | { kind: "frac"; n: number; d: number }; // always in lowest terms

export type Item = {
  prompt: string; // "3x + 7 = 22"  |  "47 + 28 ="
  answer: Answer;
  steps: string[]; // shown on the second miss; genuine intermediate lines
};

export type Skill = {
  code: string;
  family: string;
  year: number; // Lgr22 school year
  mode: "component" | "compound"; // only components may be sprinted
  requires: string[];
  generate(r: Rng): Item;
};

/* ── helpers ─────────────────────────────────────────────────────────── */

const int = (v: number): Answer => ({ kind: "int", v });

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d: number): Answer => {
  const g = gcd(n, d) || 1;
  return { kind: "frac", n: n / g, d: d / g };
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

const S = (s: Omit<Skill, "family"> & { family?: string }): Skill => ({
  family: s.code.split("_")[0],
  ...s,
} as Skill);

/* ═══ TIER 1 · additive within 20 ═══════════════════════════════ year 1 */

const tier1: Skill[] = [
  S({
    code: "add_within_10", year: 1, mode: "component", requires: [],
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

/* ═══ export ══════════════════════════════════════════════════════════ */

export const SKILLS: Skill[] = [...tier1, ...tier2, ...tier3, ...tier4, ...tier5, ...tier6, ...tier7, ...tier8];

export const BY_CODE = new Map(SKILLS.map((s) => [s.code, s]));

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
  return Math.max(-2.0, Math.min(3.0, 1.4 + 0.8 * (delta - 1)));
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
  return a.kind === "int" ? String(a.v) : `${a.n}/${a.d}`;
}

export type CanonItem = { prompt: string; answer: string; steps: string[] };

export function generateCanon(code: string, r: Rng): CanonItem {
  const it = skillByCode(code).generate(r);
  return { prompt: it.prompt, answer: answerToString(it.answer), steps: it.steps };
}

/** Swedish school year for a child: year 1 begins the year they turn 7. */
export function schoolYear(birthYear: number, currentYear: number): number {
  return currentYear - birthYear - 6;
}

export function seedThetaForChild(birthYear: number, currentYear: number, skill: Skill): number {
  return seedTheta(schoolYear(birthYear, currentYear), skill);
}
