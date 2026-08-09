import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-signal-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { replay } from '@/db/replay';
import { fluencySignal } from '@/lib/fluency-signal';
import { newSessionToken, hashToken } from '@/lib/session';

const NOW = Date.UTC(2026, 7, 9);
const attempt = (pid: string, code: string, at: number) =>
  repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 2000, at });

describe('outward fluency signal (contract v0.1)', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`t+i-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 3, NOW); // åk3
    replay(pid);
  });

  it('unknown code → met:false, fluent:false, confidence:unknown', () => {
    expect(fluencySignal(pid, 'not_a_real_code')).toEqual({ met: false, fluent: false, confidence: 'unknown' });
  });

  it('a seeded, never-served, GRANTED skill → not met, fluent on a guess (provisional)', () => {
    // add_within_10 (year 1): an åk3 seed grants it, but nothing has been answered.
    const s = fluencySignal(pid, 'add_within_10');
    expect(s.met).toBe(false); // never attempted
    expect(s.fluent).toBe(true); // seed grant opens the gate
    expect(s.confidence).toBe('provisional'); // …but only a guess — never accept this for the bench
  });

  it('met flips true once the child has answered it', () => {
    attempt(pid, 'add_within_10', NOW + 1000);
    replay(pid);
    expect(fluencySignal(pid, 'add_within_10').met).toBe(true);
  });

  it('a clean fast sprint makes confidence measured — the bench row', () => {
    attempt(pid, 'add_within_10', NOW + 1000);
    repo.appendSprint(pid, 'add_within_10', 20, 20, 0, NOW + 2000); // 20 correct in 20s ⇒ rate ≫ aim
    replay(pid);
    const s = fluencySignal(pid, 'add_within_10');
    expect(s).toEqual({ met: true, fluent: true, confidence: 'measured' }); // fluent && measured
  });

  it('a not-granted skill above the child is fluent:false (provisional below aim)', () => {
    const s = fluencySignal(pid, 'dec_sub_borrow'); // year 6, no seed grant for åk3
    expect(s.fluent).toBe(false);
    expect(s.confidence).toBe('provisional');
  });

  it('never throws on an unmeasured component (the unknown-rate guard)', () => {
    // A fresh player with no ability rows at all — buildStates would hand an unknown rate.
    const fam = repo.createFamily('bare', 'a:b', 'a:c', NOW);
    const bare = repo.createPlayer(fam, 'owl', 4, NOW); // created but NOT replayed
    expect(() => fluencySignal(bare, 'add_within_10')).not.toThrow();
  });
});

describe('per-child read token (least privilege)', () => {
  let a: string, b: string;
  beforeEach(() => {
    const fam = repo.createFamily(`t+i-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    a = repo.createPlayer(fam, 'mouse', 3, NOW);
    b = repo.createPlayer(fam, 'duck', 0, NOW); // a sibling
  });

  it('a minted token resolves to exactly its own child', () => {
    const { token, tokenHash } = newSessionToken();
    repo.createPlayerReadToken(tokenHash, a, NOW);
    expect(repo.playerIdForReadToken(hashToken(token))).toBe(a); // resolves from the raw token
    expect(repo.playerIdForReadToken('deadbeef')).toBeNull(); // an unknown token authorises nothing
  });

  it("one child's token never resolves to a sibling", () => {
    const { token } = newSessionToken();
    repo.createPlayerReadToken(hashToken(token), a, NOW);
    expect(repo.playerIdForReadToken(hashToken(token))).not.toBe(b); // a's token is not b's
  });

  it('a revoked token authorises nothing (consent withdrawn)', () => {
    const { token } = newSessionToken();
    repo.createPlayerReadToken(hashToken(token), a, NOW);
    repo.revokePlayerReadToken(hashToken(token), NOW + 1000);
    expect(repo.playerIdForReadToken(hashToken(token))).toBeNull();
  });
});
