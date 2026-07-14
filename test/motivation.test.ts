import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-motiv-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import { replay } from '@/db/replay';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';

const NOW = Date.UTC(2026, 6, 10);
let familyId: string;
let playerId: string;

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  playerId = repo.createPlayer(familyId, 'fox', 4, NOW);
});

function snapshot(pid: string): string {
  return JSON.stringify(
    getDb().prepare('SELECT * FROM ability WHERE player_id = ? ORDER BY skill_code').all(pid),
  );
}

describe('session counter (§3.1)', () => {
  it('"vet inte" counts toward the twenty; the session completes on target', () => {
    const sessionId = repo.createSessionRun(playerId, 3, NOW);
    let now = NOW + 1000;
    let done = false;
    for (let i = 0; i < 3; i++) {
      const it = nextItem(playerId, 4, now, { chosenCode: undefined });
      const r = answer(playerId, it.itemId, null, true, now, sessionId); // all "vet inte"
      expect(r.status).toBe('revealed');
      if ('session' in r && r.session) done = r.session.done;
      now += 1000;
    }
    const run = repo.sessionRunById(sessionId)!;
    expect(run.completed).toBe(3);
    expect(run.ended_at).not.toBeNull();
    expect(done).toBe(true);
  });
});

describe('card shelf (§3.4)', () => {
  it('the first solved problem of a skill earns exactly one card, never gamed', () => {
    let now = NOW + 100_000;
    // solve items until we have some cards
    for (let i = 0; i < 30; i++) {
      const it = nextItem(playerId, 4, now);
      const ans = __peekPendingAnswer(it.itemId)!;
      answer(playerId, it.itemId, ans, false, now);
      now += 1000;
    }
    const cards = repo.cardsForPlayer(playerId);
    expect(cards.length).toBeGreaterThan(0);
    // one card per skill_code at most
    const codes = cards.map((c) => c.skillCode);
    expect(new Set(codes).size).toBe(codes.length);
    // a card references a real solved problem (has a prompt and the child's answer)
    expect(cards[0].prompt.length).toBeGreaterThan(0);
    expect(cards[0].given).not.toBeNull();
  });
});

describe('the motivational layer is strictly downstream (§5)', () => {
  it('dropping card / session_run / allocation / family_goal / goal_event / usage_event changes no ability', () => {
    const before = snapshot(playerId);
    const db = getDb();
    db.prepare('DELETE FROM card WHERE player_id = ?').run(playerId);
    // session_allocation before session_run (FK child first) — both droppable
    db.prepare('DELETE FROM session_allocation WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM family_shared_target WHERE family_id = ?').run(familyId);
    db.prepare('DELETE FROM session_run WHERE player_id = ?').run(playerId);
    db.prepare('DELETE FROM family_goal WHERE family_id = ?').run(familyId);
    db.prepare('DELETE FROM goal_event WHERE family_id = ?').run(familyId);
    db.prepare('DELETE FROM usage_event WHERE player_id = ?').run(playerId);
    replay(playerId); // replay never reads any of those tables
    expect(snapshot(playerId)).toBe(before);
  });
});

describe('family goal (§4.1) — sessions, family-wide, no per-child', () => {
  it('progress counts completed family sessions and reaches the target', () => {
    const goalStart = NOW + 500_000;
    repo.setGoal(familyId, 'simhallen', 2, goalStart);
    // two completed sessions after the goal was set
    for (let s = 0; s < 2; s++) {
      const sid = repo.createSessionRun(playerId, 2, goalStart + s * 10_000);
      repo.bumpSessionRun(sid, goalStart + s * 10_000 + 1);
      repo.bumpSessionRun(sid, goalStart + s * 10_000 + 2); // completes (target 2)
    }
    expect(repo.completedSessionsForFamily(familyId, goalStart)).toBe(2);
    // no repo function exposes a per-player breakdown of goal contribution
    expect(Object.keys(repo).some((k) => /contribution/i.test(k))).toBe(false);
  });

  it('a reached goal STAYS until the parent marks it Done, then clears', () => {
    const t0 = NOW + 2_000_000;
    repo.setGoal(familyId, 'bio', 1, t0);
    const sid = repo.createSessionRun(playerId, 2, t0 + 1_000);
    repo.bumpSessionRun(sid, t0 + 1_001);
    repo.bumpSessionRun(sid, t0 + 1_002); // one completed family session
    repo.markGoalReached(familyId, t0 + 2_000);
    // reached, but still present on the collective screen (getGoal returns it)
    expect(repo.getGoal(familyId)!.reached_at).not.toBeNull();
    expect(repo.getGoal(familyId)).toBeDefined();
    // "Done" (the DELETE route → clearGoal) is the only thing that removes it
    repo.clearGoal(familyId, t0 + 3_000);
    expect(repo.getGoal(familyId)).toBeUndefined();
  });

  it('a NEW goal starts its count at 0, ignoring earlier completed sessions', () => {
    // lots of completed sessions already exist from the tests above.
    const before = repo.completedSessionsForFamily(familyId, NOW);
    expect(before).toBeGreaterThan(0);
    const fresh = NOW + 9_000_000; // set the new goal AFTER all of them
    repo.setGoal(familyId, 'glass', 5, fresh);
    expect(repo.completedSessionsForFamily(familyId, repo.getGoal(familyId)!.created_at)).toBe(0);
    // and re-setting (retarget) also resets the floor to 0
    const fresher = fresh + 1_000_000;
    repo.setGoal(familyId, 'glass', 8, fresher);
    expect(repo.getGoal(familyId)!.created_at).toBe(fresher);
    expect(repo.completedSessionsForFamily(familyId, repo.getGoal(familyId)!.created_at)).toBe(0);
  });
});
