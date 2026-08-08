import { describe, it, expect } from 'vitest';
import { SKILLS } from '@/skills';

// The family-namespacing invariant (spelling increment 3, register decision for
// analysis.ts family aggregation). That site filters SKILLS by `family` and is safe ONLY
// if a family never spans two subjects — otherwise a bare family could straddle maths and
// spelling. This static check enforces the namespacing rule at CI time, so the moment
// increment 4 adds a spelling skill whose family collides with a maths family, it FAILS
// here rather than silently cross-contaminating a transfer/crossover analysis.
describe('subject invariants', () => {
  it('no family belongs to more than one subject', () => {
    const familySubjects = new Map<string, Set<string>>();
    for (const s of SKILLS) {
      if (!familySubjects.has(s.family)) familySubjects.set(s.family, new Set());
      familySubjects.get(s.family)!.add(s.subject);
    }
    const straddling = [...familySubjects].filter(([, subs]) => subs.size > 1).map(([fam, subs]) => `${fam}: ${[...subs].join('+')}`);
    expect(straddling, `families spanning subjects: ${straddling.join(', ')}`).toEqual([]);
  });

  it('every skill has a subject (default honoured)', () => {
    for (const s of SKILLS) expect(s.subject, s.code).toBeTruthy();
  });
});
