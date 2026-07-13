import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-onboard-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import { getDb } from '@/db';
import { replay } from '@/db/replay';
import * as repo from '@/db/repo';
import { nextItem, answer, __peekPendingAnswer } from '@/lib/practice';
import { rampLen, rampTargetP, ONBOARD_SESSIONS } from '@/lib/onboarding';
import { predict } from '@/model/elo';

const NOW = Date.UTC(2026, 6, 10);
let familyId: string;

function pOfServed(itemId: string, playerId: string): number {
  const code = getDb().prepare('SELECT skill_code FROM pending_item WHERE item_id = ?').get(itemId) as { skill_code: string };
  const theta = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(playerId, code.skill_code) as { theta: number }).theta;
  return predict(theta);
}
function snap(playerId: string): string {
  return JSON.stringify(getDb().prepare('SELECT skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ? ORDER BY skill_code').all(playerId));
}

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
});

describe('the ramp fades to nothing (onboarding-ramp §3, §6)', () => {
  it('RAMP_LEN decreases with completed sessions and is 0 from session 5', () => {
    expect([0, 1, 2, 3, 4, 5].map((c) => rampLen(c, 12))).toEqual([8, 5, 3, 1, 0, 0]);
    expect(rampLen(ONBOARD_SESSIONS, 20)).toBe(0);
    // never longer than the target, always leaves the last item honest
    for (let c = 0; c < ONBOARD_SESSIONS; c++) expect(rampLen(c, 6)).toBeLessThan(6);
  });
  it('the target climbs from the easy floor to the 0.80 edge', () => {
    expect(rampTargetP(0, 8)).toBeCloseTo(0.95, 5);
    expect(rampTargetP(7, 8)).toBeCloseTo(0.8, 5);
    expect(rampTargetP(0, 1)).toBeCloseTo(0.95, 5); // a single opener is the floor
  });
});

describe("a new player's opener is easy, not her edge (§2, §6)", () => {
  it('warm-up first item predicts ≈0.95 for a child with headroom, and never harder than normal', () => {
    for (const year of [2, 3, 4, 5]) {
      const p = repo.createPlayer(familyId, `y${year}`, year, NOW);
      const warm = nextItem(p, year, NOW, { warmupTarget: 0.95 });
      const pin = repo.createPlayer(familyId, `n${year}`, year, NOW);
      const norm = nextItem(pin, year, NOW, {}); // normal 0.80 target
      const pWarm = pOfServed(warm.itemId, p);
      const pNorm = pOfServed(norm.itemId, pin);
      expect(pWarm, `year ${year} warm ≥ normal`).toBeGreaterThanOrEqual(pNorm - 1e-9);
      if (year >= 3) expect(pWarm, `year ${year} warm ≈0.95`).toBeGreaterThan(0.9);
    }
  });

  it('the ramp climbs while varying skill — no skill repeats consecutively', () => {
    // chosen åk5 seeds from year 4 (seedGradeFor's single minus-one) — the seed
    // level this ramp-variety check was written against.
    const p = repo.createPlayer(familyId, 'ramp', 5, NOW);
    const len = 6;
    let now = NOW;
    const codes: string[] = [];
    for (let i = 0; i < len; i++) {
      const it = nextItem(p, 5, now, { warmupTarget: rampTargetP(i, len) });
      codes.push((getDb().prepare('SELECT skill_code FROM pending_item WHERE item_id = ?').get(it.itemId) as { skill_code: string }).skill_code);
      answer(p, it.itemId, __peekPendingAnswer(it.itemId)!, false, now);
      now += 60_000;
    }
    for (let i = 1; i < codes.length; i++) expect(codes[i]).not.toBe(codes[i - 1]);
  });
});

describe('the warm-up cannot corrupt θ (§4, §6)', () => {
  it('a warm-up success updates θ at half weight; a warm-up miss updates fully', () => {
    // pick the same skill for two twin players via the warm-up floor
    const a = repo.createPlayer(familyId, 'wa', 4, NOW);
    const itA = nextItem(a, 4, NOW, { warmupTarget: 0.95 });
    const code = (getDb().prepare('SELECT skill_code FROM pending_item WHERE item_id = ?').get(itA.itemId) as { skill_code: string }).skill_code;
    const t0 = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(a, code) as { theta: number }).theta;
    answer(a, itA.itemId, __peekPendingAnswer(itA.itemId)!, false, NOW); // warm-up correct
    const dWarm = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(a, code) as { theta: number }).theta - t0;

    const b = repo.createPlayer(familyId, 'wb', 4, NOW);
    // serve the SAME skill without the ramp by forcing chosenCode
    const itB = nextItem(b, 4, NOW, { chosenCode: code });
    answer(b, itB.itemId, __peekPendingAnswer(itB.itemId)!, false, NOW); // normal correct
    const dFull = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(b, code) as { theta: number }).theta - t0;

    expect(dWarm).toBeCloseTo(dFull / 2, 6); // exactly half — rd/vol unchanged, only Δθ halved

    // a warm-up MISS updates fully (surprising, informative)
    const c = repo.createPlayer(familyId, 'wc', 4, NOW);
    const itC = nextItem(c, 4, NOW, { warmupTarget: 0.95 });
    const codeC = (getDb().prepare('SELECT skill_code FROM pending_item WHERE item_id = ?').get(itC.itemId) as { skill_code: string }).skill_code;
    const wrong = __peekPendingAnswer(itC.itemId) === '1' ? '2' : '1';
    expect(answer(c, itC.itemId, wrong, false, NOW).status).toBe('retry');
    answer(c, itC.itemId, wrong, false, NOW + 1000); // wrong twice = full miss

    const d = repo.createPlayer(familyId, 'wd', 4, NOW);
    const itD = nextItem(d, 4, NOW, { chosenCode: codeC });
    const wrongD = __peekPendingAnswer(itD.itemId) === '1' ? '2' : '1';
    answer(d, itD.itemId, wrongD, false, NOW);
    answer(d, itD.itemId, wrongD, false, NOW + 1000);
    const tC = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(c, codeC) as { theta: number }).theta;
    const tD = (getDb().prepare('SELECT theta FROM ability WHERE player_id = ? AND skill_code = ?').get(d, codeC) as { theta: number }).theta;
    expect(tC).toBeCloseTo(tD, 6); // warm-up miss == normal miss (full)
  });

  it('replay reproduces a ramped session byte-for-byte (the corruption-proof test)', () => {
    const p = repo.createPlayer(familyId, 'rp', 4, NOW);
    let now = NOW + 1000;
    for (let i = 0; i < 12; i++) {
      const warm = i < 6;
      const it = nextItem(p, 4, now, warm ? { warmupTarget: rampTargetP(i, 6) } : {});
      const ans = __peekPendingAnswer(it.itemId)!;
      if (i % 4 === 3) {
        const wrong = ans === '1' ? '2' : '1';
        answer(p, it.itemId, wrong, false, now);
        answer(p, it.itemId, wrong, false, now + 1000); // a miss (warm-up or not)
      } else answer(p, it.itemId, ans, false, now);
      now += 120_000;
    }
    const live = snap(p);
    getDb().prepare('DELETE FROM ability WHERE player_id = ?').run(p);
    replay(p);
    expect(snap(p)).toBe(live); // warm-up flag stored -> reduced update reproduced exactly
  });
});

describe('warm-up attempts are excluded from the clean measurements (§4)', () => {
  it('a warm-up attempt does not count as dose or transfer evidence', () => {
    const p = repo.createPlayer(familyId, 'ex', 4, NOW);
    repo.appendAttempt({ playerId: p, skillCode: 'add_within_10', itemJson: '{}', given: '5', correct: 1, tries: 1, dontKnow: false, warmup: true, latencyMs: 2000, at: NOW });
    repo.appendAttempt({ playerId: p, skillCode: 'add_within_10', itemJson: '{}', given: '5', correct: 1, tries: 1, dontKnow: false, warmup: false, latencyMs: 2000, at: NOW + 1000 });
    const total = (getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND warmup = 0').get(p) as { c: number }).c;
    const warm = (getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND warmup = 1').get(p) as { c: number }).c;
    expect(total).toBe(1);
    expect(warm).toBe(1); // stored, but flagged out of the honest-dose queries
  });
});
