import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-writing-speed-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { startToolMeasure, submitToolMeasure } from '@/lib/sprint';
import { aimFor, defaultCeiling } from '@/lib/fluency';

const NOW = Date.UTC(2026, 6, 20);
let pid: string;

beforeAll(() => {
  const fam = repo.createFamily('bear+owl', 'b:o', 'b:x', NOW);
  pid = repo.createPlayer(fam, 'bear', 3, NOW); // åk3 ⇒ defaultCeiling 40
});

// The writing-speed probe now runs on the sprint numpad: server issues numbers, the
// client copies each and reports a client-measured interval, the server re-grades and
// states digits/min over the summed valid intervals.
describe('writing-speed probe on the numpad (interval-based)', () => {
  it('measures digits/min from items 1+ (the first number is orientation, excluded)', () => {
    const s = startToolMeasure(pid, NOW);
    expect(s.numbers.length).toBeGreaterThan(1);
    // Copy every number correctly, each in exactly 1s.
    const copies = s.numbers.map((n, i) => ({ i, given: n, intervalMs: 1000 }));
    // Item 0 is excluded (getting-started), so the rate is over items 1..N-1 only.
    const measuredDigits = s.numbers.slice(1).reduce((a, n) => a + n.length, 0);
    const measuredCount = s.numbers.length - 1;
    const r = submitToolMeasure(pid, s.toolId, copies, NOW + 60_000);
    expect(r?.digitsPerMin).toBeCloseTo((measuredDigits * 60000) / (measuredCount * 1000));
    expect(repo.latestToolRate(pid)).toBeCloseTo(r!.digitsPerMin);
  });

  it('excludes the first number, wrong copies, and out-of-window intervals', () => {
    const s = startToolMeasure(pid, NOW);
    const copies = s.numbers.map((n, i) => {
      if (i === 0) return { i, given: n, intervalMs: 500 }; // clean but ORIENTATION → excluded
      if (i === 1) return { i, given: n, intervalMs: 500 }; // the one clean, counted item
      if (i === 2) return { i, given: n, intervalMs: 90_000 }; // interrupted → excluded
      if (i === 3) return { i, given: '999999', intervalMs: 500 }; // wrong copy → excluded
      return { i, given: n, intervalMs: 50 }; // sub-human → excluded
    });
    const r = submitToolMeasure(pid, s.toolId, copies, NOW);
    // Rate rests on item 1 alone (item 0 is the excluded orientation number).
    expect(r?.digitsPerMin).toBeCloseTo((s.numbers[1].length * 60000) / 500);
  });

  it('writes no measurement when nothing is clean', () => {
    const s = startToolMeasure(pid, NOW);
    const before = repo.toolRateCount(pid);
    const copies = s.numbers.map((n, i) => ({ i, given: 'nope', intervalMs: 1000 }));
    expect(submitToolMeasure(pid, s.toolId, copies, NOW)).toBeNull();
    expect(repo.toolRateCount(pid)).toBe(before); // no ledger write
  });

  it('a stale/foreign toolId yields no measurement', () => {
    expect(submitToolMeasure(pid, 'no-such-tool', [], NOW)).toBeNull();
  });
});

// The numpad copies faster than the old OS-keyboard probe, so a raw 0.55×rate would
// demand more digits/min than a child can enter and no sprint could cross it. The aim
// caps at the grade default: a measurement can only LOWER the bar for a slow hand.
describe('aim caps a fast writing speed at the reachable grade default', () => {
  it('a fast numpad rate does not raise the aim above the default', () => {
    expect(aimFor(200, 3)).toBeCloseTo(0.55 * defaultCeiling(3)); // 200 ≫ 40 ⇒ capped
    expect(aimFor(defaultCeiling(3), 3)).toBeCloseTo(0.55 * defaultCeiling(3)); // exactly at ⇒ same
  });

  it('a slow measured hand lowers the aim below the default', () => {
    const slow = defaultCeiling(3) - 15; // 25, well under the ceiling
    expect(aimFor(slow, 3)).toBeCloseTo(0.55 * slow);
    expect(aimFor(slow, 3)).toBeLessThan(aimFor(null, 3));
  });
});
