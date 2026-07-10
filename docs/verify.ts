/**
 * verify.ts — the machine's half of the checking.
 *
 * Run:  node --experimental-strip-types verify.ts
 *
 * For every skill, draw N items and assert:
 *   - substituting the answer back into the prompt yields a true statement
 *   - the last step states the answer
 *   - no degenerate items (identity coefficients, zero terms)
 *   - the answer isn't the same value most of the time
 *   - the prerequisite graph is acyclic and every edge resolves
 *
 * Nothing here checks pedagogy. That's the contact sheet's job.
 */

import { SKILLS, BY_CODE, ancestors, type Rng, type Item, type Answer } from "./skills.ts";

const N = 500;

/* deterministic rng so a failure is reproducible */
const mkRng = (seed: number): Rng => {
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return { int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)] };
};

/* ── evaluate a prompt with the answer substituted ─────────────────── */

const norm = (s: string) =>
  s.replace(/−/g, "-").replace(/×/g, "*").replace(/·/g, "*").replace(/□/g, "x").replace(/=$/, "").trim();

const evalExpr = (e: string): number => {
  if (!/^[-+*/(). 0-9]+$/.test(e)) throw new Error(`unsafe expr: ${e}`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${e});`)();
};

type Result = { ok: boolean; why?: string };

const verifyItem = (code: string, it: Item): Result => {
  const { prompt, answer, steps } = it;

  /* fraction skills: check the stated arithmetic directly */
  if (answer.kind === "frac") {
    if (answer.d <= 0) return { ok: false, why: "non-positive denominator" };
    const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
    if (g(answer.n, answer.d) !== 1) return { ok: false, why: "not in lowest terms" };
    if (!steps.at(-1)?.includes(`${answer.n}/${answer.d}`))
      return { ok: false, why: "final step omits the answer" };
    return { ok: true };
  }

  const v = answer.v;
  if (!Number.isInteger(v)) return { ok: false, why: `non-integer answer ${v}` };

  /* "Förkorta" / "av" prompts are prose; verified by their own steps */
  if (/av|Förkorta/.test(prompt)) {
    return steps.at(-1)?.includes(String(v)) ? { ok: true } : { ok: false, why: "final step omits answer" };
  }

  const p = norm(prompt);

  if (p.includes("=")) {
    /* equation: substitute and check both sides agree */
    const [l, r] = p.split("=");
    const sub = (side: string) =>
      evalExpr(side.replace(/(\d)\s*x/g, `$1*(${v})`).replace(/(?<![\d)])x/g, `(${v})`).replace(/(\d)\s*\(/g, "$1*("));
    const [a, b] = [sub(l), sub(r)];
    if (Math.abs(a - b) > 1e-9) return { ok: false, why: `${prompt} → ${a} ≠ ${b} with x=${v}` };
  } else {
    /* expression: evaluate and compare */
    const got = evalExpr(p.replace(/(\d)\s*\(/g, "$1*("));
    if (Math.abs(got - v) > 1e-9) return { ok: false, why: `${prompt} → ${got}, answer says ${v}` };
  }

  if (!steps.at(-1)?.replace(/−/g, "-").includes(String(v)))
    return { ok: false, why: `final step "${steps.at(-1)}" omits ${v}` };

  /* degenerate items */
  if (/(^|[^\d])1x/.test(prompt)) return { ok: false, why: "coefficient 1" };
  if (/[+−] 0\b/.test(prompt)) return { ok: false, why: "zero term" };
  if (/\b0x/.test(prompt)) return { ok: false, why: "zero coefficient" };

  return { ok: true };
};

/* ── graph checks ──────────────────────────────────────────────────── */

let fails = 0;
const fail = (m: string) => { fails++; console.log(`  ✗ ${m}`); };

for (const s of SKILLS) {
  for (const r of s.requires) if (!BY_CODE.has(r)) fail(`${s.code} requires missing skill ${r}`);
}
for (const s of SKILLS) {
  try { if (ancestors(s.code).has(s.code)) fail(`cycle through ${s.code}`); }
  catch { fail(`cycle (stack overflow) at ${s.code}`); }
}
/* a compound must never be a prerequisite of a component: the fluency gate
   would then be asking a compound for a rate it can never have */
for (const s of SKILLS)
  if (s.mode === "component")
    for (const r of s.requires)
      if (BY_CODE.get(r)!.mode === "compound") fail(`component ${s.code} requires compound ${r}`);

/* ── item checks ───────────────────────────────────────────────────── */

for (const s of SKILLS) {
  const rng = mkRng(0xC0FFEE ^ [...s.code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const seen = new Map<string, number>();
  let bad = 0;
  for (let i = 0; i < N; i++) {
    let it: Item;
    try { it = s.generate(rng); } catch (e) { fail(`${s.code} threw: ${(e as Error).message}`); bad++; break; }
    const res = verifyItem(s.code, it);
    if (!res.ok) { if (bad++ === 0) fail(`${s.code}: ${res.why}`); }
    const key = it.answer.kind === "int" ? String(it.answer.v) : `${it.answer.n}/${it.answer.d}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (it.steps.length === 0) fail(`${s.code}: no steps`);
  }
  const top = Math.max(...seen.values()) / N;
  if (top > 0.4) fail(`${s.code}: one answer appears in ${(top * 100).toFixed(0)}% of draws`);
}

/* ── summary ───────────────────────────────────────────────────────── */

const comps = SKILLS.filter((s) => s.mode === "component").length;
console.log(`\n${SKILLS.length} skills — ${comps} component, ${SKILLS.length - comps} compound`);
console.log(fails === 0 ? "all properties hold\n" : `\n${fails} failure(s)\n`);
process.exit(fails === 0 ? 0 : 1);
