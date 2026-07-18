import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// A minimal durable-storage shim so the localStorage-backed answer queue can be
// exercised in node (the module only touches localStorage inside its functions).
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

import { intervalRate, errorRate } from '@/lib/rate';
import { buildItem, gradeBySeed, answerLengthOf, isAnswerComplete, digitCount } from '@/lib/item';
import { enqueueAnswer, pendingAnswers, ackAnswers, newIdemKey, type QueuedAnswer } from '@/app/_components/answerQueue';

describe('interval-based rate — correct answers per minute over summed CLIENT intervals', () => {
  it('computes correct/min and errors/min over the same denominator', () => {
    const items = [
      { correct: true, intervalMs: 2000 },
      { correct: true, intervalMs: 3000 },
      { correct: false, intervalMs: 1000 },
    ];
    // 2 correct over 6000ms → 2 × 60000 / 6000 = 20/min
    expect(intervalRate(items)).toBeCloseTo(20, 6);
    // 1 error over 6000ms → 10/min
    expect(errorRate(items)!).toBeCloseTo(10, 6);
  });

  it('EXCLUDES an interrupted interval so it can never inflate/deflate the rate', () => {
    // A 13-minute "interval" is an interruption, not the child. It must not enter the
    // denominator (mirrors the drill timing-void guarantee).
    const items = [
      { correct: true, intervalMs: 2000 },
      { correct: true, intervalMs: 13 * 60 * 1000 },
    ];
    // Only the 2000ms item is valid → 1 × 60000 / 2000 = 30/min (NOT dragged toward 0).
    expect(intervalRate(items)).toBeCloseTo(30, 6);
  });

  it('excludes impossible sub-human intervals and returns null with no clean signal', () => {
    expect(intervalRate([{ correct: true, intervalMs: 50 }])).toBeNull(); // < 150ms floor
    expect(intervalRate([])).toBeNull();
  });
});

describe('shared item contract — client and server build the SAME item from (code, seed)', () => {
  it('buildItem is deterministic from (code, seed) — two independent calls agree', () => {
    const a = buildItem('mult_table_5', 918273);
    const b = buildItem('mult_table_5', 918273); // "the other side" (server vs client)
    expect(b).toEqual(a);
    expect(a.prompt).toMatch(/5 × \d+ =/);
    // a different seed generally yields a different item
    expect(buildItem('mult_table_5', 5).prompt).not.toBe(buildItem('mult_table_5', 6).prompt);
  });

  it('gradeBySeed re-generates and grades authoritatively (client never supplies the key)', () => {
    const seed = 424242;
    const item = buildItem('mult_table_7', seed);
    expect(gradeBySeed('mult_table_7', seed, item.answer).correct).toBe(true);
    expect(gradeBySeed('mult_table_7', seed, '999999').correct).toBe(false);
  });
});

describe('sprint auto-submit boundary vs session explicit submit', () => {
  it('answerLengthOf is the digit count of the canonical answer', () => {
    const seed = 13579;
    const item = buildItem('mult_table_8', seed);
    expect(answerLengthOf('mult_table_8', seed)).toBe(digitCount(item.answer));
  });

  it('a sprint captures only when the entered digits reach the expected length', () => {
    // 2-digit answer: "4" is incomplete, "48" completes (auto-submit fires).
    expect(isAnswerComplete('4', 2)).toBe(false);
    expect(isAnswerComplete('48', 2)).toBe(true);
    // 1-digit answer completes on the first digit.
    expect(isAnswerComplete('7', 1)).toBe(true);
    // Empty never completes; answerLength 0 never auto-submits (sessions rely on ✓).
    expect(isAnswerComplete('', 2)).toBe(false);
    expect(isAnswerComplete('5', 0)).toBe(false);
  });
});

describe('durable + idempotent answer queue (#4)', () => {
  beforeEach(() => store.clear());
  const mk = (idemKey: string, over: Partial<QueuedAnswer> = {}): QueuedAnswer => ({
    idemKey, playerId: 'p1', kind: 'sprint', context: 's1', code: 'mult_table_5', seed: 1, given: '10', tries: 1, intervalMs: 2000, ts: 1, ...over,
  });

  it('enqueue is idempotent on idemKey and survives a re-read (durability)', () => {
    enqueueAnswer(mk('k1'));
    enqueueAnswer(mk('k1')); // retried enqueue — must not duplicate
    enqueueAnswer(mk('k2'));
    // A fresh read (as after a reload) sees both, exactly once each.
    expect(pendingAnswers().map((a) => a.idemKey).sort()).toEqual(['k1', 'k2']);
  });

  it('ack removes only the acknowledged entries; the rest persist for retry', () => {
    enqueueAnswer(mk('k1'));
    enqueueAnswer(mk('k2', { kind: 'session', context: '9' }));
    ackAnswers(['k1']);
    expect(pendingAnswers().map((a) => a.idemKey)).toEqual(['k2']);
    // kind filter (session vs sprint delivery paths)
    expect(pendingAnswers('sprint')).toHaveLength(0);
    expect(pendingAnswers('session')).toHaveLength(1);
  });

  it('newIdemKey is unique per call', () => {
    expect(newIdemKey('p1')).not.toBe(newIdemKey('p1'));
  });
});
