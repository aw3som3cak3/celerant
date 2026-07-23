import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-sprint-ingest-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { ingestSprint } from '@/lib/sprint';
import { buildItem } from '@/lib/item';
import { MILESTONE_BONUS } from '@/lib/fluency';

const NOW = Date.UTC(2026, 6, 20);
const CODE = 'mult_table_5';
let pid: string;

beforeAll(() => {
  const fam = repo.createFamily('bear+owl', 'b:o', 'b:x', NOW);
  // åk2, no tool_rate → aim from the grade default ceiling, digit-adjusted per skill.
  // mult_table_5 answers are all two digits, so its motor budget is 2 digit-times:
  // aim = 60/(2×60/30 + 2) = 10/min (vs 15/min if it were judged as one digit).
  pid = repo.createPlayer(fam, 'bear', 2, NOW);
});

// n items, the first `correctCount` answered right, each with the given interval.
function results(n: number, correctCount: number, intervalMs: number, seedBase = 0) {
  return Array.from({ length: n }, (_, i) => {
    const seed = seedBase + 1000 + i;
    const answer = buildItem(CODE, seed).answer;
    const given = i < correctCount ? answer : String(Number(answer) + 1); // +1 → a wrong number
    return { seed, given, intervalMs };
  });
}
const sprintRow = (key: string) =>
  getDb().prepare('SELECT correct, errors, interval_ms, voided_at, sprint_key FROM sprint WHERE sprint_key = ?').get(key) as
    | { correct: number; errors: number; interval_ms: number; voided_at: number | null; sprint_key: string }
    | undefined;
const rateOf = () =>
  getDb().prepare('SELECT rate, rate_state FROM ability WHERE player_id = ? AND skill_code = ?').get(pid, CODE) as { rate: number; rate_state: string };

describe('interval-based sprint ingest re-bases the rate, feeding the UNCHANGED outcome logic', () => {
  it('milestone: fast + accurate crosses the aim → records an interval rate, awards the one-time bonus once', () => {
    // 20 correct @ 1000ms each → 20×60000/20000 = 60/min ≫ aim; acc 1.0 → milestone.
    const r = ingestSprint(pid, CODE, 'run-milestone', results(20, 20, 1000), NOW);
    expect(r.outcome?.kind).toBe('milestone');
    expect(r.correctPerMin).toBeCloseTo(60, 3); // interval-based, NOT wall-clock
    expect(r.bonus?.units).toBe(MILESTONE_BONUS);

    const row = sprintRow('run-milestone')!;
    expect(row.voided_at).toBeNull(); // credible → not voided
    expect(row.interval_ms).toBe(20000);
    expect(rateOf().rate_state).toBe('measured');
    expect(rateOf().rate).toBeCloseTo(60, 3);
  });

  it('idempotent on sprintKey: a retried batch writes no second row and re-awards no bonus', () => {
    const rowsBefore = (getDb().prepare('SELECT COUNT(*) c FROM sprint WHERE player_id = ?').get(pid) as { c: number }).c;
    const r = ingestSprint(pid, CODE, 'run-milestone', results(20, 20, 1000), NOW); // same key
    const rowsAfter = (getDb().prepare('SELECT COUNT(*) c FROM sprint WHERE player_id = ?').get(pid) as { c: number }).c;
    expect(rowsAfter).toBe(rowsBefore); // no duplicate
    expect(r.bonus).toBeNull(); // side effects fire once only
  });

  it('collapse: accuracy falls apart → row is VOIDED (no rate), skill demoted, no bonus', () => {
    // 8/20 correct = 0.40 acc < 0.5 → collapse.
    const r = ingestSprint(pid, CODE, 'run-collapse', results(20, 8, 1000, 9000), NOW);
    expect(r.outcome?.kind).toBe('collapse');
    expect(r.bonus).toBeNull();
    expect(sprintRow('run-collapse')!.voided_at).not.toBeNull(); // voided → replay ignores it, no rate
    const demoted = getDb()
      .prepare("SELECT COUNT(*) c FROM usage_event WHERE player_id = ? AND kind = 'sprint_demoted'")
      .get(pid) as { c: number };
    expect(demoted.c).toBe(1);
  });

  it('near-miss build_speed: slow but accurate → no reward, base stands, coaching = build speed', () => {
    // 20 correct @ 8000ms → 20×60000/160000 = 7.5/min < aim (10/min); acc 1.0 → near_miss build_speed.
    const r = ingestSprint(pid, CODE, 'run-nearmiss', results(20, 20, 8000, 20000), NOW);
    expect(r.outcome).toEqual({ kind: 'near_miss', reason: 'build_speed' });
    expect(r.correctPerMin).toBeCloseTo(7.5, 3);
    expect(r.bonus).toBeNull();
  });

  it('excludes interrupted intervals from both accuracy and the rate', () => {
    // 2 clean correct @ 1000ms + one 13-minute interrupted item → only the 2 count.
    const rs = [...results(2, 2, 1000, 30000), { seed: 40000, given: buildItem(CODE, 40000).answer, intervalMs: 13 * 60 * 1000 }];
    const r = ingestSprint(pid, CODE, 'run-interrupt', rs, NOW);
    expect(r.correct).toBe(2); // the interrupted item is not counted
    expect(r.correctPerMin).toBeCloseTo(60, 3); // 2×60000/2000, interruption excluded
  });
});
