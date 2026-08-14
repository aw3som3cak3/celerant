import { describe, it, expect } from 'vitest';
import { makeRng } from '@/lib/rng';
import {
  evalStep,
  evaluateModel,
  validate,
  sensiblePizzas,
  quantities,
  pizzaProblem,
  type Model,
  type ModellingProblem,
} from '@/lib/modelling';

// The pizza intended model: guests × slicesEach, then ÷ slicesPerPizza.
const INTENDED: Model = { row1: { aId: 'guests', bId: 'slicesEach', op: '×' }, row2: { bId: 'slicesPerPizza', op: '÷' } };

// A fixed problem for arithmetic assertions: 8 guests, 2 slices each, 8 per pizza → 16 slices → 2.
const P: ModellingProblem = {
  scenario: 'pizza', openness: 1, title: '', gather: false, assume: false,
  guests: 8, slicesEach: 2, slicesPerPizza: 8, assumeRange: { min: 1, max: 4 },
  guestKind: 'turtle', intended: INTENDED,
};

describe('evalStep — the calculator does the arithmetic, division rounds UP (whole pizzas)', () => {
  it('the four operations', () => {
    expect(evalStep(8, 2, '×').value).toBe(16);
    expect(evalStep(16, 8, '÷').value).toBe(2);
    expect(evalStep(6, 2, '+').value).toBe(8);
    expect(evalStep(6, 2, '−').value).toBe(4);
  });
  it('division that does not divide evenly rounds up and flags it (cannot buy half a pizza)', () => {
    expect(evalStep(12, 8, '÷')).toEqual({ value: 2, rounded: true });
    expect(evalStep(16, 8, '÷')).toEqual({ value: 2, rounded: false });
  });
  it('divide by zero is 0, never NaN', () => {
    expect(evalStep(5, 0, '÷').value).toBe(0);
  });
});

describe('evaluateModel — chains the two rows into a final result', () => {
  it('the intended model orders exactly enough pizzas', () => {
    const e = evaluateModel(P, INTENDED);
    expect(e.row1.value).toBe(16);
    expect(e.result).toBe(2);
  });
  it('multiplying where you should divide buries the room (the 576-style absurdity)', () => {
    const buried: Model = { row1: { aId: 'guests', bId: 'slicesEach', op: '×' }, row2: { bId: 'slicesPerPizza', op: '×' } };
    expect(evaluateModel(P, buried).result).toBe(128);
  });
});

describe('validate — the SITUATION is the answer key, not a canonical number', () => {
  it('the sensible order makes sense', () => {
    expect(validate(P, 2).verdict).toBe('good');
    expect(sensiblePizzas(P)).toBe(2);
  });
  it('too few pizzas → empty plates', () => {
    expect(validate(P, 1).verdict).toBe('few');
    expect(validate(P, 0).verdict).toBe('few');
  });
  it('a wild over-order is caught as absurd', () => {
    expect(validate(P, 128).verdict).toBe('absurd');
  });
  it('a little over is "many", not absurd', () => {
    expect(validate(P, 3).verdict).toBe('many');
  });
  it('accepts an assumed slices-each that differs from the authored default (open grading)', () => {
    // The child assumed 3 slices each → 24 slices → 3 pizzas is sensible for THAT assumption.
    expect(validate(P, 3, 3).verdict).toBe('good');
    expect(validate(P, 1, 3).verdict).toBe('few');
  });
});

describe('pizzaProblem — authored openness ladder, deterministic from the seed', () => {
  it('is reproducible from a seed', () => {
    const a = pizzaProblem(makeRng(1234), 1);
    const b = pizzaProblem(makeRng(1234), 1);
    expect(a).toEqual(b);
  });
  it('L1 has no distractor and is not gathered/assumed', () => {
    const p = pizzaProblem(makeRng(7), 1);
    expect(p.distractor).toBeUndefined();
    expect(p.gather).toBe(false);
    expect(p.assume).toBe(false);
    expect(quantities(p)).toHaveLength(3);
  });
  it('L2 carries exactly one irrelevant quantity to ignore', () => {
    const p = pizzaProblem(makeRng(7), 2);
    expect(p.distractor?.relevant).toBe(false);
    expect(quantities(p).filter((q) => !q.relevant)).toHaveLength(1);
  });
  it('L3 gathers the guests and assumes the slices-each', () => {
    const p = pizzaProblem(makeRng(7), 3);
    expect(p.gather).toBe(true);
    expect(p.assume).toBe(true);
  });
  it('every authored problem has an intended model that makes sense in its own scene', () => {
    for (const lvl of [1, 2, 3] as const) {
      for (let s = 1; s < 60; s++) {
        const p = pizzaProblem(makeRng(s * 97 + lvl), lvl);
        const e = evaluateModel(p, p.intended);
        expect(validate(p, e.result).verdict).toBe('good');
      }
    }
  });
});
