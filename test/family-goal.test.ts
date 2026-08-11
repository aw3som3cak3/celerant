import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-goal-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';

const NOW = Date.UTC(2026, 7, 11);

describe('family goal — multi-goal lifecycle (celebrate + carry-over)', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`goal-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
  });

  it('createGoal sets the single active goal; nothing celebrated yet', () => {
    repo.createGoal(fam, 'Badet', 60, NOW);
    expect(repo.getActiveGoal(fam)?.label).toBe('Badet');
    expect(repo.celebratedGoals(fam)).toEqual([]);
  });

  it('markGoalReached moves the active goal to CELEBRATED and frees the active slot', () => {
    repo.createGoal(fam, 'Badet', 60, NOW);
    repo.markGoalReached(fam, NOW + 1);
    expect(repo.getActiveGoal(fam)).toBeUndefined();
    expect(repo.celebratedGoals(fam).map((g) => g.label)).toEqual(['Badet']);
  });

  it('a new active goal COEXISTS with a celebrated one (Erik: firat + nytt samtidigt)', () => {
    repo.createGoal(fam, 'Badet', 60, NOW);
    repo.markGoalReached(fam, NOW + 1);
    repo.createGoal(fam, 'Bio', 40, NOW + 2);
    expect(repo.getActiveGoal(fam)?.label).toBe('Bio');
    expect(repo.celebratedGoals(fam).map((g) => g.label)).toEqual(['Badet']);
  });

  it('Klar (acknowledgeGoal by id) removes a celebrated goal', () => {
    repo.createGoal(fam, 'Badet', 60, NOW);
    repo.markGoalReached(fam, NOW + 1);
    const id = repo.celebratedGoals(fam)[0].id;
    repo.acknowledgeGoal(fam, id, NOW + 2);
    expect(repo.celebratedGoals(fam)).toEqual([]);
  });

  it('replacing an UNFINISHED active goal archives the old one — only one active, none celebrated', () => {
    repo.createGoal(fam, 'Badet', 60, NOW);
    repo.createGoal(fam, 'Bio', 40, NOW + 1);
    expect(repo.getActiveGoal(fam)?.label).toBe('Bio');
    expect(repo.celebratedGoals(fam)).toEqual([]); // the old unfinished goal is archived, not celebrated
  });

  it('carry_offset seeds the new goal’s starting progress', () => {
    repo.createGoal(fam, 'Bio', 40, NOW, 12);
    const a = repo.getActiveGoal(fam)!;
    expect(a.carry_offset).toBe(12);
    expect(repo.familyGoalProgress(fam, a.created_at, a.carry_offset)).toBe(12); // no sessions → just the carry
  });
});
