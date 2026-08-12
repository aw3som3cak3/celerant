import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-burst-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { burstEnabledFor, burstReadyCode, nextBurstCode, settleBurstOnAnswer, BURST_ITEMS } from '@/lib/burst';

const NOW = Date.UTC(2026, 7, 12);

// Seed n clean first-try-correct attempts on a skill (fast), so it is mastered (accuracy window) and
// shadow-ready (clean practice rate ≫ 0.5·aim) — the burst readiness precondition.
function master(pid: string, code: string, n = 20, latencyMs = 1500) {
  for (let i = 0; i < n; i++) {
    repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs, at: NOW + (i + 1) * 1000 });
  }
}

const burstResults = (pid: string, code: string) =>
  getDb().prepare('SELECT * FROM burst_result WHERE player_id = ? AND skill_code = ?').all(pid, code) as
    { correct: number; errors: number; rate: number; aim: number; outcome: string; credible: number }[];

describe('WS III burst — Phase B0 (shadow): serves a run, records the measurement, awards nothing', () => {
  let testFam: string;
  let realFam: string;
  beforeEach(() => {
    const suffix = Math.random().toString(36).slice(2);
    testFam = repo.createFamily(`fox+hotdog-${suffix}`, 'f:h', 'f:x', NOW);
    realFam = repo.createFamily(`bear+owl-${suffix}`, 'b:o', 'b:x', NOW);
  });

  it('is enabled for all families (B0 widened 2026-08-12 for the agreement data)', () => {
    const t = repo.createPlayer(testFam, 'fox', 3, NOW);
    const r = repo.createPlayer(realFam, 'bear', 3, NOW);
    expect(burstEnabledFor(t)).toBe(true);
    expect(burstEnabledFor(r)).toBe(true);
  });

  it('picks the mastered, shadow-ready skill as burst-ready', () => {
    const pid = repo.createPlayer(testFam, 'fox', 3, NOW);
    master(pid, 'add_within_10');
    expect(burstReadyCode(pid, 3, NOW + 30_000)).toBe('add_within_10');
  });

  it('serves a full run then writes one shadow result — and the award engine is untouched', () => {
    const pid = repo.createPlayer(testFam, 'fox', 3, NOW);
    master(pid, 'add_within_10');
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');

    // Start the run, then answer BURST_ITEMS resolved items of the burst skill.
    const code = nextBurstCode(pid, sid, 3, NOW + 30_000, { remaining: 10 });
    expect(code).toBe('add_within_10');
    for (let i = 0; i < BURST_ITEMS; i++) {
      const at = NOW + 40_000 + i * 1000;
      repo.appendAttempt({ playerId: pid, skillCode: code!, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 1400, at, sessionRunId: sid });
      settleBurstOnAnswer(pid, sid, code!, 3, at);
      // mid-run the run continues (same skill), no result yet
      if (i < BURST_ITEMS - 1) expect(burstResults(pid, 'add_within_10')).toHaveLength(0);
    }

    const results = burstResults(pid, 'add_within_10');
    expect(results).toHaveLength(1);
    expect(results[0].correct).toBe(BURST_ITEMS);
    expect(results[0].rate).toBeGreaterThan(0);
    expect(results[0].outcome).toMatch(/milestone|near_miss|collapse/);
    expect(results[0].credible).toBe(1);

    // AWARD ENGINE UNTOUCHED: no sprint row, no measured rate, no earned-fluent, run closed.
    expect((getDb().prepare('SELECT COUNT(*) c FROM sprint WHERE player_id = ?').get(pid) as { c: number }).c).toBe(0);
    expect(repo.everMilestonedSkills(pid).size).toBe(0);
    const ab = repo.abilities(pid).get('add_within_10');
    expect(ab?.rate_state ?? 'provisional').not.toBe('measured');
    expect(repo.activeBurstRun(pid, sid)).toBeNull();
  });

  it('now also starts a burst for the real family (widened)', () => {
    const pid = repo.createPlayer(realFam, 'bear', 3, NOW);
    master(pid, 'add_within_10');
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    expect(nextBurstCode(pid, sid, 3, NOW + 30_000, { remaining: 10 })).toBe('add_within_10');
  });

  it('respects the cooldown — a just-run skill is not immediately re-offered', () => {
    const pid = repo.createPlayer(testFam, 'fox', 3, NOW);
    master(pid, 'add_within_10');
    repo.createBurstRun(pid, 'add_within_10', 1, NOW + 30_000, BURST_ITEMS); // a run just started
    expect(burstReadyCode(pid, 3, NOW + 31_000)).toBeNull(); // within 48h cooldown
  });

  it('never starts during warm-up or on the peak-end item', () => {
    const pid = repo.createPlayer(testFam, 'fox', 3, NOW);
    master(pid, 'add_within_10');
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    expect(nextBurstCode(pid, sid, 3, NOW + 30_000, { remaining: 10, warmupTarget: 0.9 })).toBeNull();
    expect(nextBurstCode(pid, sid, 3, NOW + 30_000, { remaining: 10, peakEnd: true })).toBeNull();
    expect(nextBurstCode(pid, sid, 3, NOW + 30_000, { remaining: BURST_ITEMS - 1 })).toBeNull(); // doesn't fit
  });
});
