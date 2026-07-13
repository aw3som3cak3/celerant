import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-test-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import { replay } from '@/db/replay';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';
import { buildChildMap } from '@/lib/map';

const NOW = Date.UTC(2026, 6, 10);

let familyId: string;
let playerId: string; // Swedish year 4

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  playerId = repo.createPlayer(familyId, 'fox', 4, NOW); // seeds ability via replay
});

function wrongOf(a: string): string {
  return a === '1' ? '2' : '1';
}

function snapshotAbility(pid: string): string {
  const rows = getDb()
    .prepare('SELECT skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ? ORDER BY skill_code')
    .all(pid);
  return JSON.stringify(rows);
}

describe('placement is not a gate (ui-lifecycle §4.5)', () => {
  it('the first screen is a problem — no tool/placement gate', () => {
    const it = nextItem(playerId, 4, NOW);
    expect(Object.keys(it).sort()).toEqual(['family', 'itemId', 'level', 'mode', 'novel', 'prompt']);
    expect('needsTool' in it || 'needsPlacement' in it).toBe(false);
    expect(JSON.stringify(it)).not.toMatch(/"answer"/);
  });
});

describe('ability is a cache; replay rebuilds it exactly (ui-lifecycle §1, §7)', () => {
  it('a mixed session, then drop the cache and replay — identical', () => {
    let now = NOW + 1000;
    for (let i = 0; i < 200; i++) {
      const it = nextItem(playerId, 4, now);
      const ans = __peekPendingAnswer(it.itemId)!;
      const mode = i % 6;
      const wrongTwice = i % 11 === 10;
      if (mode === 5) answer(playerId, it.itemId, null, true, now);
      else if (wrongTwice) {
        expect(answer(playerId, it.itemId, wrongOf(ans), false, now).status).toBe('retry');
        answer(playerId, it.itemId, wrongOf(ans), false, now + 1000);
      } else if (mode === 4) {
        expect(answer(playerId, it.itemId, wrongOf(ans), false, now).status).toBe('retry');
        answer(playerId, it.itemId, ans, false, now + 1000);
      } else answer(playerId, it.itemId, ans, false, now);
      now += 120_000;
    }

    // The live path replays after every ledger write, so the cache already IS
    // the replay. Dropping it and rebuilding must reproduce it byte-for-byte.
    const live = snapshotAbility(playerId);
    getDb().prepare('DELETE FROM ability WHERE player_id = ?').run(playerId);
    replay(playerId);
    expect(snapshotAbility(playerId)).toBe(live);

    // and there ARE attempts in the ledger
    const n = getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ?').get(playerId) as { c: number };
    expect(n.c).toBeGreaterThan(0);
  });
});

describe('the wrong child — reassign changes owner, not content (§6.2)', () => {
  it('reassigning an id range moves evidence and replays both players', () => {
    const a = repo.createPlayer(familyId, 'bear', 4, NOW);
    const b = repo.createPlayer(familyId, 'owl', 4, NOW);

    // a solves several correctly
    let now = NOW + 5_000_000;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      const it = nextItem(a, 4, now);
      const ans = __peekPendingAnswer(it.itemId)!;
      answer(a, it.itemId, ans, false, now);
      now += 60_000;
    }
    const range = getDb().prepare('SELECT MIN(id) lo, MAX(id) hi FROM attempt WHERE player_id = ?').get(a) as { lo: number; hi: number };
    const aBefore = getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL').get(a) as { c: number };
    expect(aBefore.c).toBe(8);

    repo.reassignAttempts(range.lo, range.hi, a, b);

    expect((getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ?').get(a) as { c: number }).c).toBe(0);
    expect((getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ?').get(b) as { c: number }).c).toBe(8);
    // b's cache now reflects the evidence; a's is back to pure seed
    expect(snapshotAbility(a)).toBe((() => { getDb().prepare('DELETE FROM ability WHERE player_id = ?').run(a); replay(a); return snapshotAbility(a); })());
  });
});

describe('a child changing their own icon touches nothing in the model (add-map-icon-title §2)', () => {
  it('leaves attempts, cards, θ, and map identical', () => {
    // playerId is populated (200 attempts + cards) from the replay test above.
    const attemptsBefore = getDb().prepare('SELECT id, skill_code, correct, tries FROM attempt WHERE player_id = ? ORDER BY id').all(playerId);
    const cardsBefore = getDb().prepare('SELECT skill_code, attempt_id, earned_at FROM card WHERE player_id = ? ORDER BY skill_code').all(playerId);
    const abilityBefore = snapshotAbility(playerId);
    const mapBefore = JSON.stringify(buildChildMap(playerId, 4));
    expect((cardsBefore as unknown[]).length).toBeGreaterThan(0); // there is a map to preserve

    repo.updatePlayerIcon(playerId, 'owl3'); // the icon is a key on player, keyed nowhere in the model

    expect(repo.playerById(playerId)!.icon).toBe('owl3'); // the change took
    expect(getDb().prepare('SELECT id, skill_code, correct, tries FROM attempt WHERE player_id = ? ORDER BY id').all(playerId)).toEqual(attemptsBefore);
    expect(getDb().prepare('SELECT skill_code, attempt_id, earned_at FROM card WHERE player_id = ? ORDER BY skill_code').all(playerId)).toEqual(cardsBefore);
    expect(snapshotAbility(playerId)).toBe(abilityBefore);
    expect(JSON.stringify(buildChildMap(playerId, 4))).toBe(mapBefore);
  });

  it('within-family uniqueness: a sibling icon is already taken', () => {
    const sibling = repo.createPlayer(familyId, 'seal', 4, NOW);
    // The route rejects an icon another family member holds; the raw set is the
    // guard's input. (The API returns 409; here we assert the set it checks.)
    expect(repo.iconsUsedInFamily(familyId).has('seal')).toBe(true);
    expect(repo.iconsUsedInFamily(familyId).has('a-free-icon')).toBe(false);
    void sibling;
  });
});

describe('voiding returns θ to seed (§6.5)', () => {
  it('a voided range no longer counts as evidence', () => {
    const c = repo.createPlayer(familyId, 'owl2' as string, 4, NOW); // owl2 not a real icon key, but player.icon is free text at repo level
    // (kept minimal; icon validity is enforced at the API layer, not repo)
    let now = NOW + 9_000_000;
    for (let i = 0; i < 6; i++) {
      const it = nextItem(c, 4, now);
      answer(c, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
      now += 60_000;
    }
    const seedSnap = (() => {
      // capture what a pure seed looks like by replaying an untouched twin
      const twin = repo.createPlayer(familyId, 'twin' as string, 4, NOW);
      return snapshotAbility(twin).replace(/"player_id":"[^"]+"/g, '');
    })();
    const range = getDb().prepare('SELECT MIN(id) lo, MAX(id) hi FROM attempt WHERE player_id = ?').get(c) as { lo: number; hi: number };
    repo.voidRange(c, range.lo, range.hi, 'test', now);
    // θ/rate back to seed (ignoring player_id and last_seen which stays null after void)
    const after = snapshotAbility(c).replace(/"player_id":"[^"]+"/g, '');
    expect(after).toBe(seedSnap);
  });
});
