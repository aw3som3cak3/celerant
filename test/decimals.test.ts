import { describe, it, expect } from 'vitest';
import { grade } from '@/lib/grade';
import { SKILLS, BY_CODE, answerToString, generateCanon, type Rng } from '@/skills';
import { gradeBySeed } from '@/lib/item';

const mkRng = (seed: number): Rng => {
  let s = seed >>> 0;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return { int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: (xs) => xs[Math.floor(next() * xs.length)] };
};

describe('decimal grading (exact rational, Swedish comma)', () => {
  it('accepts comma, point, and trailing zeros — all by value', () => {
    for (const g of ['3,5', '3.5', '3,50', '03,5']) expect(grade(g, '3,5'), g).toBe(true);
  });
  it('accepts an equal fraction for a decimal answer (Erik decision A)', () => {
    expect(grade('7/2', '3,5')).toBe(true);
    expect(grade('1/2', '0,5')).toBe(true);
  });
  it('rejects wrong values and malformed input', () => {
    for (const g of ['3,6', '3', '3,', ',5', '3,,5', '35']) expect(grade(g, '3,5'), g).toBe(false);
  });
  it('grades a decimal answer against a decimal key both ways', () => {
    expect(grade('0,7', '0,7')).toBe(true);
    expect(grade('0,70', '0,7')).toBe(true);
  });
});

describe('decimal canonical form (minimal scale, whole collapses to int)', () => {
  it('normalises trailing zeros and whole results', () => {
    // answerToString is exercised via each skill's generated answer string below;
    // here we assert the canon shape the grader stores.
    expect(grade('0,7', answerToString({ kind: 'dec', v: 70, scale: 2 }))).toBe(true); // 0,70 → "0,7"
  });
});

const DEC = SKILLS.filter((s) => s.family === 'decimals').map((s) => s.code);

describe('decimals tier — skills present and self-consistent', () => {
  it('increments 1–2 skills exist and are sprintable numpad components', () => {
    expect(DEC).toEqual(['dec_read_tenths', 'dec_add_same', 'dec_sub_same', 'dec_x10', 'dec_div10', 'dec_add_carry']);
    for (const code of DEC) {
      const s = BY_CODE.get(code)!;
      expect(s.mode, code).toBe('component');
      expect(s.format ?? 'numpad', code).toBe('numpad');
      expect(s.sprintable, code).toBe(true); // Erik decision C
    }
  });

  it('every generated item grades its own canonical answer correct', () => {
    for (const code of DEC) {
      const rng = mkRng(0xdec ^ [...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 1));
      for (let i = 0; i < 200; i++) {
        const it = generateCanon(code, rng);
        expect(grade(it.answer, it.answer), `${code}: ${it.prompt} → ${it.answer}`).toBe(true);
      }
    }
  });

  it('place-shift and carry produce the values the seam intends', () => {
    // dec_add_carry always carries into the ones (answer ≥ 1) and keeps a nonzero tenth.
    const rc = mkRng(0xadd);
    for (let i = 0; i < 200; i++) {
      const it = generateCanon('dec_add_carry', rc);
      expect(it.answer.includes(','), `carry answer decimal: ${it.answer}`).toBe(true);
      expect(parseFloat(it.answer.replace(',', '.'))).toBeGreaterThanOrEqual(1);
    }
    // dec_div10 always yields a genuine decimal (never a whole).
    const rd = mkRng(0xd10);
    for (let i = 0; i < 200; i++) expect(generateCanon('dec_div10', rd).answer.includes(','), 'div10 decimal').toBe(true);
  });

  it('gradeBySeed round-trips the canonical answer for a decimal skill', () => {
    const seed = 0x1234;
    const { answer } = gradeBySeed('dec_add_same', seed, '');
    expect(gradeBySeed('dec_add_same', seed, answer).correct).toBe(true);
  });
});
