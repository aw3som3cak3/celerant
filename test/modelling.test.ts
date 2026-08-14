import { describe, it, expect } from 'vitest';
import { makeRng } from '@/lib/rng';
import {
  evalStep,
  evaluateModel,
  validate,
  quantities,
  qval,
  withValues,
  sensibleResult,
  pizzaProblem,
  fairShareProblem,
  budgetProblem,
  SCENARIOS,
  type Model,
  type Openness,
} from '@/lib/modelling';

describe('evalStep — the calculator, with scenario-specific division', () => {
  it('the four operations', () => {
    expect(evalStep(8, 2, '×').value).toBe(16);
    expect(evalStep(6, 2, '+').value).toBe(8);
    expect(evalStep(6, 2, '−').value).toBe(4);
  });
  it("ceil division orders whole units and flags rounding (can't buy half a pizza)", () => {
    expect(evalStep(16, 8, '÷', 'ceil')).toEqual({ value: 2, remainder: 0, rounded: false });
    expect(evalStep(12, 8, '÷', 'ceil')).toEqual({ value: 2, remainder: 0, rounded: true });
  });
  it('floor division shares fairly and keeps the remainder', () => {
    expect(evalStep(14, 4, '÷', 'floor')).toEqual({ value: 3, remainder: 2, rounded: false });
    expect(evalStep(12, 4, '÷', 'floor')).toEqual({ value: 3, remainder: 0, rounded: false });
  });
  it('divide by zero is 0, never NaN', () => {
    expect(evalStep(5, 0, '÷').value).toBe(0);
  });
});

describe('PIZZA — multiply then divide, the situation is the answer key', () => {
  const P = pizzaProblem(makeRng(3), 1);
  it('the intended model orders exactly enough', () => {
    expect(validate(P, evaluateModel(P, P.intended)).verdict).toBe('good');
  });
  it('multiplying where you should divide buries the room (absurd)', () => {
    const buried: Model = { rows: [{ aId: 'guests', bId: 'slicesEach', op: '×' }, { bId: 'slicesPerPizza', op: '×' }] };
    expect(validate(P, evaluateModel(P, buried)).verdict).toBe('absurd');
  });
});

describe('FAIR SHARE — divide with a remainder', () => {
  // 14 cookies among 4 animals → 3 each, 2 left over.
  const P = withValues(fairShareProblem(makeRng(1), 1), { total: 14, sharers: 4 });
  const share: Model = { rows: [{ aId: 'total', bId: 'sharers', op: '÷' }] };
  it('dividing gives a fair share and names the leftover', () => {
    const ev = evaluateModel(P, share);
    expect(ev.result).toBe(3);
    expect(ev.remainder).toBe(2);
    const j = validate(P, ev);
    expect(j.verdict).toBe('good');
    expect(j.message).toContain('2 blir över');
  });
  it('multiplying gives more than exist — caught as absurd', () => {
    const bad: Model = { rows: [{ aId: 'total', bId: 'sharers', op: '×' }] };
    expect(validate(P, evaluateModel(P, bad)).verdict).toBe('absurd');
  });
  it('an even division reports nothing left over', () => {
    const Q = withValues(fairShareProblem(makeRng(1), 1), { total: 12, sharers: 4 });
    expect(validate(Q, evaluateModel(Q, share)).message).toContain('inget blir över');
  });
});

describe('BUDGET — add the costs, then compare to the budget', () => {
  // tårta 20 + ballonger 10 = 30, wallet 40 → 10 kr left.
  const P = withValues(budgetProblem(makeRng(1), 1), { costCake: 20, costBalloons: 10, budget: 40 });
  const plan: Model = { rows: [{ aId: 'costCake', bId: 'costBalloons', op: '+' }, { bId: 'budget', op: '−' }] };
  it('when the costs fit, the money is enough with change', () => {
    const j = validate(P, evaluateModel(P, plan));
    expect(j.verdict).toBe('good');
    expect(j.message).toContain('10 kr blir kvar');
  });
  it('when the wallet is too small, it does not suffice', () => {
    const Q = withValues(P, { budget: 25 });
    const j = validate(Q, evaluateModel(Q, plan));
    expect(j.verdict).toBe('few');
    expect(j.message).toContain('saknas 5 kr');
  });
  it('multiplying the costs is caught as absurd', () => {
    const bad: Model = { rows: [{ aId: 'costCake', bId: 'costBalloons', op: '×' }, { bId: 'budget', op: '−' }] };
    expect(validate(P, evaluateModel(P, bad)).verdict).toBe('absurd');
  });
});

describe('every scenario — the authored openness ladder holds, deterministic from the seed', () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: reproducible, and the intended model always makes sense in its own scene`, () => {
      expect(s.build(makeRng(42), 1)).toEqual(s.build(makeRng(42), 1));
      for (const lvl of [1, 2, 3] as Openness[]) {
        for (let n = 1; n < 60; n++) {
          const p = s.build(makeRng(n * 131 + lvl), lvl);
          expect(validate(p, evaluateModel(p, p.intended)).verdict).toBe('good');
          expect(Number.isFinite(sensibleResult(p))).toBe(true); // budget's sensible result is a signed "change"
        }
      }
    });
    it(`${s.id}: L1 has no distractor; L2 has exactly one; L3 gathers or assumes`, () => {
      const l1 = s.build(makeRng(7), 1);
      expect(quantities(l1).every((q) => q.relevant)).toBe(true);
      const l2 = s.build(makeRng(7), 2);
      expect(quantities(l2).filter((q) => !q.relevant)).toHaveLength(1);
      const l3 = s.build(makeRng(7), 3);
      expect(l3.gather != null || l3.assume != null).toBe(true);
    });
  }
});

describe('withValues / qval — baking in what the child gathered or assumed', () => {
  it('overrides a quantity value without mutating the original', () => {
    const p = pizzaProblem(makeRng(9), 3);
    const before = qval(p, 'guests');
    const q = withValues(p, { guests: 99 });
    expect(qval(q, 'guests')).toBe(99);
    expect(qval(p, 'guests')).toBe(before);
  });
  it('an assumed slices-each that differs from the default still validates against the scene', () => {
    // Child assumes 4 slices each → the sensible order rises accordingly; a model matching it makes sense.
    const p = withValues(pizzaProblem(makeRng(2), 3), { guests: 6, slicesEach: 4, slicesPerPizza: 8 });
    const plan: Model = { rows: [{ aId: 'guests', bId: 'slicesEach', op: '×' }, { bId: 'slicesPerPizza', op: '÷' }] };
    expect(validate(p, evaluateModel(p, plan)).verdict).toBe('good'); // 24 slices → 3 pizzas
  });
});
