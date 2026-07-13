import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-frp-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import { replay, runStartupMigration } from '@/db/replay';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';

const NOW = Date.UTC(2026, 8, 15);
let familyId: string;

function snap(who: string): string {
  return JSON.stringify(getDb().prepare('SELECT skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ? ORDER BY skill_code').all(who));
}
const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8');

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
});

describe('the probe is off the child path (fix-remove-probe §2, §5)', () => {
  it('the practice screen never references a probe', () => {
    const s = src('src/app/practice/page.tsx').toLowerCase();
    expect(s.includes('probe')).toBe(false);
    expect(s.includes('proberun')).toBe(false);
  });

  it('the probe route is parent-gated, not child-reachable', () => {
    const s = src('src/app/api/probe/route.ts');
    expect(s.includes('parentFamilyFromRequest')).toBe(true);
    expect(s.includes('requirePlayer')).toBe(false); // no child (family-session) path
  });

  it('a new child reaches a real practice problem with zero intervening probe items', () => {
    const p = repo.createPlayer(familyId, 'newkid', 1, NOW);
    // the create flow -> session -> first item is a genuine problem, nothing before it
    const it = nextItem(p, 1, NOW, { warmupTarget: 0.95, baseTarget: 0.9 });
    expect(it.prompt).toMatch(/[0-9]/); // a real arithmetic problem
    expect(repo.probesForPlayer(p).length).toBe(0); // no probe was administered to reach it
  });
});

describe('replay-all re-seeds existing kids onto the easy floor (§3, §5)', () => {
  it('rebuilds a player-with-attempts byte-for-byte and re-seeds a blank one', () => {
    const db = getDb();
    const withAttempts = repo.createPlayer(familyId, 'pigish', 1, NOW);
    let now = NOW + 1000;
    for (let i = 0; i < 12; i++) {
      const it = nextItem(withAttempts, 1, now);
      answer(withAttempts, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
      now += 60_000;
    }
    const blank = repo.createPlayer(familyId, 'mouseish', 3, NOW); // no attempts, old-style
    const beforeA = snap(withAttempts);
    const beforeB = snap(blank);

    // simulate a pre-migration deploy: corrupt caches + roll the model flag back
    db.prepare('UPDATE ability SET theta = 99 WHERE player_id IN (?, ?)').run(withAttempts, blank);
    db.prepare("DELETE FROM meta WHERE key = 'model_v'").run();
    runStartupMigration(db);

    expect(snap(withAttempts)).toBe(beforeA); // evidence preserved, rebuilt exactly
    expect(snap(blank)).toBe(beforeB); // re-seeded cleanly
  });

  it('the easy floor is applied: entry-tier θ ≥ 2.4 for every grade', () => {
    for (const g of [1, 2, 3, 5]) {
      const p = repo.createPlayer(familyId, `fl${g}`, g, NOW);
      const th = (getDb().prepare("SELECT theta FROM ability WHERE player_id = ? AND skill_code = 'add_within_10'").get(p) as { theta: number }).theta;
      expect(th, `grade ${g} entry-tier floor`).toBeGreaterThanOrEqual(2.4);
    }
  });

  it('the two-miss retreat is active for a replayed (not just fresh) player (§4)', () => {
    const p = repo.createPlayer(familyId, 'scarred', 3, NOW);
    replay(p); // as after replay-all
    let now = NOW + 5_000_000;
    for (let i = 0; i < 2; i++) {
      const it = nextItem(p, 3, now, { warmupTarget: 0.85 });
      const wrong = __peekPendingAnswer(it.itemId) === '1' ? '2' : '1';
      answer(p, it.itemId, wrong, false, now);
      answer(p, it.itemId, wrong, false, now + 500);
      now += 60_000;
    }
    expect(repo.lastTwoMissed(p)).toBe(true); // the route retreats to the floor on this
  });
});
