import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-xgate-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { computeUnlocked, type SelState } from '@/lib/selector';
import { crossPassedPredicate } from '@/lib/practice';
import { skillByCode } from '@/skills';

const NOW = Date.UTC(2026, 7, 12);
const st = (over: Partial<SelState>): SelState => ({
  code: 'x', family: 'f', year: 0, mode: 'component', skillId: 0, theta: 0, lastSeenAt: null,
  requires: [], rate: { source: 'unknown' }, aim: null, ...over,
});

describe('cross-subject prerequisites (reading gate)', () => {
  it('computeUnlocked keeps a skill LOCKED until its crossRequires are passed', () => {
    const states = [st({ code: 'x', crossRequires: ['y'] })];
    expect(computeUnlocked(states, undefined, () => false).get('x')).toBe(false); // cross-prereq unmet
    expect(computeUnlocked(states, undefined, () => true).get('x')).toBe(true); // cross-prereq met
    expect(computeUnlocked(states).get('x')).toBe(true); // default predicate = no cross-gating (byte-identical)
  });

  it('English spelling (en_ed_regular) carries the reading crossRequires', () => {
    expect(skillByCode('en_ed_regular').crossRequires).toContain('spelling_t1c');
  });

  it('a reader (åk4) PASSES the Swedish reading rung; a pre-literate åk0 does NOT (until she crosses it)', () => {
    const fam = repo.createFamily(`xg-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    const reader = repo.createPlayer(fam, 'sushi', 4, NOW);
    const young = repo.createPlayer(fam, 'kite', 0, NOW);
    expect(crossPassedPredicate(reader, 4)('spelling_t1c')).toBe(true); // åk4 seed-passes the recognition rung
    expect(crossPassedPredicate(young, 0)('spelling_t1c')).toBe(false); // the 5yo must earn reading first
    // and the maths/spelling floors a beginner CAN do stay passable for their own graphs (sanity)
    expect(crossPassedPredicate(young, 0)('ground_structure')).toBe(false); // not yet crossed
  });
});
