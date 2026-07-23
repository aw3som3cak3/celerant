import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-reach-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { ingestSprint } from '@/lib/sprint';
import { buildItem } from '@/lib/item';
import { aimFor } from '@/lib/fluency';

// THE ACCEPTANCE TEST for Phase A: with the rate re-based onto clean client
// intervals, can a fluent child actually CROSS an aim through the real input path?
// This is what tells us the sprint reward — dormant in prod behind a wall-clock
// rate polluted by keyboard-appear + load + round-trips — is finally alive. We run
// realistic per-answer numpad latencies through the real ingestSprint and check the
// outcome against the aim the kid is actually held to.
const NOW = Date.UTC(2026, 6, 21);
const CODE = 'mult_table_5';

function fluentRun(pid: string, key: string, perAnswerMs: number, n = 20, correctN = 19) {
  const results = Array.from({ length: n }, (_, i) => {
    const seed = 5000 + i;
    const answer = buildItem(CODE, seed).answer;
    return { seed, given: i < correctN ? answer : String(Number(answer) + 1), intervalMs: perAnswerMs };
  });
  return ingestSprint(pid, CODE, key, results, NOW);
}

describe('milestone reachability under realistic numpad input latency', () => {
  let pid: string;
  beforeAll(() => {
    const fam = repo.createFamily('deer+fox', 'd:f', 'd:x', NOW);
    pid = repo.createPlayer(fam, 'deer', 2, NOW); // åk2, no measured tool-rate → default aim
  });

  it('a fluent åk2 child crosses the default aim through clean intervals', () => {
    const aim = aimFor(null, 2); // 0.55 × defaultCeiling(2) = 0.55 × 35 = 19.25/min
    // A fluent child answers a single-fact sprint in ~2.2s per item on the numpad
    // (read + recall + tap 1–2 digits), 19/20 correct.
    const r = fluentRun(pid, 'reach-fluent', 2200);
    // 19 × 60000 / (20 × 2200) = 25.9/min — comfortably over the 19.25 aim.
    expect(r.correctPerMin).toBeGreaterThan(aim);
    expect(r.outcome?.kind).toBe('milestone'); // THE LIGHT COMES ON
    // Report the headroom explicitly.
    // eslint-disable-next-line no-console
    console.log(`REACHABILITY: aim=${aim.toFixed(1)}/min  fluent@2200ms=${r.correctPerMin.toFixed(1)}/min  → ${r.outcome?.kind}`);
  });

  it('maps the crossover: fast fluent crosses, ~3.6s/answer is the boundary', () => {
    const aim = aimFor(null, 2); // additive: 60/(60/35+2) ≈ 16.15/min
    const fast = fluentRun(pid, 'reach-fast', 1600); // strong fluent
    const boundary = fluentRun(pid, 'reach-boundary', 3600); // hesitant
    expect(fast.correctPerMin).toBeGreaterThan(aim); // 19×60000/32000 = 35.6/min ✓
    // 19×60000/(20×3600) = 15.8/min ≈ aim — the natural fluency boundary, not a UI artifact.
    expect(boundary.correctPerMin).toBeLessThanOrEqual(aim + 0.5);
    // eslint-disable-next-line no-console
    console.log(`REACHABILITY map: fast@1600ms=${fast.correctPerMin.toFixed(1)}  boundary@3000ms=${boundary.correctPerMin.toFixed(1)}  aim=${aim.toFixed(1)}`);
  });
});
