import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-calib-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { calibrationReport, fatigueReport } from '@/lib/calibration';

const NOW = Date.UTC(2026, 6, 22);
let pid: string;
beforeAll(() => {
  const fam = repo.createFamily('bear+owl', 'b:o', 'b:x', NOW);
  pid = repo.createPlayer(fam, 'bear', 2, NOW);
});

function attempt(code: string, correct: boolean, tries: number, idk: boolean, latency: number, at: number, sessionRunId: number | null) {
  repo.appendAttempt({
    playerId: pid, skillCode: code, itemJson: '{}', given: idk ? null : '1',
    correct: correct ? 1 : 0, tries, dontKnow: idk, warmup: false, latencyMs: latency, at, idemKey: `k${at}${code}`, sessionRunId,
  });
}

describe('calibration monitor', () => {
  it('flags a skill served too hard, one too easy, and leaves an on-target skill alone', () => {
    let t = NOW;
    // too hard: 20 attempts, mostly first-try wrong (~30%)
    for (let i = 0; i < 20; i++) attempt('sub_within_10', i < 6, i < 6 ? 1 : 2, false, 5000, (t += 1000), null);
    // too easy: 20 attempts, ~100% first-try
    for (let i = 0; i < 20; i++) attempt('add_within_10', true, 1, false, 5000, (t += 1000), null);
    // on target: 20 attempts at ~80% first-try
    for (let i = 0; i < 20; i++) attempt('add_tens', i < 16, i < 16 ? 1 : 2, false, 5000, (t += 1000), null);

    const rep = calibrationReport(pid);
    const v = (c: string) => rep.find((r) => r.code === c)?.verdict;
    expect(v('sub_within_10')).toBe('too_hard');
    expect(v('add_within_10')).toBe('too_easy');
    expect(v('add_tens')).toBe('ok');
  });

  it('a sub-3s tap-through idk is excluded from the observed rate (matches the model)', () => {
    let t = NOW + 1_000_000;
    // 15 clean first-try correct + 15 tap-through idks (1s). Excluding tap-throughs → 100%.
    for (let i = 0; i < 15; i++) attempt('add_doubles', true, 1, false, 5000, (t += 1000), null);
    for (let i = 0; i < 15; i++) attempt('add_doubles', false, 0, true, 1000, (t += 1000), null); // tap-through
    const r = calibrationReport(pid).find((x) => x.code === 'add_doubles');
    expect(r?.observed).toBe(1); // tap-throughs dropped → all remaining are first-try correct
  });

  it('the fatigue curve finds the position where accuracy breaks', () => {
    const fam = repo.createFamily('cat+dog', 'c:d', 'c:x', NOW);
    const kid = repo.createPlayer(fam, 'cat', 1, NOW);
    let t = NOW + 2_000_000;
    // 8 sessions of 10 items: first 6 always right, last 4 always wrong → break at pos 7.
    for (let s = 0; s < 8; s++) {
      const run = repo.createSessionRun(kid, 10, (t += 100));
      for (let pos = 1; pos <= 10; pos++) {
        const ok = pos <= 6;
        repo.appendAttempt({ playerId: kid, skillCode: 'add_within_10', itemJson: '{}', given: '1', correct: ok ? 1 : 0, tries: ok ? 1 : 2, dontKnow: false, warmup: false, latencyMs: 5000, at: (t += 100), idemKey: `f${s}${pos}`, sessionRunId: run });
      }
    }
    const f = fatigueReport(kid, 10);
    expect(f.enoughData).toBe(true);
    expect(f.breakPos).toBe(7); // 100% for 1–6, then it craters
  });
});
