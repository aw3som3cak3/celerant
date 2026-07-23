import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-unlock-mono-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { buildStates } from '@/lib/practice';
import { computeUnlocked, type SelState } from '@/lib/selector';

// THE INVARIANT: no measurement may ever revoke access a child already had. The unlock
// gate compares a frozen rate to a moving aim; when the aim drifts up (tool_rate change,
// or the demonstrated-throughput tap floor rising after a GOOD sprint) a naive gate
// silently re-locks skills the child already had — "perform well, get locked out". These
// tests shove the aim arbitrarily and assert no unlock ever flips from true to false.

const unlockedCodes = (states: SelState[]) =>
  [...computeUnlocked(states)].filter(([, u]) => u).map(([c]) => c);

describe('unlock is monotonic under aim drift', () => {
  let pid: string;
  beforeAll(() => {
    const fam = repo.createFamily('cat+dog', 'a:b', 'a:c', 1000);
    pid = repo.createPlayer(fam, 'cat', 3, 1000);
    // real history: solid on add_within_10, then a clean sprint that CROSSES its aim
    for (let i = 0; i < 20; i++)
      repo.appendAttempt({ playerId: pid, skillCode: 'add_within_10', itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 1500, at: 2000 + i * 1000 });
    repo.appendSprint(pid, 'add_within_10', 30, 25, 0, 100000); // 50/min ⇒ earned
  });

  it('cranking every aim to absurdity revokes no unlock', () => {
    const states = buildStates(pid, 3);
    const before = unlockedCodes(states);
    expect(before.length).toBeGreaterThan(3);
    // The harshest possible upward drift: every aim to 1e9, so no frozen rate can ever
    // meet it. Only a STORED grant (seedFluent / earnedFluent) can carry an unlock now.
    const shoved = states.map((s) => ({ ...s, aim: 1e9 }));
    const after = computeUnlocked(shoved);
    for (const c of before) expect(after.get(c), `${c} lost its unlock under aim drift`).toBe(true);
  });

  it('a good sprint that raises the demonstrated-throughput floor locks nothing already unlocked', () => {
    const before = unlockedCodes(buildStates(pid, 3));
    // A blazing 2-digit sprint raises best_observed sharply, lifting every aim — the exact
    // "third door": performing well must not re-lock what you already had.
    repo.appendSprint(pid, 'add_tens', 30, 30, 0, 200000); // 60/min, 2-digit ⇒ large floor
    const after = computeUnlocked(buildStates(pid, 3));
    for (const c of before) expect(after.get(c), `${c} re-locked by a good sprint`).toBe(true);
  });
});
