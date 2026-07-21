import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-reward-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { rewardState, resolveSharedTarget } from '@/lib/reward';
import { ROSTER, CATS, PROPS, CAT_COST } from '@/reward/roster';
import { LOCALES } from '@/lib/i18n';

const NOW = Date.UTC(2026, 6, 14);
let familyId: string;
let pig: string;

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  pig = repo.createPlayer(familyId, 'fox', 2, NOW);
});

// Complete a session and (optionally) direct it to a target.
function completeSession(at: number, target?: { kind: 'cat' | 'family' | 'prop'; id: string }): number {
  const sid = repo.createSessionRun(pig, 5, at);
  for (let i = 0; i < 5; i++) repo.bumpSessionRun(sid, at);
  if (target) repo.setAllocation(sid, pig, familyId, target.kind, target.id, at);
  return sid;
}

describe('cat roster is well-formed (spec §Cat roster)', () => {
  it('has 12 cats, unique ids, flat cost 40, and both locales', () => {
    expect(CAT_COST).toBe(40);
    expect(CATS.length).toBe(12); // 10 mega-famous + Cardano (pirate) + Turing (masked)
    expect(new Set(ROSTER.map((r) => r.id)).size).toBe(ROSTER.length);
    for (const c of CATS) {
      expect(c.cost).toBe(CAT_COST);
      for (const l of LOCALES) {
        expect(c.name[l].length).toBeGreaterThan(0);
        expect(c.blurb[l].length).toBeGreaterThan(0);
      }
    }
  });

  it('furniture props are well-formed: a fixed slot, a render size, a positive cost, both locales', () => {
    expect(PROPS.length).toBeGreaterThan(0);
    for (const p of PROPS) {
      expect(p.kind).toBe('prop');
      expect(p.cost).toBeGreaterThan(0);
      expect(p.slot).toBeTruthy();
      expect(p.size).toBeGreaterThan(0);
      for (const l of LOCALES) {
        expect(p.name[l].length).toBeGreaterThan(0);
        expect(p.blurb[l].length).toBeGreaterThan(0);
      }
    }
  });
});

describe('reward reducer: directed sessions accumulate; a cat unlocks at cost', () => {
  it('progress equals the directed unit count; unlock at cost; idempotent', () => {
    let now = NOW + 1000;
    // 10-item sessions count 1 unit each (see reward weighting).
    for (let i = 0; i < CAT_COST - 1; i++) completeSession((now += 1000), { kind: 'cat', id: 'pythagoras' });
    let st = rewardState(familyId);
    expect(st.progress['pythagoras']).toBe(CAT_COST - 1);
    expect(st.unlockedCats).not.toContain('pythagoras'); // not yet

    completeSession((now += 1000), { kind: 'cat', id: 'pythagoras' }); // the last one
    st = rewardState(familyId);
    expect(st.progress['pythagoras']).toBe(CAT_COST);
    expect(st.unlockedCats).toContain('pythagoras');

    // pure count -> calling again gives the identical state
    expect(rewardState(familyId)).toEqual(st);
  });
});

describe('session-length weighting keeps the economy net-neutral across the 20→10 halving', () => {
  it('an old 20-item session counts 2 units, a new 10-item session 1 — so an earned cat never re-locks', () => {
    const fam = repo.createFamily('lion+wolf', 'l:w', 'l:x', NOW);
    const kid = repo.createPlayer(fam, 'lion', 2, NOW);
    const complete = (at: number, target: number, id: string) => {
      const sid = repo.createSessionRun(kid, target, at);
      for (let i = 0; i < target; i++) repo.bumpSessionRun(sid, at);
      repo.setAllocation(sid, kid, fam, 'cat', id, at);
    };
    let now = NOW + 10_000;
    // 20 old-style 20-item sessions = 40 units = exactly one cat (the same total
    // work the old cost of 20 sessions × 20 items represented).
    for (let i = 0; i < 20; i++) complete((now += 1000), 20, 'newton');
    let st = rewardState(fam);
    expect(st.progress['newton']).toBe(40);
    expect(st.unlockedCats).toContain('newton'); // unlocked — not re-locked by the doubled cost

    // A new 10-item session adds exactly 1 unit.
    complete((now += 1000), 10, 'gauss');
    st = rewardState(fam);
    expect(st.progress['gauss']).toBe(1);
  });
});

describe('furniture (props) collect on the same directed-session model as cats', () => {
  it('a prop accumulates directed sessions and unlocks at its own cost', () => {
    const fam = repo.createFamily('duck+crab', 'd:c', 'd:x', NOW);
    const kid = repo.createPlayer(fam, 'duck', 2, NOW);
    const prop = PROPS[0];
    const complete = (at: number) => {
      const sid = repo.createSessionRun(kid, 10, at); // 10-item session = 1 unit
      for (let i = 0; i < 10; i++) repo.bumpSessionRun(sid, at);
      repo.setAllocation(sid, kid, fam, 'prop', prop.id, at);
    };
    let now = NOW + 20_000;
    for (let i = 0; i < prop.cost - 1; i++) complete((now += 1000));
    let st = rewardState(fam);
    expect(st.progress[prop.id]).toBe(prop.cost - 1);
    expect(st.unlockedProps).not.toContain(prop.id);

    complete((now += 1000)); // the last unit
    st = rewardState(fam);
    expect(st.unlockedProps).toContain(prop.id);
    expect(st.unlockedCats).not.toContain(prop.id); // props stay out of the cat list
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
    expect(st.progress['euclid']).toBe(3);
    // the family goal is the residual: 7 completed since the goal − 3 to a cat = 4
    expect(st.progress['family']).toBe(4);
    expect(repo.familyGoalProgress(familyId, gStart)).toBe(4);
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
  it('directs a completed session to the shared target', async () => {
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
    expect(alloc?.target_kind).toBe('cat');
    expect(alloc?.target_id).toBe('newton');
  });
});
