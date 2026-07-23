import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-tiebreak-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { skillEligibility, eligibleSprintSkills, sprintOffer } from '@/lib/sprint';

const NOW = Date.now();

// Make a skill sprint-eligible ('building'): 20 first-try-correct non-warmup attempts.
function makeEligible(pid: string, code: string, at: number) {
  for (let i = 0; i < 20; i++)
    repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{"prompt":"x"}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 1500, at: at + i * 1000 });
}
// Give a skill some practised (non-warmup) attempts without necessarily making it eligible.
function practise(pid: string, code: string, n: number, at: number) {
  for (let i = 0; i < n; i++)
    repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{"prompt":"x"}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 1500, at: at + i * 1000 });
}

let pid: string;
beforeAll(() => {
  const fam = repo.createFamily('cat+dog', 'a:b', 'a:c', NOW);
  pid = repo.createPlayer(fam, 'cat', 3, NOW);
  // Two eligible components. add_within_10 has a dependent (add_2d_no_carry) we will
  // practise → it ARMS a test. add_doubles's dependents we leave unpractised.
  makeEligible(pid, 'add_within_10', NOW);
  makeEligible(pid, 'add_doubles', NOW + 50_000);
  practise(pid, 'add_2d_no_carry', 12, NOW + 100_000); // dependent of add_within_10, now "practised"
  // Make BOTH parents "just practised" (in the last-15 offer window) so the offer is
  // decided by the tie-breaker, not recency: 6 recent attempts each, interleaved.
  for (let i = 0; i < 6; i++) {
    practise(pid, 'add_within_10', 1, NOW + 200_000 + i * 2000);
    practise(pid, 'add_doubles', 1, NOW + 201_000 + i * 2000);
  }
});

describe('sprint-offer tie-breaker — arms a transfer test, never changes eligibility', () => {
  it('marks armsTest on a skill with a practised dependent, not on one without', () => {
    const e = skillEligibility(pid);
    const a = e.find((x) => x.code === 'add_within_10')!;
    const b = e.find((x) => x.code === 'add_doubles')!;
    expect(a.band).toBe('building');
    expect(b.band).toBe('building');
    expect(a.armsTest).toBe(true); // add_2d_no_carry practised (12 ≥ 10)
    expect(a.newEdge).toBe(true); // not yet measured
    expect(b.armsTest).toBe(false); // its dependents are unpractised
  });

  it('the tie-breaker does NOT change which skills are eligible (same set, reordered only)', () => {
    const elig = eligibleSprintSkills(pid).map((e) => e.code).sort();
    expect(elig).toContain('add_within_10');
    expect(elig).toContain('add_doubles');
  });

  it('the offer prefers the test-arming skill when both were just practised', () => {
    // Both just-practised (recent attempts exist for both); the offer should pick the
    // one that arms a test. add_2d_no_carry practised most-recently keeps both parents
    // "just practised" via their own recent attempts.
    const offer = sprintOffer(pid, NOW + 200_000);
    expect(offer).not.toBeNull();
    expect(offer!.code).toBe('add_within_10'); // armsTest wins the tie-break
  });
});
