import { describe, it, expect } from 'vitest';
import { BUILDS, SLICE1_SKILL_PREREQS } from '@/lib/electronics-builds';
import { BY_CODE } from '@/skills';

// The A/B seam: the build ladder (agent B) references electronics skills (agent A) by string code.
// If a build's skill_prereq is not a real registered skill, fluencySignal() returns met:false for
// it forever and the build is silently un-completable. This guards that contract at both ends.
describe('electronics build ↔ skill-graph integration (the A/B seam)', () => {
  it('every skill_prereq of every build is a real skill in BY_CODE', () => {
    for (const b of BUILDS) {
      for (const code of b.skill_prereqs) {
        expect(BY_CODE.get(code), `build "${b.id}" references missing skill "${code}"`).toBeDefined();
      }
    }
  });

  it('every referenced electronics skill is tagged subject:electronics', () => {
    for (const code of SLICE1_SKILL_PREREQS) {
      expect(BY_CODE.get(code)?.subject, `"${code}" should be subject:electronics`).toBe('electronics');
    }
  });

  it('slice-1 wires all 8 documented skills (no rung dropped)', () => {
    expect([...SLICE1_SKILL_PREREQS].sort()).toEqual(
      [
        'elec_breadboard',
        'elec_colour_value',
        'elec_id_parts',
        'elec_loop',
        'elec_not_consumed',
        'elec_polarity',
        'elec_resistor_pick',
        'elec_symbol_match',
      ].sort(),
    );
  });
});
