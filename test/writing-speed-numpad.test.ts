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
  pid = repo.createPlayer(fam, 'bear', 3, NOW); // åk3 ⇒ defaultCeiling(3) = 27
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

// Additive aim (replaces the old multiplicative 0.55×rate + cap): the bar is motor
// time + a fixed retrieval budget, so every hand gets the SAME recall time and a
// faster writer is never handed a harder recall standard. No cap needed — the aim is
// always below the tap rate, hence physically reachable.
const add = (rate: number) => 60 / (60 / rate + 2);
describe('additive aim: same retrieval budget for every hand, always reachable', () => {
  it('a faster hand raises the items/min aim but grants identical recall time', () => {
    const fast = aimFor(45, 3), slow = aimFor(26, 3);
    expect(fast).toBeGreaterThan(slow); // faster hand → higher items/min...
    const retrieval = (r: number) => 60 / aimFor(r, 3) - 60 / r; // target time − motor time
    expect(retrieval(45)).toBeCloseTo(retrieval(26), 5); // ...but the SAME X seconds of recall (the fix)
    expect(fast).toBeLessThan(45); // always physically reachable — no cap required
  });

  it('a slow measured hand lowers the aim below the seed', () => {
    expect(aimFor(25, 3)).toBeCloseTo(add(25), 5);
    expect(aimFor(25, 3)).toBeLessThan(aimFor(null, 3));
  });
});
