import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-tool-test-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { aimFor, defaultCeiling } from '@/lib/fluency';

// Mirrors the /api/me rule: ask at most once per local day, stop after 3 real
// measurements.
const TOOL_TEST_TARGET = 3;
const needsToolTest = (pid: string, now: number) =>
  repo.toolRateCount(pid) < TOOL_TEST_TARGET && !repo.measuredToolRateToday(pid, now);

// Noon UTC on distinct dates ⇒ distinct Europe/Stockholm local days.
const D = (iso: string) => Date.parse(iso + 'T12:00:00Z');
const day1 = D('2026-07-10'), day2 = D('2026-07-11'), day3 = D('2026-07-12');

let pid: string;
beforeAll(() => {
  const fam = repo.createFamily('cat+dog', 'a:b', 'a:c', day1);
  pid = repo.createPlayer(fam, 'cat', 3, day1); // åk3 ⇒ seeded aim 22
});

describe('writing-speed test invitation — once/day, capped at 3', () => {
  it('a fresh child is invited', () => {
    expect(repo.toolRateCount(pid)).toBe(0);
    expect(needsToolTest(pid, day1)).toBe(true);
  });

  it('after measuring today the invite is gone for the day, back tomorrow', () => {
    repo.appendToolRate(pid, 38, day1 + 3600_000); // measured on day1
    expect(repo.toolRateCount(pid)).toBe(1);
    expect(repo.measuredToolRateToday(pid, day1 + 7200_000)).toBe(true);
    expect(needsToolTest(pid, day1 + 7200_000)).toBe(false); // same day ⇒ hidden
    expect(needsToolTest(pid, day2)).toBe(true); // next day ⇒ back (only 1 so far)
  });

  it('after the third measurement it is never asked again', () => {
    repo.appendToolRate(pid, 41, day2 + 3600_000);
    expect(needsToolTest(pid, day2 + 7200_000)).toBe(false); // measured today
    expect(needsToolTest(pid, day3)).toBe(true); // 2 measurements, new day ⇒ still asked
    repo.appendToolRate(pid, 39, day3 + 3600_000); // the third
    expect(repo.toolRateCount(pid)).toBe(3);
    expect(needsToolTest(pid, day3 + 7200_000)).toBe(false);
    expect(needsToolTest(pid, D('2026-07-20'))).toBe(false); // any later day ⇒ never again
  });

  it('a measurement grounds the aim in real hand speed (no longer the årskurs seed)', () => {
    // Before any measurement the aim used the seeded ceiling; now it uses the child's
    // measured writing speed (latest-wins), so the fluency bar is personal.
    const seededAim = aimFor(null, 3); // 0.55 × defaultCeiling(3)
    expect(seededAim).toBeCloseTo(0.55 * defaultCeiling(3));
    const measuredAim = aimFor(repo.latestToolRate(pid), 3); // latest = 39
    expect(measuredAim).toBeCloseTo(0.55 * 39);
    expect(measuredAim).not.toBeCloseTo(seededAim);
  });
});
