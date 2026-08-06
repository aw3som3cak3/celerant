import { describe, it, expect } from 'vitest';
import { SKILLS } from '@/skills';
import { skillLabel } from '@/lib/labels';

// Guard against the "not proper locale" bug (one-ova-track note): a skill missing
// from labels.ts falls through to the raw humanized code ("ground structure"),
// which reads as untranslated English in the Swedish picker. Every skill the
// chooser can surface must have an explicit Swedish label (or a table/regex one).
describe('skill label coverage', () => {
  it('no skill falls through to its raw humanized code', () => {
    const raw = SKILLS.filter((s) => skillLabel(s.code) === s.code.replace(/_/g, ' ')).map((s) => s.code);
    expect(raw).toEqual([]);
  });
});
