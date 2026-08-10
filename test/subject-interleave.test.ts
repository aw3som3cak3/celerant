import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-interleave-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { orderSubjectsForNext, issueNext, sessionSelectOpts } from '@/lib/practice';
import { skillsForSubject } from '@/lib/subjects';
import { replay } from '@/db/replay';

const NOW = Date.UTC(2026, 7, 10);
const MATHS = skillsForSubject('maths')[0].code;

describe('orderSubjectsForNext — laggard up-weighting', () => {
  it('a single-subject list returns unchanged (no weighting, byte-identical path)', () => {
    expect(orderSubjectsForNext([MATHS, MATHS], ['maths'], () => 0.5)).toEqual(['maths']);
  });

  it('when recent work is all maths, spelling (the laggard) wins the bulk of the weight', () => {
    const recent = Array(8).fill(MATHS); // counts: maths 8, spelling 0 → weights 1 vs 9 (total 10)
    // Only the bottom 10% of the draw goes to maths; everything above lands on the laggard.
    expect(orderSubjectsForNext(recent, ['maths', 'spelling'], () => 0.05)[0]).toBe('maths');
    expect(orderSubjectsForNext(recent, ['maths', 'spelling'], () => 0.2)[0]).toBe('spelling');
  });

  it('balanced recent work splits both ways (no starvation)', () => {
    const recent = [MATHS, MATHS, MATHS, MATHS, 'spelling_t2', 'spelling_t2', 'spelling_t2', 'spelling_t2'];
    expect(orderSubjectsForNext(recent, ['maths', 'spelling'], () => 0.2)[0]).toBe('maths');
    expect(orderSubjectsForNext(recent, ['maths', 'spelling'], () => 0.6)[0]).toBe('spelling');
  });

  it('the full ordering lists every active subject (the eligibility-fallback order)', () => {
    const ord = orderSubjectsForNext([MATHS], ['maths', 'spelling'], () => 0.5);
    expect([...ord].sort()).toEqual(['maths', 'spelling']);
  });
});

describe('issueNext — mixed session interleaves; single subject stays pure', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`t+i-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 3, NOW);
    replay(pid); // seed ability rows for BOTH subjects so buildStates never throws
  });

  const optsFor = (subjects?: ('maths' | 'spelling')[]) => {
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const base = sessionSelectOpts({ id: pid, school_year: 3, stretch: 0 }, sid, NOW);
    return subjects ? { ...base, subjects } : base;
  };

  it('a single-subject (maths) session NEVER issues a spelling item', () => {
    const opts = optsFor();
    for (let i = 0; i < 30; i++) {
      const it = issueNext(pid, 3, NOW, opts);
      expect(it.code.startsWith('spelling')).toBe(false);
    }
  });

  it('a mixed [maths, spelling] session issues BOTH kinds over a run', () => {
    const opts = optsFor(['maths', 'spelling']);
    let sawMaths = false;
    let sawSpelling = false;
    for (let i = 0; i < 50; i++) {
      const it = issueNext(pid, 3, NOW, opts);
      if (it.code.startsWith('spelling')) sawSpelling = true;
      else sawMaths = true;
      if (sawMaths && sawSpelling) break;
    }
    expect(sawMaths, 'mixed session issued no maths').toBe(true);
    expect(sawSpelling, 'mixed session issued no spelling').toBe(true);
  });
});
