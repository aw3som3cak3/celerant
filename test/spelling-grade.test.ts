import { describe, it, expect } from 'vitest';
import { grade } from '@/lib/grade';
import { answerToString, type Answer } from '@/skills';

// Increment 1 — the string-answer foundation. The grader branches on whether the CANONICAL
// answer parses as a rational: numbers stay numeric (maths, unchanged), a word is matched
// case-insensitively against its stored lower-case canonical (A16). Real Swedish words
// never parse as rationals, so maths can never be misrouted into the word branch.

describe('word grading (A16: lower-case canonical, case-insensitive)', () => {
  const canon = answerToString({ kind: 'word', text: 'sol' } as Answer);

  it('canonical form is the stored lower-case text', () => {
    expect(canon).toBe('sol');
  });

  it('accepts any shift-state: SOL, Sol, sol, with edge whitespace', () => {
    for (const given of ['sol', 'SOL', 'Sol', 'sOl', '  sol ', 'SOL ']) {
      expect(grade(given, canon), `"${given}"`).toBe(true);
    }
  });

  it('rejects a genuinely different spelling', () => {
    for (const given of ['sål', 'so', 'soll', 'zol', '']) {
      expect(grade(given, canon), `"${given}"`).toBe(false);
    }
  });

  it('does not collapse internal spaces — särskrivning is not silently forgiven', () => {
    const compound = answerToString({ kind: 'word', text: 'havsörn' } as Answer);
    expect(grade('havs örn', compound)).toBe(false);
    expect(grade('havsörn', compound)).toBe(true);
    expect(grade('HavsÖrn', compound)).toBe(true); // case still forgiven
  });

  it('handles å ä ö', () => {
    const word = answerToString({ kind: 'word', text: 'kött' } as Answer);
    expect(grade('KÖTT', word)).toBe(true);
    expect(grade('kott', word)).toBe(false);
  });
});

describe('maths grading is untouched by the word branch', () => {
  it('integers and fractions grade exactly as before', () => {
    expect(grade('7', '7')).toBe(true);
    expect(grade('07', '7')).toBe(true); // parseInt, as before
    expect(grade('8', '7')).toBe(false);
    expect(grade('3/4', '3/4')).toBe(true);
    expect(grade('6/8', '3/4')).toBe(true); // reduced compare, as before
    expect(grade('sol', '7')).toBe(false); // a word given for a numeric answer → wrong
  });
});
