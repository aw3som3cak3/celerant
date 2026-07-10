// Ported from the delivered docs/icons.check.ts, wired into CI.
import { describe, it, expect } from 'vitest';
import { ICONS, BY_KEY, PAIR_COUNT, search, familyKey, CATEGORIES } from '@/icons';

describe('icon set', () => {
  it('keys and glyphs are unique', () => {
    expect(BY_KEY.size).toBe(ICONS.length);
    expect(new Set(ICONS.map((i) => i.glyph)).size).toBe(ICONS.length);
  });

  it('every icon is well-formed', () => {
    for (const i of ICONS) {
      expect(/^[a-z0-9_]+$/.test(i.key), `bad key ${i.key}`).toBe(true);
      expect(i.keywords.length, `${i.key}: no keywords`).toBeGreaterThanOrEqual(1);
      expect(CATEGORIES.includes(i.category), `${i.key}: unknown category`).toBe(true);
    }
  });

  it('no forbidden codepoints (faces/people/flags/skin-tone)', () => {
    for (const i of ICONS) {
      const cp = [...i.glyph].map((c) => c.codePointAt(0)!);
      const bad = cp.some(
        (c) =>
          (c >= 0x1f600 && c <= 0x1f64f) ||
          (c >= 0x1f466 && c <= 0x1f487) ||
          (c >= 0x1f1e6 && c <= 0x1f1ff) ||
          (c >= 0x1f3fb && c <= 0x1f3ff),
      );
      expect(bad, `${i.key}: forbidden codepoint range`).toBe(false);
    }
  });

  it('search works, diacritic-folded, for parents', () => {
    expect(search('hotdog').length + search('varmkorv').length).toBeGreaterThan(0);
    expect(search('kott').length, 'diacritic folding kott → kött').toBeGreaterThan(0);
    expect(search('korv').some((i) => i.key === 'hotdog')).toBe(true);
  });

  it('a family is a canonical unordered pair of distinct icons', () => {
    expect(() => familyKey('fox', 'fox')).toThrow();
    expect(familyKey('hotdog', 'fox')).toBe(familyKey('fox', 'hotdog'));
    expect(PAIR_COUNT).toBe((ICONS.length * (ICONS.length - 1)) / 2);
  });
});
