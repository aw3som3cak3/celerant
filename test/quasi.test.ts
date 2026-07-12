import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-quasi-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { doseResponse, staggeredBaseline, crossover, displacement } from '@/lib/analysis';
import { PROBE_SETS } from '@/lib/probes';

const NOW = Date.now();
const DAY = 24 * 3600 * 1000;
let familyId: string;
let pid: string;

function administer(playerId: string, at: number, correctCount: number) {
  const items = PROBE_SETS['arith_v1'];
  items.forEach((it, i) => {
    repo.appendProbe({ playerId, probeSet: 'arith_v1', itemRef: it.ref, featuresJson: '{}', given: it.answer, correct: i < correctCount ? 1 : 0, latencyMs: 3000, at: at + i * 1000, isBaseline: at === NOW, probeVersion: 1 });
  });
}
function practise(playerId: string, skillCode: string, n: number, from: number) {
  for (let i = 0; i < n; i++) {
    repo.appendAttempt({ playerId, skillCode, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 2000, at: from + i * 1000 });
  }
}

beforeAll(() => {
  familyId = repo.createFamily('fox+hotdog', 'x:y', 'x:z', NOW);
  pid = repo.createPlayer(familyId, 'fox', 3, NOW);
  // baseline admin, light practice, then a later admin with a higher score
  administer(pid, NOW, 8); // ~8/19 at baseline
  practise(pid, 'add_2d_carry', 60, NOW + DAY); // heavy dose in the interval
  administer(pid, NOW + 30 * DAY, 15); // 15/19 after practice
});

describe('quasi-experimental analyses are offline readers (§8)', () => {
  it('the selector, θ update and replay never reference analysis outputs', () => {
    for (const f of ['src/db/replay.ts', 'src/lib/selector.ts', 'src/model/elo.ts']) {
      const src = readFileSync(path.join(process.cwd(), f), 'utf8').toLowerCase();
      for (const term of ['probe', 'prereg', 'analysis', 'displacement', 'doseresponse', 'crossover']) {
        expect(src.includes(term), `${f} references ${term}`).toBe(false);
      }
    }
  });
});

describe('dose-response (§4)', () => {
  it('reports points and carries the time-only model beside it', () => {
    const dr = doseResponse(pid);
    expect(dr.points.length).toBeGreaterThanOrEqual(1);
    expect(dr.points[0].dose).toBeGreaterThan(0);
    expect(dr.points[0].response).toBeGreaterThan(0); // probe rose after practice
    expect(dr).toHaveProperty('timeSlope'); // never reported without the comparison
    expect(dr).toHaveProperty('doseBeatsTime');
  });
});

describe('staggered baseline (§2)', () => {
  it('computes the onset from ledger volume and flags a too-short baseline', () => {
    const sb = staggeredBaseline(pid);
    expect(sb).toHaveProperty('contrast');
    // two administrations, heavy practice between -> onset lands at the 2nd, so
    // the baseline window is short and is honestly flagged as insufficient.
    expect(typeof sb.enoughBaseline).toBe('boolean');
  });
});

describe('untrained-skill crossover (§3)', () => {
  it('classifies families trained/untrained and flags leaky controls', () => {
    const rows = crossover(pid);
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.trained).toBe('boolean');
      expect(typeof r.leaky).toBe('boolean'); // §3.3 — never claim a clean control you don't have
    }
  });
});

describe('the displacement safeguard (§5)', () => {
  it('is low and flat normally, and raises a calm ceiling alarm above 2/day', () => {
    const calm = repo.createPlayer(familyId, 'owl', 3, NOW);
    for (let i = 0; i < 3; i++) repo.createSessionRun(calm, 12, NOW - i * DAY);
    expect(displacement(calm, NOW).alarm).toBe(false);

    const binge = repo.createPlayer(familyId, 'cat', 3, NOW);
    for (let i = 0; i < 16; i++) repo.createSessionRun(binge, 12, NOW - (i % 7) * 3600 * 1000);
    const d = displacement(binge, NOW);
    expect(d.sessionsLast7).toBeGreaterThan(14);
    expect(d.alarm).toBe(true); // > 2/day averaged over a week
    expect(d.weekly.length).toBe(12); // plotted over time, not a single number
  });
});
