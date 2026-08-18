import { describe, it, expect } from 'vitest';
import { BUILDS, BUILDS_BY_ID, SLICE1_SKILL_PREREQS, LJUSSLINGAN_SKILL_PREREQS } from '@/lib/electronics-builds';
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

  it('ljusslingan is authored, at the 3 V tier, and every one of its 4 skills is a real electronics skill', () => {
    const b = BUILDS_BY_ID.get('build_ljusslingan');
    expect(b, 'build_ljusslingan should be authored').toBeDefined();
    expect(b!.voltage_tier).toBe('3v');
    // E1·E3·E6·E9 → the four-skill subset (STEAM's chip E24 is dropped; not built yet)
    expect([...b!.skill_prereqs].sort()).toEqual(
      ['elec_breadboard', 'elec_loop', 'elec_polarity', 'elec_symbol_match'].sort(),
    );
    for (const code of b!.skill_prereqs) {
      const skill = BY_CODE.get(code);
      expect(skill, `ljusslingan references missing skill "${code}"`).toBeDefined();
      expect(skill?.subject).toBe('electronics');
    }
    // and the named const matches the build's prereqs (one source of truth)
    expect([...b!.skill_prereqs]).toEqual([...LJUSSLINGAN_SKILL_PREREQS]);
    // its skills are a SUBSET of the eight (no skill invented for it)
    for (const code of LJUSSLINGAN_SKILL_PREREQS) {
      expect(SLICE1_SKILL_PREREQS as readonly string[]).toContain(code);
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
