import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// practice.ts is 'server-only' and pulls in the db, so give it a scratch database before import
// (same discipline as cross-subject-gate.test.ts).
const dir = mkdtempSync(path.join(tmpdir(), 'celerant-elec-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { INTRODUCE_SKILLS } from '@/lib/practice';
import { selectItem, type SelState } from '@/lib/selector';

// The electronics recognition + model rungs are brand-new to EVERY player, so grade-seeding marks
// them fluent and they'd be perpetually skipped (the double/half problem). They must be on the
// introduce list so established players actually meet them.
const NEW_CONTENT = ['elec_loop', 'elec_not_consumed', 'elec_polarity', 'elec_id_parts', 'elec_symbol_match'];

describe('electronics — novel-intro seed guard', () => {
  it('every recognition + model rung is on INTRODUCE_SKILLS', () => {
    for (const code of NEW_CONTENT) expect(INTRODUCE_SKILLS.has(code), code).toBe(true);
  });

  it('the calculation rungs are NOT introduced (they reach the child through the maths gate)', () => {
    for (const code of ['elec_resistor_pick', 'elec_colour_value', 'elec_series_add']) {
      expect(INTRODUCE_SKILLS.has(code), code).toBe(false);
    }
  });

  it('an established child is introduced to a never-seen, seed-fluent electronics model rung', () => {
    const mk = (over: Partial<SelState> & { code: string }): SelState => ({
      family: 'f', year: 1, mode: 'component', skillId: 0, theta: 2.4, lastSeenAt: null, requires: [],
      rate: { source: 'provisional', value: 10 }, aim: 10, volatility: 0, seedFluent: true, earnedFluent: false, ...over,
    });
    const seen = mk({ code: 'add_within_10', theta: 0.85, lastSeenAt: 1_000 }); // in-band, already met
    const novel = mk({ code: 'elec_loop', theta: 2.4, lastSeenAt: null }); // never-seen, easy edge, listed
    const r = selectItem([seen, novel], {
      now: 1_000_000, previousCode: null, recentCodes: [], rand: () => 0.5, introduceCodes: INTRODUCE_SKILLS,
    });
    expect(r.chosen?.code).toBe('elec_loop');
    expect(r.introduced).toBe(true);
  });
});
