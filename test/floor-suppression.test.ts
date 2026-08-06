import { describe, it, expect } from 'vitest';
import { selectItem, type SelState } from '@/lib/selector';

// A minimal unlocked+fluent skill. theta 2.4 ⇒ p≈0.92 (in the [0.6,1.0] band);
// seedFluent grants the fluency gate so downstream skills unlock.
const mk = (over: Partial<SelState> & { code: string }): SelState => ({
  family: 'f', year: 1, mode: 'component', skillId: 0,
  theta: 2.4, lastSeenAt: null, requires: [], rate: { source: 'provisional', value: 10 },
  aim: 10, volatility: 0, seedFluent: true, earnedFluent: false, ...over,
});

// Floor rung (year 0) → symbolic skill (year 1) that requires it.
const floor = mk({ code: 'more_or_less', year: 0, requires: [] });
const symbolic = mk({ code: 'add_within_10', year: 1, requires: ['more_or_less'] });

const opts = (seedGrade: number, symTheta = 2.4) => ({
  now: 0, previousCode: null, recentCodes: [] as string[], rand: () => 0.5, seedGrade,
});
const elig = (states: SelState[], o: ReturnType<typeof opts>) => {
  const { scores } = selectItem(states, o);
  return new Map(scores.map((s) => [s.code, s.eligible]));
};

describe('placement-aware floor suppression', () => {
  it('suppresses the year-0 floor for a child placed above it with symbolic work', () => {
    const e = elig([floor, symbolic], opts(1));
    expect(e.get('more_or_less')).toBe(false); // floor gone
    expect(e.get('add_within_10')).toBe(true); // symbolic kept
  });

  it('keeps the floor for a beginner (seedGrade 0 — no placement above it)', () => {
    const e = elig([floor, symbolic], opts(0));
    expect(e.get('more_or_less')).toBe(true);
  });

  it('keeps the floor for a regressed child with NO in-band symbolic work', () => {
    // symbolic θ=0 ⇒ p=0.5, below the band's 0.6 floor: the child can't do the
    // symbolic skill, so the on-ramp is exactly what they need — never suppressed.
    const regressed = mk({ code: 'add_within_10', year: 1, requires: ['more_or_less'], theta: 0 });
    const e = elig([floor, regressed], opts(2));
    expect(e.get('more_or_less')).toBe(true);
  });

  it('never empties the pool: floor stays if it is the only eligible work', () => {
    // A placed-above child whose only in-band skill is itself a floor rung: the
    // guard (some non-floor eligible) fails, so nothing is suppressed.
    const e = elig([floor], opts(2));
    expect(e.get('more_or_less')).toBe(true);
  });

  it('default (no seedGrade) suppresses nothing — backward compatible', () => {
    const { scores } = selectItem([floor, symbolic], { now: 0, previousCode: null, recentCodes: [], rand: () => 0.5 });
    expect(scores.find((s) => s.code === 'more_or_less')!.eligible).toBe(true);
  });
});
