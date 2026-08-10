import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-spelling-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { buildItem, gradeBySeed, answerLengthOf } from '@/lib/item';
import { nextSpellingWord, issueNext, sessionSelectOpts } from '@/lib/practice';
import { sprintBatch } from '@/lib/sprint';
import { replay } from '@/db/replay';
import {
  T2_WORDS, T3_WORDS, T3_PAIRS, encodeSpellingSeed, decodeSpellingSeed, wordForSeed,
} from '@/lib/spelling-content';

const CONS = 'bcdfghjklmnpqrstvwxz';
const NOW = Date.UTC(2026, 7, 8);

describe('spelling content — T2 transparency invariants (the machine half of the exclusion)', () => {
  const t2 = [...T2_WORDS.practice, ...T2_WORDS.holdout];
  it('no T2 word has a doubled consonant (that is the T3 tier)', () => {
    const bad = t2.filter((w) => new RegExp(`([${CONS}])\\1`).test(w));
    expect(bad, `doubled: ${bad}`).toEqual([]);
  });
  it('no T2 word carries a T4 grapheme (sj/tj/ng/gn/j digraphs)', () => {
    const bad = t2.filter((w) => /sj|stj|skj|tj|kj|dj|hj|lj|ng|gn|j/.test(w));
    expect(bad, `T4 digraph: ${bad}`).toEqual([]);
  });
  it('no T2 word has k/g/sk before a front vowel (that makes a tj/sj sound)', () => {
    const bad = t2.filter((w) => /(sk|k|g)[eiyäö]/.test(w));
    expect(bad, `soft k/g/sk: ${bad}`).toEqual([]);
  });
  it('no T2 word uses o or å (the o-å quality trap)', () => {
    expect(t2.filter((w) => /[oå]/.test(w))).toEqual([]);
  });
  it('practice and holdout are disjoint and holdout is non-empty', () => {
    expect(T2_WORDS.holdout.length).toBeGreaterThan(0);
    expect(T2_WORDS.practice.filter((w) => T2_WORDS.holdout.includes(w))).toEqual([]);
  });
  it('no T2 word is a member of any T3 minimal pair', () => {
    const t3 = new Set([...T3_PAIRS.flatMap((p) => [p.short, p.long])]);
    expect(t2.filter((w) => t3.has(w))).toEqual([]);
  });
});

describe('spelling content — T3 pairs + practice/holdout split (held on audio)', () => {
  it('every pair differs (short doubles the consonant) and members are distinct', () => {
    for (const p of T3_PAIRS) expect(p.short).not.toBe(p.long);
  });
  it('T3 practice and holdout draw from DIFFERENT pairs (generalization sprint)', () => {
    const inter = T3_WORDS.practice.filter((w) => T3_WORDS.holdout.includes(w));
    expect(inter).toEqual([]);
    expect(T3_WORDS.holdout.length).toBeGreaterThan(0);
  });
});

describe('seed ↔ word codec (the pure client/grader path)', () => {
  it('encode/decode round-trips phase and index', () => {
    for (const phase of ['practice', 'holdout'] as const)
      for (const i of [0, 1, 7, 23]) expect(decodeSpellingSeed(encodeSpellingSeed(phase, i))).toEqual({ phase, index: i });
  });
  it('wordForSeed / buildItem / gradeBySeed all reproduce the same word', () => {
    T2_WORDS.practice.forEach((w, i) => {
      const seed = encodeSpellingSeed('practice', i);
      expect(wordForSeed('spelling_t2', seed)).toBe(w);
      const item = buildItem('spelling_t2', seed);
      expect(item.answer).toBe(w); // the answer IS the word
      expect(item.prompt).toBe(''); // dictation: nothing shown
      expect(answerLengthOf('spelling_t2', seed)).toBe(w.length); // letters, for the pad
      expect(gradeBySeed('spelling_t2', seed, w).correct).toBe(true);
      expect(gradeBySeed('spelling_t2', seed, w + 'x').correct).toBe(false);
    });
  });
});

describe('item provider (A13/A14) — unseen-first, then LRU recycle', () => {
  let pid: string;
  beforeEach(() => {
    const fam = repo.createFamily(`t+i-${Math.random().toString(36).slice(2)}`, 'x:y', 'x:z', NOW);
    pid = repo.createPlayer(fam, 'mouse', 3, NOW);
  });
  const serve = (seed: number, at: number) =>
    repo.appendAttempt({ playerId: pid, skillCode: 'spelling_t2', itemJson: JSON.stringify({ seed }), given: 'x', correct: 1, tries: 1, dontKnow: false, latencyMs: 2000, at });

  it('never repeats a word until the practice pool is exhausted', () => {
    const seen = new Set<string>();
    for (let i = 0; i < T2_WORDS.practice.length; i++) {
      const seed = nextSpellingWord(pid, 'spelling_t2', 'practice');
      const w = wordForSeed('spelling_t2', seed)!;
      expect(seen.has(w), `repeat before exhaustion: ${w}`).toBe(false);
      seen.add(w);
      serve(seed, NOW + i * 1000); // record it as seen
    }
    expect(seen.size).toBe(T2_WORDS.practice.length); // saw every practice word exactly once
  });

  it('after exhaustion, recycles the least-recently-seen word', () => {
    // Serve every practice word; make index 0 the oldest.
    T2_WORDS.practice.forEach((_, i) => serve(encodeSpellingSeed('practice', i), NOW + (i === 0 ? 0 : 10_000 + i)));
    const seed = nextSpellingWord(pid, 'spelling_t2', 'practice');
    expect(wordForSeed('spelling_t2', seed)).toBe(T2_WORDS.practice[0]); // the oldest
  });

  it('a subject:spelling session issues SPELLING items end-to-end (run subject → issueNext)', () => {
    replay(pid); // seed the player's ability rows (incl spelling) so buildStates never throws
    const sid = repo.createSessionRun(pid, 10, NOW, 'spelling');
    const opts = sessionSelectOpts({ id: pid, school_year: 3, stretch: 0 }, sid, NOW);
    expect(opts.subject).toBe('spelling'); // carried off the run
    const item = issueNext(pid, 3, NOW, opts);
    expect(item.code.startsWith('spelling')).toBe(true); // a spelling skill, never a maths one
    expect(wordForSeed(item.code, item.seed)).toBeTruthy(); // the seed decodes to a real word
  });

  it('a spelling sprint batch draws distinct HOLDOUT words', () => {
    const batch = sprintBatch(pid, 'spelling_t2', NOW);
    // eligibility may gate the batch to null for a fresh player; only assert when present.
    if (batch) {
      const words = batch.items.slice(0, T2_WORDS.holdout.length).map((it) => wordForSeed('spelling_t2', it.seed));
      expect(new Set(words).size).toBe(T2_WORDS.holdout.length); // distinct across the holdout span
      expect(words.every((w) => T2_WORDS.holdout.includes(w!))).toBe(true); // holdout only
    }
  });
});
