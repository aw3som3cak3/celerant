import { describe, it, expect } from 'vitest';
import { BUILDS, BUILDS_BY_ID, SLICE1_SKILL_PREREQS, LJUSSLINGAN_SKILL_PREREQS, LARMET_SKILL_PREREQS, NATTLAMPAN_SKILL_PREREQS } from '@/lib/electronics-builds';
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

  it('larmet is authored, at the 5 V tier, and every one of its 5 skills is a real electronics skill', () => {
    const b = BUILDS_BY_ID.get('build_larmet');
    expect(b, 'build_larmet should be authored').toBeDefined();
    expect(b!.voltage_tier).toBe('5v');
    // E1·E4·E6·E8·E9 — incl. the two NEW slice-2 skills (power source, switch)
    expect([...b!.skill_prereqs].sort()).toEqual(
      ['elec_breadboard', 'elec_loop', 'elec_power_source', 'elec_switch', 'elec_symbol_match'].sort(),
    );
    for (const code of b!.skill_prereqs) {
      const skill = BY_CODE.get(code);
      expect(skill, `larmet references missing skill "${code}"`).toBeDefined();
      expect(skill?.subject).toBe('electronics');
    }
    // the named const matches the build's prereqs (one source of truth)
    expect([...b!.skill_prereqs]).toEqual([...LARMET_SKILL_PREREQS]);
    // a 5 V leaf build: the fem_volt körkort owns the tier climb, so the build grants nothing
    expect(b!.grants).toEqual([]);
    expect(b!.equipment_prereqs).toContain('elec_cap_owns_breadboard');
  });

  it('nattlampan is authored, at the 5 V tier, and every one of its 6 skills is a real electronics skill', () => {
    const b = BUILDS_BY_ID.get('build_nattlampan');
    expect(b, 'build_nattlampan should be authored').toBeDefined();
    expect(b!.voltage_tier).toBe('5v');
    // E1·E4·E6·E9·E16·E22 — incl. the two NEW slice-3 skills (sensor, transistor)
    expect([...b!.skill_prereqs].sort()).toEqual(
      ['elec_breadboard', 'elec_loop', 'elec_power_source', 'elec_sensor', 'elec_symbol_match', 'elec_transistor'].sort(),
    );
    for (const code of b!.skill_prereqs) {
      const skill = BY_CODE.get(code);
      expect(skill, `nattlampan references missing skill "${code}"`).toBeDefined();
      expect(skill?.subject).toBe('electronics');
    }
    // the named const matches the build's prereqs (one source of truth)
    expect([...b!.skill_prereqs]).toEqual([...NATTLAMPAN_SKILL_PREREQS]);
    // a 5 V leaf build: the fem_volt körkort owns the tier climb, so the build grants nothing (§10.2)
    expect(b!.grants).toEqual([]);
    expect(b!.equipment_prereqs).toContain('elec_cap_owns_breadboard');
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
