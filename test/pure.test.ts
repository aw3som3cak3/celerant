import { describe, it, expect } from 'vitest';
import { grade } from '@/lib/grade';
import { predict, update, updateDecision, SEED_RD, SEED_VOL, RATING_PERIOD_MS, type EloState } from '@/model/elo';
import { selectItem, type SelState } from '@/lib/selector';
import { makeRng } from '@/lib/rng';
import { seedTheta, type Skill } from '@/skills';

const sigmoid = (t: number) => 1 / (1 + Math.exp(-t));
const fakeSkill = (year: number): Skill => ({ code: 'x', family: 'f', year, mode: 'component', requires: [], generate: () => ({ prompt: '', answer: { kind: 'int', v: 0 }, steps: [] }) });

describe('grader', () => {
  it('grades integers', () => {
    expect(grade('42', '42')).toBe(true);
    expect(grade(' 42 ', '42')).toBe(true);
    expect(grade('-3', '-3')).toBe(true);
    expect(grade('7', '8')).toBe(false);
    expect(grade('', '5')).toBe(false);
  });
  it('grades fractions by value in lowest terms', () => {
    expect(grade('1/2', '2/4')).toBe(true);
    expect(grade('2/4', '1/2')).toBe(true);
    expect(grade('4/4', '1')).toBe(true);
    expect(grade('1/3', '1/2')).toBe(false);
    expect(grade('5/0', '1')).toBe(false);
  });
});

describe('grading table (updateDecision, §5)', () => {
  it('right first try updates with 1.0', () => {
    expect(updateDecision(false, 1, 1)).toEqual({ apply: true, correct: 1, halveKChild: false });
  });
  it('right second try does not update', () => {
    expect(updateDecision(false, 2, 1)).toEqual({ apply: false, correct: 0, halveKChild: false });
  });
  it('wrong twice updates with 0.0', () => {
    expect(updateDecision(false, 2, 0)).toEqual({ apply: true, correct: 0, halveKChild: false });
  });
  it('"I don\'t know" updates with 0.0 and halved kChild', () => {
    expect(updateDecision(true, 1, 0)).toEqual({ apply: true, correct: 0, halveKChild: true });
  });
});

describe('predict (no beta)', () => {
  it('is 0.5 at theta 0 and monotonic', () => {
    expect(predict(0)).toBeCloseTo(0.5, 10);
    expect(predict(1)).toBeGreaterThan(0.5);
    expect(predict(-1)).toBeLessThan(0.5);
  });
});

// A skill's difficulty for a child is now simply their θ on it (there is no β).
const mkState = (over: Partial<SelState>): SelState => ({
  code: 'x',
  family: 'f',
  year: 1,
  mode: 'component',
  skillId: 0,
  theta: 0,
  lastSeenAt: null,
  requires: [],
  rate: { source: 'provisional', value: 1e9 },
  aim: 10,
  ...over,
});

const opts = { now: 1e12, previousCode: null, recentCodes: [] as string[], rand: () => 0.5 };

describe('missing-evidence gate (addendum §7)', () => {
  it('a provisional rate at aim satisfies the gate (compound unlocks)', () => {
    const states = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'provisional', value: 10 } }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(states, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(true);
  });

  it('an inaccurate prerequisite (theta < 0) does not unlock what follows', () => {
    const states = [
      mkState({ code: 'comp', skillId: 1, theta: -0.5, rate: { source: 'provisional', value: 10 } }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(states, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(false);
  });

  it('a provisional rate below aim does not satisfy the gate', () => {
    const states = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'provisional', value: 4 } }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(states, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(false);
  });

  it('throws when a prerequisite rate is unknown — placement did not run', () => {
    const states = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'unknown' } }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(() => selectItem(states, opts)).toThrow(/unknown rate/);
  });
});

describe('seed anchor (correction: previous year at target, not below it)', () => {
  it('an åk-4 child seeds last-year content nearest the 0.80 target', () => {
    // δ=1 (year 3) ≈ 0.80; δ=0 (year 4) ≈ 0.65; year-1 bonds are FURTHER from
    // target than year-3, so a competent child no longer opens on number bonds.
    expect(sigmoid(seedTheta(4, fakeSkill(3)))).toBeCloseTo(0.8, 1);
    expect(sigmoid(seedTheta(4, fakeSkill(4)))).toBeLessThan(0.72);
    const dYear3 = Math.abs(sigmoid(seedTheta(4, fakeSkill(3))) - 0.8);
    const dYear1 = Math.abs(sigmoid(seedTheta(4, fakeSkill(1))) - 0.8);
    expect(dYear3).toBeLessThan(dYear1);
  });
});

describe('peak-end (motivation §3.3)', () => {
  it('the last item is the highest-p eligible skill, over 1000 sessions', () => {
    const rng = makeRng(99);
    for (let t = 0; t < 1000; t++) {
      const states = [1, 2, 3, 4].map((i) =>
        mkState({ code: `s${i}`, skillId: i, theta: rng.next() * 4 - 2 }),
      );
      const { chosen } = selectItem(states, {
        now: 1e12,
        previousCode: null,
        recentCodes: [],
        rand: () => rng.next(),
        peakEnd: true,
      });
      const maxTheta = Math.max(...states.map((s) => s.theta));
      expect(chosen!.theta).toBe(maxTheta); // highest θ = highest p
    }
  });
});

describe('frontier introduction', () => {
  const mk = (): SelState[] => [
    mkState({ code: 'mastered', skillId: 1, theta: 3 }), // p ~ 0.95
    mkState({ code: 'frontier', skillId: 2, year: 8, mode: 'compound', theta: -1.5, rate: { source: 'unknown' } }),
  ];

  function countFrontier(introduce: { recentAccuracy: number } | undefined): number {
    const rng = makeRng(7);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const { chosen } = selectItem(mk(), {
        now: 1e12,
        previousCode: null,
        recentCodes: [],
        rand: () => rng.next(),
        introduce,
      });
      if (chosen?.code === 'frontier') n++;
    }
    return n;
  }

  it('the strict 0.80 selector never serves the neglected frontier', () => {
    expect(countFrontier(undefined)).toBe(0);
  });
  it('the introduction slot surfaces it when the child is coasting', () => {
    const n = countFrontier({ recentAccuracy: 1.0 });
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(120);
  });
  it('a struggling child is left alone (below the accuracy gate)', () => {
    expect(countFrontier({ recentAccuracy: 0.5 })).toBe(0);
  });
});

// Pure selection + θ-update loop over a set of skills whose true difficulty is
// carried by the child's true θ per skill (no β). Two phase-2 properties: no
// consecutive repeats, and ~80% realized success once calibrated.
function simulate(seed: number, trueThetas: number[], steps: number, calibrated = false) {
  const rng = makeRng(seed);
  const theta = trueThetas.map((t) => (calibrated ? t : 0));
  const rd = trueThetas.map(() => SEED_RD);
  const vol = trueThetas.map(() => SEED_VOL);
  const nObs = trueThetas.map(() => 0);
  const lastSeen: (number | null)[] = trueThetas.map(() => null);
  let now = 1_000_000_000_000;
  let previousCode: string | null = null;
  const recent: string[] = [];
  const picks: string[] = [];
  let correctAfter = 0;
  let countAfter = 0;
  const warmup = Math.floor(steps * 0.6);

  for (let t = 0; t < steps; t++) {
    const states: SelState[] = trueThetas.map((_, i) => ({
      code: `s${i}`,
      family: 'sim',
      year: 1,
      mode: 'component',
      skillId: i,
      theta: theta[i],
      lastSeenAt: lastSeen[i],
      requires: [],
      rate: { source: 'provisional', value: 1e9 },
      aim: null,
    }));
    const { chosen } = selectItem(states, { now, previousCode, recentCodes: recent, rand: () => rng.next() });
    const i = Number(chosen!.code.slice(1));

    const correct = rng.next() < sigmoid(trueThetas[i]) ? 1 : 0;
    if (!calibrated) {
      const idle = lastSeen[i] == null ? 0 : (now - (lastSeen[i] as number)) / RATING_PERIOD_MS;
      const u = update({ theta: theta[i], rd: rd[i], vol: vol[i], childObs: nObs[i] }, correct, false, idle);
      theta[i] = u.theta;
      rd[i] = u.rd;
      vol[i] = u.vol;
    }
    nObs[i]++;
    lastSeen[i] = now;
    now += 90_000;

    picks.push(chosen!.code);
    previousCode = chosen!.code;
    recent.unshift(chosen!.code);
    if (recent.length > 8) recent.pop();

    if (t >= warmup) {
      correctAfter += correct;
      countAfter++;
    }
  }

  let bestObs = -1;
  let bestErr = Infinity;
  for (let i = 0; i < trueThetas.length; i++) {
    if (nObs[i] > bestObs) {
      bestObs = nObs[i];
      bestErr = Math.abs(theta[i] - trueThetas[i]);
    }
  }
  return { picks, successRate: correctAfter / countAfter, convergenceErr: bestErr };
}

describe('phase-2 simulation (handoff §8.1)', () => {
  const thetas: number[] = [];
  for (let t = -2; t <= 4.0001; t += 0.2) thetas.push(Number(t.toFixed(1)));

  it('no two consecutive items share a skill code (1000 draws)', () => {
    const { picks } = simulate(12345, thetas, 1000);
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
  });

  it('calibrated population: mean first-try success in [0.75, 0.85]', () => {
    let sum = 0;
    const N = 500;
    for (let c = 0; c < N; c++) sum += simulate(1000 + c, thetas, 300, true).successRate;
    const mean = sum / N;
    expect(mean).toBeGreaterThanOrEqual(0.75);
    expect(mean).toBeLessThanOrEqual(0.85);
  });

  it('θ converges toward true ability from a cold start', () => {
    let conv = 0;
    const N = 300;
    for (let c = 0; c < N; c++) conv += simulate(2000 + c, thetas, 450).convergenceErr;
    expect(conv / N).toBeLessThan(0.6);
  });
});
