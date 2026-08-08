import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-ptarget-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { resolvePlayerTarget, rewardState } from '@/lib/reward';

const NOW = Date.UTC(2026, 7, 8);

// Model A: personal steering, shared cats. Each child has their own default target; the
// cats and their progress stay family-pooled.
describe('per-child default target', () => {
  let fam: string, a: string, b: string;
  beforeEach(() => {
    fam = repo.createFamily(`ice_cream+turtle-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    a = repo.createPlayer(fam, 'mouse', 3, NOW);
    b = repo.createPlayer(fam, 'duck', 0, NOW);
  });

  it('falls back to the family default, then the first uncollected cat', () => {
    // No personal, no family target → both kids default to the first cat by order.
    expect(resolvePlayerTarget(a, fam, [])).toEqual({ kind: 'cat', id: 'pythagoras' });
    // Family default set → a kid with no personal pick follows it.
    repo.setSharedTarget(fam, 'cat', 'euler', NOW);
    expect(resolvePlayerTarget(b, fam, [])).toEqual({ kind: 'cat', id: 'euler' });
  });

  it('each child steers independently; the family default is only a fallback', () => {
    repo.setSharedTarget(fam, 'cat', 'euler', NOW);
    repo.setPlayerTarget(a, 'cat', 'gauss', NOW); // A picks their own
    expect(resolvePlayerTarget(a, fam, [])).toEqual({ kind: 'cat', id: 'gauss' }); // personal wins
    expect(resolvePlayerTarget(b, fam, [])).toEqual({ kind: 'cat', id: 'euler' }); // B still on family default
  });

  it('a personal pick for an already-unlocked cat advances past it', () => {
    repo.setPlayerTarget(a, 'cat', 'newton', NOW);
    expect(resolvePlayerTarget(a, fam, ['newton'])).not.toEqual({ kind: 'cat', id: 'newton' });
  });

  it('rewardState scopes only the default per child — progress and unlocks stay pooled', () => {
    repo.setPlayerTarget(a, 'cat', 'gauss', NOW);
    repo.setPlayerTarget(b, 'cat', 'newton', NOW);
    const ra = rewardState(fam, a), rb = rewardState(fam, b);
    expect(ra.sharedTarget).toEqual({ kind: 'cat', id: 'gauss' });
    expect(rb.sharedTarget).toEqual({ kind: 'cat', id: 'newton' });
    // Same shared room: identical progress map and unlock lists regardless of who's viewing.
    expect(ra.progress).toEqual(rb.progress);
    expect(ra.unlockedCats).toEqual(rb.unlockedCats);
  });
});
