import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-recogshadow-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';

const NOW = Date.UTC(2026, 7, 11);

function recordAttempts(pid: string, code: string, n: number, correct: number, latency: number) {
  for (let i = 0; i < n; i++) {
    repo.appendAttempt({
      playerId: pid, skillCode: code, itemJson: JSON.stringify({ seed: i }),
      given: 'x', correct: i < correct ? 1 : 0, tries: 1, dontKnow: false, latencyMs: latency, at: NOW + i * 1000,
    });
  }
}

describe('D1 — recog_shadow (invisible internal-fluency measurement)', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`rs-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 3, NOW);
  });

  it('records a recognition rung once the child is accurate with enough clean samples', () => {
    recordAttempts(pid, 'spelling_t0', 12, 12, 2000); // 12/12 correct, 2s each → 30/min
    repo.recordRecogShadow(pid, 'spelling_t0', NOW + 20000);
    const row = getDb().prepare('SELECT * FROM recog_shadow WHERE player_id = ? AND skill_code = ?').get(pid, 'spelling_t0') as
      | { practice_rate: number; aim: number; accuracy: number; window_n: number }
      | undefined;
    expect(row, 'no shadow row').toBeTruthy();
    expect(row!.accuracy).toBe(1);
    expect(row!.practice_rate).toBeCloseTo(30, 0);
    expect(row!.aim).toBeGreaterThan(0);
  });

  it('does NOT record below the accuracy gate', () => {
    recordAttempts(pid, 'spelling_t1', 12, 6, 2000); // 50% correct < 0.9 gate
    repo.recordRecogShadow(pid, 'spelling_t1', NOW + 20000);
    expect(getDb().prepare('SELECT 1 FROM recog_shadow WHERE player_id = ? AND skill_code = ?').get(pid, 'spelling_t1')).toBeUndefined();
  });

  it('no-ops for a NON-recognition skill (word dictation / maths)', () => {
    recordAttempts(pid, 'spelling_t2', 12, 12, 2000); // t2 is word-dictation, not choice
    repo.recordRecogShadow(pid, 'spelling_t2', NOW + 20000);
    repo.recordRecogShadow(pid, 'add_within_10', NOW + 20000);
    const n = (getDb().prepare('SELECT COUNT(*) c FROM recog_shadow WHERE player_id = ?').get(pid) as { c: number }).c;
    expect(n).toBe(0);
  });

  it('is first-fire only (monotonic snapshot)', () => {
    recordAttempts(pid, 'spelling_t0', 12, 12, 2000);
    repo.recordRecogShadow(pid, 'spelling_t0', NOW + 20000);
    recordAttempts(pid, 'spelling_t0', 12, 12, 500); // later, faster
    repo.recordRecogShadow(pid, 'spelling_t0', NOW + 40000);
    const rows = getDb().prepare('SELECT at FROM recog_shadow WHERE player_id = ? AND skill_code = ?').all(pid, 'spelling_t0');
    expect(rows.length).toBe(1); // only the first crossing kept
  });
});
