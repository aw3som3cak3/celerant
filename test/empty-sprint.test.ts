import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-empty-sprint-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { finishSprint, startSprint, sprintAnswer } from '@/lib/sprint';
import { runOneOffPlacements } from '@/db/replay';

const NOW = Date.now();

// A root component (no prerequisites), at/below the child's seed grade so it is
// unlocked and sprint-shaped once its accuracy gate is met.
const SKILL = 'add_within_10';

function sprintCount(playerId: string, includeVoided = true): number {
  const sql = includeVoided
    ? 'SELECT COUNT(*) c FROM sprint WHERE player_id = ?'
    : 'SELECT COUNT(*) c FROM sprint WHERE player_id = ? AND voided_at IS NULL';
  return (getDb().prepare(sql).get(playerId) as { c: number }).c;
}
function rateState(playerId: string, code: string): string {
  return (getDb().prepare('SELECT rate_state FROM ability WHERE player_id = ? AND skill_code = ?').get(playerId, code) as { rate_state: string }).rate_state;
}
// Meet the sprint accuracy gate: 20 first-try-correct attempts on the skill.
function makeEligible(playerId: string, code: string): void {
  for (let i = 0; i < 20; i++) {
    repo.appendAttempt({
      playerId,
      skillCode: code,
      itemJson: '{"prompt":"3 + 4 =","seed":1}',
      given: '7',
      correct: 1,
      tries: 1,
      dontKnow: false,
      latencyMs: 2000,
      at: NOW - (20 - i) * 1000,
    });
  }
}

let pid: string;
beforeAll(() => {
  const familyId = repo.createFamily('cat+dog', 'a:b', 'a:c', NOW);
  pid = repo.createPlayer(familyId, 'cat', 3, NOW);
  makeEligible(pid, SKILL);
});

describe('empty sprint — a run with no graded answers writes no rate (bug-hunt-fluency follow-up)', () => {
  it('finishing a sprint with 0 correct AND 0 errors persists nothing and leaves the rate provisional', () => {
    // The skill starts provisional (seeded, "ej övad"), never measured.
    expect(rateState(pid, SKILL)).toBe('provisional');

    // Start a real sprint and finish it WITHOUT answering anything — the exact
    // shape of the two production rows (correct=0, errors=0).
    const start = startSprint(pid, SKILL, 30, NOW);
    expect(start).not.toBeNull();
    const result = finishSprint(pid, start!.sprintId, NOW + 30_000);

    expect(result).not.toBeNull();
    expect(result!.correct).toBe(0);
    expect(result!.errors).toBe(0);
    expect(result!.correctPerMin).toBe(0);

    // Nothing written to the sprint ledger; the rate stays the provisional seed.
    expect(sprintCount(pid)).toBe(0);
    expect(rateState(pid, SKILL)).toBe('provisional'); // still "ej övad", not "mätt"
  });

  it('a run with at least one graded answer IS a measurement and is recorded', () => {
    const start = startSprint(pid, SKILL, 30, NOW + 1000);
    expect(start).not.toBeNull();
    // One graded answer (wrong is still a measurement of throughput), then time out.
    sprintAnswer(pid, start!.sprintId, 'definitely-wrong', NOW + 2000);
    const result = finishSprint(pid, start!.sprintId, NOW + 31_000);

    expect(result).not.toBeNull();
    expect(result!.correct + result!.errors).toBeGreaterThan(0);
    expect(sprintCount(pid)).toBe(1); // this one WAS written
    expect(rateState(pid, SKILL)).toBe('measured');
  });
});

describe('one-off void — historical empty sprints are tombstoned and the skill returns to provisional', () => {
  it('voids an existing correct=0/errors=0 sprint row and replays back to "ej övad"', () => {
    // Simulate a pre-fix empty row already sitting in the ledger (as the two prod
    // rows do), plus the measured rate it wrongly minted.
    repo.appendSprint(pid, 'add_doubles', 30, 0, 0, NOW + 100);
    expect(rateState(pid, 'add_doubles')).toBe('measured'); // the bug: spurious 0 rate

    // Clear the guard flag so the one-off sweep runs against this DB, then run it.
    getDb().prepare("DELETE FROM meta WHERE key = 'voided_empty_sprints_v1'").run();
    runOneOffPlacements(getDb());

    // The empty row is tombstoned with the expected reason...
    const voided = getDb()
      .prepare("SELECT void_reason FROM sprint WHERE player_id = ? AND correct = 0 AND errors = 0 AND voided_at IS NOT NULL")
      .all(pid) as { void_reason: string }[];
    expect(voided.length).toBeGreaterThan(0);
    expect(voided.every((r) => r.void_reason === 'empty_run')).toBe(true);
    // ...and the skill is back to its provisional seed ("ej övad" restored).
    expect(rateState(pid, 'add_doubles')).toBe('provisional');
    // A real (non-empty) measured sprint is untouched by the sweep.
    expect(rateState(pid, SKILL)).toBe('measured');
  });
});
