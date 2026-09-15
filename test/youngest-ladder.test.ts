import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-youngest-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { issueNext, sessionSelectOpts, buildStates } from '@/lib/practice';
import { computeUnlocked } from '@/lib/selector';
import { skillByCode } from '@/skills';

const NOW = Date.UTC(2026, 7, 11);

const spellingCodes = (pid: string, year: number, n = 40) => {
  const sid = repo.createSessionRun(pid, 10, NOW, 'spelling');
  const opts = sessionSelectOpts({ id: pid, school_year: year, stretch: 0 }, sid, NOW);
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) seen.add(issueNext(pid, year, NOW, opts).code);
  return seen;
};

// D2a: the youngest's recognition ladder is ORDERED — she starts at t0 and each rung unlocks the
// next only after she's crossed it (accuracy+volume, recog_shadow). Older kids (åk≥1) seed-pass
// recognition and skip straight ahead. Maths is untouched.
describe('the youngest climbs the recognition ladder in order (E + D2a)', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`yng-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'dog', 0, NOW); // åk0, fresh — createPlayer replays/seeds
  });

  it('a fresh åk0 kid is served ONLY spelling_t0 (the recognition floor), never t15/t2/t3', () => {
    const seen = spellingCodes(pid, 0);
    expect([...seen]).toEqual(['spelling_t0']);
  });

  it('a fresh åk0 kid starts MATHS at ground_structure (fler/färre), never add_within_10', () => {
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const opts = sessionSelectOpts({ id: pid, school_year: 0, stretch: 0 }, sid, NOW);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(issueNext(pid, 0, NOW, opts).code);
    expect([...seen]).toEqual(['ground_structure']); // the GROUND choice floor, ordered
    expect(seen.has('add_within_10')).toBe(false);
  });

  it('after crossing t0 (accurate + enough samples), t0b unlocks', () => {
    for (let i = 0; i < 14; i++) {
      repo.appendAttempt({ playerId: pid, skillCode: 'spelling_t0', itemJson: JSON.stringify({ seed: i }), given: 'x', correct: 1, tries: 1, dontKnow: false, latencyMs: 2000, at: NOW + i * 1000 });
    }
    repo.recordRecogShadow(pid, 'spelling_t0', NOW + 20000);
    expect(repo.recogCrossedSkills(pid).has('spelling_t0')).toBe(true);
    const seen = spellingCodes(pid, 0);
    expect(seen.has('spelling_t0b'), 't0b did not unlock after crossing t0').toBe(true);
    expect(seen.has('spelling_t2'), 'word dictation leaked in too early').toBe(false);
  });

  it('an åk≥1 child SEED-passes recognition and reaches beyond the floor without crossing', () => {
    const fam = repo.createFamily(`old-${Math.random().toString(36).slice(2)}`, 'a:b', 'a:c', NOW);
    const old = repo.createPlayer(fam, 'mouse', 3, NOW);
    const seen = spellingCodes(old, 3);
    expect([...seen].some((c) => c !== 'spelling_t0'), 'åk3 was stuck at the floor').toBe(true);
  });
});

// #1 (frontier fixes): the pictured 6–10 rung that bridges the add_within_5 → add_within_10 cliff,
// so a beginner isn't asked to leap magnitude AND lose the pictures at once.
describe('add_within_10_pics bridges the addition cliff without bricking older kids', () => {
  it('add_within_10 now requires the pictured bridge, which requires add_within_5 + count_within_10', () => {
    const bridge = skillByCode('add_within_10_pics');
    expect(bridge, 'the bridge rung does not exist').toBeTruthy();
    expect(bridge!.year, 'bridge must be year 0 so it seeds fluent for everyone').toBe(0);
    expect(bridge!.requires).toEqual(expect.arrayContaining(['add_within_5', 'count_within_10']));
    expect(skillByCode('add_within_10')!.requires).toContain('add_within_10_pics');
  });

  it('a fresh åk3 child still has add_within_10 unlocked (the new prereq seeds fluent — no brick)', () => {
    const fam = repo.createFamily(`brick-${Math.random().toString(36).slice(2)}`, 'p:q', 'p:r', NOW);
    const old = repo.createPlayer(fam, 'panda', 3, NOW);
    const unlocked = computeUnlocked(buildStates(old, 3));
    expect(unlocked.get('add_within_10_pics'), 'bridge not unlocked for åk3').toBe(true);
    expect(unlocked.get('add_within_10'), 'add_within_10 got bricked for åk3 by the new prereq').toBe(true);
  });
});
