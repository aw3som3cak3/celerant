import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-timing-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { nextItem, answer, TIMING_STALE_MS } from '@/lib/practice';

const NOW = Date.now();
const DAY = 24 * 3600 * 1000;
let pid: string;

function lastLatency(playerId: string): number {
  return (getDb().prepare('SELECT latency_ms FROM attempt WHERE player_id = ? ORDER BY id DESC LIMIT 1').get(playerId) as { latency_ms: number }).latency_ms;
}

beforeAll(() => {
  const familyId = repo.createFamily('cat+dog', 'a:b', 'a:c', NOW);
  pid = repo.createPlayer(familyId, 'cat', 2, NOW);
});

describe('timing void — an interrupted problem never reaches the fluency data (#3)', () => {
  it('discards an item answered past the stale threshold: no attempt is written', () => {
    const t0 = NOW + DAY;
    const it = nextItem(pid, 2, t0); // served at t0
    const before = repo.totalAttempts(pid);

    // Answered 13 hours later (interruption): must be discarded, not recorded.
    const res = answer(pid, it.itemId, null, true, t0 + 13 * 3600 * 1000);

    expect(res.status).toBe('expired');
    expect(repo.totalAttempts(pid)).toBe(before); // NOTHING written → no latency can pollute rate/transfer
    // And the pending item is gone, so a late retry can't resurrect it either.
    expect(repo.getPendingItem(it.itemId)).toBeUndefined();
  });

  it('just past the threshold is discarded; just under is kept', () => {
    const tA = NOW + 2 * DAY;
    const itA = nextItem(pid, 2, tA);
    const overBefore = repo.totalAttempts(pid);
    expect(answer(pid, itA.itemId, null, true, tA + TIMING_STALE_MS + 1000).status).toBe('expired');
    expect(repo.totalAttempts(pid)).toBe(overBefore); // over the line → discarded

    const tB = NOW + 3 * DAY;
    const itB = nextItem(pid, 2, tB);
    const underBefore = repo.totalAttempts(pid);
    expect(answer(pid, itB.itemId, null, true, tB + TIMING_STALE_MS - 1000).status).not.toBe('expired');
    expect(repo.totalAttempts(pid)).toBe(underBefore + 1); // under the line → recorded
  });

  it('a completed-in-time item keeps its real, honest latency', () => {
    const t1 = NOW + 4 * DAY;
    const it = nextItem(pid, 2, t1); // served at t1
    const before = repo.totalAttempts(pid);

    const res = answer(pid, it.itemId, null, true, t1 + 5000); // answered 5s later

    expect(res.status).toBe('revealed'); // idk → recorded, counts for accuracy/progress
    expect(repo.totalAttempts(pid)).toBe(before + 1);
    expect(lastLatency(pid)).toBe(5000); // the honest interval, not an interruption-inflated one
  });
});

describe('resume — an interrupted session banks its progress without double-counting (#3)', () => {
  it('an open session is resumable and never double-counts; a finished one is not offered', () => {
    const t2 = NOW + 5 * DAY;
    const sid = repo.createSessionRun(pid, 4, t2);

    // Two items completed before the interruption.
    for (let i = 0; i < 2; i++) {
      const t = t2 + i * 10000;
      const it = nextItem(pid, 2, t);
      answer(pid, it.itemId, null, true, t + 2000, sid);
    }

    // Resume point: the open run is offered with its banked progress intact.
    const open = repo.openSessionRun(pid, t2 - 1);
    expect(open?.id).toBe(sid);
    expect(open?.completed).toBe(2);
    expect(open?.target).toBe(4);

    // Resume and finish the remaining two — completed advances 2→4, no jump/re-count.
    for (let i = 2; i < 4; i++) {
      const t = t2 + i * 10000;
      const it = nextItem(pid, 2, t);
      answer(pid, it.itemId, null, true, t + 2000, sid);
    }
    const run = repo.sessionRunById(sid)!;
    expect(run.completed).toBe(4); // exactly the target — resume banked, never doubled
    expect(run.ended_at).not.toBeNull();

    // A completed session is never offered for resume.
    expect(repo.openSessionRun(pid, t2 - 1)).toBeUndefined();
  });
});
