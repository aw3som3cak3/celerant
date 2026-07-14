import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-reward-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { rewardState, resolveSharedTarget } from '@/lib/reward';
import { ROSTER, CATS, CAT_COST } from '@/reward/roster';
import { LOCALES } from '@/lib/i18n';
import { CATS_ENABLED } from '@/lib/flags';

const NOW = Date.UTC(2026, 6, 14);
let familyId: string;
let pig: string;

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  pig = repo.createPlayer(familyId, 'fox', 2, NOW);
});

// Complete a session and (optionally) direct it to a target.
function completeSession(at: number, target?: { kind: 'cat' | 'family'; id: string }): number {
  const sid = repo.createSessionRun(pig, 5, at);
  for (let i = 0; i < 5; i++) repo.bumpSessionRun(sid, at);
  if (target) repo.setAllocation(sid, pig, familyId, target.kind, target.id, at);
  return sid;
}

describe('cat roster is well-formed (spec §Cat roster)', () => {
  it('has 10 cats, unique ids, flat cost 20, and both locales', () => {
    expect(CATS.length).toBe(10);
    expect(new Set(ROSTER.map((r) => r.id)).size).toBe(ROSTER.length);
    for (const c of CATS) {
      expect(c.cost).toBe(CAT_COST);
      for (const l of LOCALES) {
        expect(c.name[l].length).toBeGreaterThan(0);
        expect(c.blurb[l].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('reward reducer: directed sessions accumulate; a cat unlocks at cost', () => {
  it('progress equals the directed count; unlock at 20; idempotent', () => {
    let now = NOW + 1000;
    for (let i = 0; i < CAT_COST - 1; i++) completeSession((now += 1000), { kind: 'cat', id: 'pythagoras' });
    let st = rewardState(familyId);
    expect(st.progress['pythagoras']).toBe(19);
    expect(st.unlockedCats).not.toContain('pythagoras'); // not yet

    completeSession((now += 1000), { kind: 'cat', id: 'pythagoras' }); // the 20th
    st = rewardState(familyId);
    expect(st.progress['pythagoras']).toBe(20);
    expect(st.unlockedCats).toContain('pythagoras');

    // pure count -> calling again gives the identical state
    expect(rewardState(familyId)).toEqual(st);
  });
});

describe('the family goal is the residual (opportunity cost)', () => {
  it('a session directed to a cat does not count toward the goal; legacy sessions do', () => {
    const gStart = NOW + 5_000_000;
    repo.setGoal(familyId, 'simhallen', 100, gStart);
    let now = gStart + 1000;
    // 3 sessions to a cat, 2 to the family, 2 legacy (no allocation)
    for (let i = 0; i < 3; i++) completeSession((now += 1000), { kind: 'cat', id: 'euclid' });
    for (let i = 0; i < 2; i++) completeSession((now += 1000), { kind: 'family', id: 'family' });
    for (let i = 0; i < 2; i++) completeSession((now += 1000)); // legacy: no allocation row

    const st = rewardState(familyId);
    expect(st.progress['euclid']).toBe(3); // cat counts are independent of the flag
    // With cats ON the family goal is the residual (7 completed − 3 to a cat = 4);
    // with cats OFF it is the full count (the old reward structure, ignoring any
    // stray allocations). 7 completed since the goal was set.
    const expectedFamily = CATS_ENABLED ? 4 : 7;
    expect(st.progress['family']).toBe(expectedFamily);
    expect(repo.familyGoalProgress(familyId, gStart)).toBe(expectedFamily);
  });
});

describe('shared target resolution (spec §Replay reducer)', () => {
  it('unset -> first unresolved cat; set -> that; already-unlocked -> next unresolved', () => {
    const fresh = repo.createFamily('bear+owl', 'a:b', 'a:c', NOW);
    // unset: pythagoras is first by order
    expect(resolveSharedTarget(fresh, [])).toEqual({ kind: 'cat', id: 'pythagoras' });
    // set explicitly
    repo.setSharedTarget(fresh, 'cat', 'gauss', NOW);
    expect(resolveSharedTarget(fresh, [])).toEqual({ kind: 'cat', id: 'gauss' });
    // if the set cat is already unlocked, advance to the next unresolved by order
    expect(resolveSharedTarget(fresh, ['gauss'])).toEqual({ kind: 'cat', id: 'pythagoras' });
    // all cats unlocked -> the family goal
    expect(resolveSharedTarget(fresh, CATS.map((c) => c.id))).toEqual({ kind: 'family', id: 'family' });
  });
});

describe('auto-allocation on session completion (through the practice flow)', () => {
  it('directs a completed session to the shared target ONLY when cats are enabled', async () => {
    const { nextItem, answer, __peekPendingAnswer } = await import('@/lib/practice');
    const fam = repo.createFamily('cat+dog', 'q:r', 'q:s', NOW);
    const kid = repo.createPlayer(fam, 'cat', 2, NOW);
    repo.setSharedTarget(fam, 'cat', 'newton', NOW);
    const sid = repo.createSessionRun(kid, 3, NOW + 1000);
    let now = NOW + 2000;
    for (let i = 0; i < 3; i++) {
      const it = nextItem(kid, 2, now);
      answer(kid, it.itemId, __peekPendingAnswer(it.itemId)!, false, now, sid);
      now += 1000;
    }
    const alloc = repo.getAllocation(sid);
    if (CATS_ENABLED) {
      expect(alloc?.target_kind).toBe('cat');
      expect(alloc?.target_id).toBe('newton');
    } else {
      expect(alloc).toBeUndefined(); // feature flag off: old reward structure, no cat allocation
    }
  });
});
