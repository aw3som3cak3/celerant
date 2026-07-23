/**
 * verify.test.ts — the machine's half of the checking, wired into CI.
 *
 * Ported from the delivered docs/verify.ts. For every skill, draw N items and
 * assert: substituting the answer back into the prompt yields a true statement;
 * the last step states the answer; no degenerate items; no single answer value
 * dominates; the prerequisite graph is acyclic with every edge resolving; and no
 * component requires a compound (the fluency gate would ask a compound for a
 * rate it can never have).
 */
import { describe, it, expect } from 'vitest';
import { SKILLS, BY_CODE, ancestors, type Rng, type Item } from '@/skills';
import { extractFeatures } from '@/lib/features';

const N = 500;

const mkRng = (seed: number): Rng => {
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return { int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)] };
};

const norm = (s: string) =>
  s.replace(/−/g, '-').replace(/×/g, '*').replace(/·/g, '*').replace(/□/g, 'x').replace(/=$/, '').trim();

const evalExpr = (e: string): number => {
  if (!/^[-+*/(). 0-9]+$/.test(e)) throw new Error(`unsafe expr: ${e}`);
  return Function(`"use strict"; return (${e});`)();
};

type Result = { ok: boolean; why?: string };

const verifyItem = (it: Item): Result => {
  const { prompt, answer, steps } = it;

  if (answer.kind === 'frac') {
    if (answer.d <= 0) return { ok: false, why: 'non-positive denominator' };
    const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
    if (g(answer.n, answer.d) !== 1) return { ok: false, why: 'not in lowest terms' };
    if (!steps.at(-1)?.includes(`${answer.n}/${answer.d}`)) return { ok: false, why: 'final step omits the answer' };
    return { ok: true };
  }

  const v = answer.v;
  if (!Number.isInteger(v)) return { ok: false, why: `non-integer answer ${v}` };

  // Pre-symbolic pictorial rungs (tier 0: more_or_less / count / add_within_5) show
  // emoji groups, not digits — there is no arithmetic string to evaluate. Verify what
  // DOES apply: a non-negative integer answer the final step states.
  if (!/\d/.test(prompt)) {
    if (v < 0) return { ok: false, why: `negative pictorial answer ${v}` };
    return steps.at(-1)?.includes(String(v)) ? { ok: true } : { ok: false, why: 'final step omits answer' };
  }

  if (/av|Förkorta/.test(prompt)) {
    return steps.at(-1)?.includes(String(v)) ? { ok: true } : { ok: false, why: 'final step omits answer' };
  }

  const p = norm(prompt);

  if (p.includes('=')) {
    const [l, r] = p.split('=');
    const sub = (side: string) =>
      evalExpr(side.replace(/(\d)\s*x/g, `$1*(${v})`).replace(/(?<![\d)])x/g, `(${v})`).replace(/(\d)\s*\(/g, '$1*('));
    const [a, b] = [sub(l), sub(r)];
    if (Math.abs(a - b) > 1e-9) return { ok: false, why: `${prompt} → ${a} ≠ ${b} with x=${v}` };
  } else {
    const got = evalExpr(p.replace(/(\d)\s*\(/g, '$1*('));
    if (Math.abs(got - v) > 1e-9) return { ok: false, why: `${prompt} → ${got}, answer says ${v}` };
  }

  if (!steps.at(-1)?.replace(/−/g, '-').includes(String(v)))
    return { ok: false, why: `final step "${steps.at(-1)}" omits ${v}` };

  if (/(^|[^\d])1x/.test(prompt)) return { ok: false, why: 'coefficient 1' };
  if (/[+−] 0\b/.test(prompt)) return { ok: false, why: 'zero term' };
  if (/\b0x/.test(prompt)) return { ok: false, why: 'zero coefficient' };

  return { ok: true };
};

describe('graph invariants', () => {
  it('every requires edge resolves', () => {
    for (const s of SKILLS) for (const r of s.requires) expect(BY_CODE.has(r), `${s.code} → ${r}`).toBe(true);
  });
  it('the graph is acyclic', () => {
    for (const s of SKILLS) expect(ancestors(s.code).has(s.code), `cycle through ${s.code}`).toBe(false);
  });
  it('no component requires a compound', () => {
    for (const s of SKILLS)
      if (s.mode === 'component')
        for (const r of s.requires)
          expect(BY_CODE.get(r)!.mode, `component ${s.code} requires compound ${r}`).not.toBe('compound');
  });
});

describe('feature tags evaluate to the answer (instrumentation.md §2.4)', () => {
  for (const s of SKILLS) {
    it(`${s.code}`, () => {
      const rng = mkRng(0xfea70 ^ [...s.code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 3));
      for (let i = 0; i < 60; i++) {
        const it = s.generate(rng);
        const ansStr = it.answer.kind === 'int' ? String(it.answer.v) : `${it.answer.n}/${it.answer.d}`;
        const ansNum = it.answer.kind === 'int' ? it.answer.v : it.answer.n / it.answer.d;
        const f = extractFeatures(s.code, it.prompt, ansStr);

        // Pre-symbolic pictorial rungs (tier 0) carry no digit operands by design; the
        // rest must parse at least one. answer_magnitude is derived from the answer, so
        // it holds for both.
        if (/\d/.test(it.prompt)) {
          expect(f.operands.length, `${s.code}: no operands parsed from "${it.prompt}"`).toBeGreaterThan(0);
        }
        expect(f.answer_magnitude).toBeCloseTo(Math.abs(ansNum), 9);

        // Direct two-operand arithmetic: the tagged operands, combined by the
        // tagged operation, must reproduce the stored answer.
        if (['add', 'sub', 'mul', 'div'].includes(f.operation) && f.operands.length === 2 && !it.prompt.includes('□')) {
          const [a, b] = f.operands;
          const got = f.operation === 'add' ? a + b : f.operation === 'sub' ? a - b : f.operation === 'mul' ? a * b : a / b;
          expect(got, `${s.code}: ${a} ${f.operation} ${b} ≠ ${ansNum} ("${it.prompt}")`).toBeCloseTo(ansNum, 9);
        }
      }
    });
  }
});

describe('item properties (500 deterministic draws per skill)', () => {
  for (const s of SKILLS) {
    it(`${s.code}`, () => {
      const rng = mkRng(0xc0ffee ^ [...s.code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
      const seen = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const it = s.generate(rng);
        const res = verifyItem(it);
        expect(res.ok, res.why).toBe(true);
        expect(it.steps.length).toBeGreaterThan(0);
        const key = it.answer.kind === 'int' ? String(it.answer.v) : `${it.answer.n}/${it.answer.d}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const top = Math.max(...seen.values()) / N;
      expect(top, `one answer appears in ${(top * 100).toFixed(0)}% of draws`).toBeLessThanOrEqual(0.4);
    });
  }
});
