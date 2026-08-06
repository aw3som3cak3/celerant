import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-shadow-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { SHADOW_TRIGGER_FACTOR } from '@/lib/fluency';

const NOW = Date.UTC(2026, 7, 1);
const fired = (pid: string, code: string) =>
  getDb().prepare('SELECT * FROM shadow_fluency WHERE player_id = ? AND skill_code = ?').get(pid, code) as
    | { practice_rate: number; aim: number; factor: number; window_n: number }
    | undefined;

// n clean first-try-correct attempts at a fixed interval, then run the detector once.
function practise(pid: string, code: string, n: number, latencyMs: number) {
  for (let i = 0; i < n; i++) {
    repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs, at: NOW + (i + 1) * 1000 });
  }
  repo.recordShadowFluency(pid, code, NOW + (n + 1) * 1000);
}

describe('WS III-a shadow detector — invisible fluency-ready trigger', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`bear+owl-${Math.random().toString(36).slice(2)}`, 'b:o', 'b:x', NOW);
  });

  it('fires once on a MASTERED skill answered fast, snapshotting its inputs', () => {
    const pid = repo.createPlayer(fam, 'bear', 3, NOW);
    practise(pid, 'add_within_10', 20, 1500); // 20/20 first-try correct at ~40/min ≫ 0.5·aim
    const row = fired(pid, 'add_within_10');
    expect(row).toBeTruthy();
    expect(row!.factor).toBe(SHADOW_TRIGGER_FACTOR);
    expect(row!.window_n).toBe(20);
    expect(row!.practice_rate).toBeGreaterThanOrEqual(0.5 * row!.aim);
  });

  it('does NOT fire when the skill is mastered but too SLOW to cross the trigger', () => {
    const pid = repo.createPlayer(fam, 'owl', 3, NOW);
    practise(pid, 'add_within_10', 20, 20000); // 3/min — well under 0.5·aim
    expect(fired(pid, 'add_within_10')).toBeUndefined();
  });

  it('does NOT fire when not yet MASTERED (too few clean attempts)', () => {
    const pid = repo.createPlayer(fam, 'cat', 3, NOW);
    practise(pid, 'add_within_10', 10, 1500); // fast, but < accuracy window ⇒ not mastered
    expect(fired(pid, 'add_within_10')).toBeUndefined();
  });

  it('never fires on a recognition rung (non-sprintable — never a fluency target)', () => {
    const pid = repo.createPlayer(fam, 'dog', 3, NOW);
    practise(pid, 'ground_structure', 20, 1500);
    expect(fired(pid, 'ground_structure')).toBeUndefined();
  });

  it('is idempotent — the first fire is kept, never rewritten', () => {
    const pid = repo.createPlayer(fam, 'fox', 3, NOW);
    practise(pid, 'add_within_10', 20, 1500);
    const first = fired(pid, 'add_within_10')!;
    practise(pid, 'add_within_10', 20, 500); // faster later — must not overwrite the snapshot
    const again = fired(pid, 'add_within_10')!;
    expect(again.practice_rate).toBe(first.practice_rate);
  });
});
