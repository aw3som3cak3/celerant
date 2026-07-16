import { describe, it, expect } from 'vitest';
import { grade } from '@/lib/grade';
import { predict, update, updateDecision, SEED_RD, SEED_VOL, RATING_PERIOD_MS, type EloState } from '@/model/elo';
import { selectItem, type SelState } from '@/lib/selector';
import { makeRng } from '@/lib/rng';
import { seedTheta, type Skill } from '@/skills';
import { fluencyDisplay } from '@/lib/parent-fluency';
import { reachUpProbability } from '@/lib/onboarding';

const sigmoid = (t: number) => 1 / (1 + Math.exp(-t));
const fakeSkill = (year: number): Skill => ({ code: 'x', family: 'f', year, mode: 'component', requires: [], generate: () => ({ prompt: '', answer: { kind: 'int', v: 0 }, steps: [] }) });

describe('parent flyt column: seeded ≠ earned (bug-hunt-fluency.md §5)', () => {
  const aim = 17;
  it('an untouched skill (provisional/seeded rate) reports NO fluency number', () => {
    // the bug: a year-8 skill at seed shows "10/17 (preliminärt)". It must not.
    expect(fluencyDisplay({ mode: 'component', rate: 10, rateState: 'provisional', aim })).toEqual({ kind: 'notPractised' });
    expect(fluencyDisplay({ mode: 'component', rate: 17, rateState: 'provisional', aim })).toEqual({ kind: 'notPractised' });
  });
  it('a skill with zero sprints and an unknown rate reports no fluency', () => {
    expect(fluencyDisplay({ mode: 'component', rate: null, rateState: 'unknown', aim })).toEqual({ kind: 'notPractised' });
  });
  it('only a MEASURED sprint rate shows a fraction', () => {
    expect(fluencyDisplay({ mode: 'component', rate: 14, rateState: 'measured', aim })).toEqual({ kind: 'measured', rate: 14, aim });
  });
  it('a compound never shows a fluency number', () => {
    expect(fluencyDisplay({ mode: 'compound', rate: 12, rateState: 'measured', aim })).toEqual({ kind: 'na' });
  });
});

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

  // Option B (fluency-sprint-wiring): the unlock gate is monotonic-up under
  // measurement. A real sprint can CONFIRM fluency but must never revoke an unlock
  // the seed already granted — one slow-but-accurate sprint used to re-lock the
  // whole downstream chain, re-creating the fragile "accurate but slow" failure.
  it('a below-aim MEASURED rate never revokes a seed-granted unlock', () => {
    const states = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'measured', value: 4 }, seedFluent: true }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(states, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(true);
  });

  it('a measured rate the seed never granted stays locked below aim, and confirms above it', () => {
    const locked = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'measured', value: 4 }, seedFluent: false }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(locked, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(false);

    const confirmed = [
      mkState({ code: 'comp', skillId: 1, theta: 0.5, rate: { source: 'measured', value: 12 }, seedFluent: false }),
      mkState({ code: 'eqn', skillId: 2, mode: 'compound', theta: 0, requires: ['comp'] }),
    ];
    expect(selectItem(confirmed, opts).scores.find((s) => s.code === 'eqn')!.unlocked).toBe(true);
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

describe('the p-band gate (handoff §6 / fix — never serve an expected miss)', () => {
  const opts = (over: object = {}) => ({ now: 1e12, previousCode: null, recentCodes: [] as string[], rand: () => 0.5, target: 0.8, ...over });

  it('an above-band (too-hard) skill is never served, however overdue', () => {
    // toohard p≈0.45 (below the [0.60,1.00] band), never seen -> maximal decay
    const states = [mkState({ code: 'winnable', theta: 1.4 }), mkState({ code: 'toohard', theta: -0.2, lastSeenAt: null })];
    const rng = makeRng(3);
    let hard = 0;
    for (let i = 0; i < 500; i++) if (selectItem(states, opts({ rand: () => rng.next() })).chosen?.code === 'toohard') hard++;
    expect(hard).toBe(0); // spacing/decay can never breach the band
  });

  it('a newly-unlocked too-hard skill waits until θ brings it into band', () => {
    const rng = makeRng(5);
    const below = [mkState({ code: 'winnable', theta: 1.4 }), mkState({ code: 'newhard', theta: -1.5, lastSeenAt: null, mode: 'compound', rate: { source: 'unknown' } })];
    let n = 0;
    for (let i = 0; i < 500; i++) if (selectItem(below, opts({ rand: () => rng.next() })).chosen?.code === 'newhard') n++;
    expect(n).toBe(0);
    // once its θ implies an in-band p, it is served
    const inband = [mkState({ code: 'winnable', theta: 1.4 }), mkState({ code: 'newhard', theta: 1.0, lastSeenAt: null, mode: 'compound', rate: { source: 'unknown' } })];
    let m = 0;
    for (let i = 0; i < 500; i++) if (selectItem(inband, opts({ rand: () => rng.next() })).chosen?.code === 'newhard') m++;
    expect(m).toBeGreaterThan(0);
  });

  it('an in-band overdue skill wins on decay — spacing operates within the band', () => {
    const states = [mkState({ code: 'fresh', theta: 1.4, lastSeenAt: 1e12 }), mkState({ code: 'overdue', theta: 1.1, lastSeenAt: null })];
    expect(selectItem(states, opts()).chosen?.code).toBe('overdue'); // p≈0.75, in band, high decay
  });

  it('empty band falls back to the least-hard, never the least-bad too-hard', () => {
    const states = [mkState({ code: 'hard', theta: -0.85 }), mkState({ code: 'lesshard', theta: -0.4 })]; // both < 0.60
    expect(selectItem(states, opts()).chosen?.code).toBe('lesshard'); // err too-easy
  });

  it('peak-end serves the highest-p skill within the band', () => {
    const states = [mkState({ code: 'a', theta: 0.9 }), mkState({ code: 'b', theta: 1.6 }), mkState({ code: 'toohard', theta: -1 })];
    expect(selectItem(states, opts({ peakEnd: true })).chosen?.code).toBe('b');
  });

  it('a mis-seeded above-level skill is served at most twice, then the gate excludes it', () => {
    // truly cannot do it, but seeded in-band (θ=1.4, p≈0.80); a winnable p≈0.95 alongside
    const rng = makeRng(9);
    let st = { theta: 1.4, rd: SEED_RD, vol: SEED_VOL, childObs: 2 };
    let lastSeen: number | null = null;
    let served = 0;
    for (let i = 0; i < 30; i++) {
      const hard = mkState({ code: 'hard', theta: st.theta, lastSeenAt: lastSeen });
      const chosen = selectItem([mkState({ code: 'easy', theta: 3, lastSeenAt: 1e12 }), hard], opts({ rand: () => rng.next() })).chosen;
      if (chosen?.code === 'hard') {
        served++;
        lastSeen = 1e12 + i;
        const u = update(st, 0, false, 0); // he misses
        st = { theta: u.theta, rd: u.rd, vol: u.vol, childObs: st.childObs + 1 };
      }
    }
    expect(served).toBeLessThanOrEqual(2);
  });
});

describe('reach-up (fix-reach-up.md §3 — the upward mirror of the retreat)', () => {
  const opts = (over: object = {}) => ({ now: 1e12, previousCode: null, recentCodes: [] as string[], rand: () => 0.5, target: 0.8, ...over });

  it('a reach-up probe serves the CLOSEST above-band skill — the next rung, never a leap', () => {
    // band for target 0.80 is [0.60,1.00]. Two too-hard rungs sit below it: a
    // near one (p≈0.45) and a far one (p≈0.12). Reach-up must pick the near rung.
    const states = [
      mkState({ code: 'inband', theta: 1.4 }), // p≈0.80, in band
      mkState({ code: 'nextRung', theta: -0.2 }), // p≈0.45, just above band
      mkState({ code: 'farRung', theta: -2.0 }), // p≈0.12, a leap
    ];
    expect(selectItem(states, opts({ reachUp: true })).chosen?.code).toBe('nextRung');
  });

  it('without the reach-up flag the same too-hard skill is never served (the gate holds)', () => {
    const states = [mkState({ code: 'inband', theta: 1.4 }), mkState({ code: 'nextRung', theta: -0.2, lastSeenAt: null })];
    const rng = makeRng(7);
    let n = 0;
    for (let i = 0; i < 500; i++) if (selectItem(states, opts({ rand: () => rng.next() })).chosen?.code === 'nextRung') n++;
    expect(n).toBe(0); // reach-up is opt-in per item; the default is still gated
  });

  it('at his ceiling (nothing above band) reach-up falls through to normal in-band selection', () => {
    const states = [mkState({ code: 'a', theta: 1.4, lastSeenAt: 1e12 }), mkState({ code: 'b', theta: 1.6, lastSeenAt: null })];
    const chosen = selectItem(states, opts({ reachUp: true })).chosen;
    expect(['a', 'b']).toContain(chosen?.code); // an in-band skill, never null, never a too-hard leap
  });
});

describe('reach-up firmness scales with under-challenge (reachUpProbability)', () => {
  const V = 0.06; // steady
  it('fires 0 for a struggling kid at any trivial share', () => {
    expect(reachUpProbability(0.5, V, 0.9, false)).toBe(0); // low accuracy
    expect(reachUpProbability(0.95, 0.2, 0.9, false)).toBe(0); // erratic (high volatility)
    expect(reachUpProbability(0.95, V, 0.3, false)).toBe(0); // not under-challenged
  });

  it('goes quiet only when genuinely struggling (two misses), not on a stray flub', () => {
    expect(reachUpProbability(0.95, V, 0.62, true)).toBe(0); // recentlyStruggling (two in a row) -> patient
    expect(reachUpProbability(0.95, V, 0.62, false)).toBeGreaterThan(0); // a single flub no longer pauses it
  });

  it('scales: a 60%-trivial kid is probed firmer than a 45%-trivial kid', () => {
    expect(reachUpProbability(0.95, V, 0.6, false)).toBeGreaterThan(reachUpProbability(0.95, V, 0.45, false));
  });

  it('is capped so it never becomes a wall', () => {
    expect(reachUpProbability(1.0, V, 1.0, false)).toBeLessThanOrEqual(0.8);
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

// A session-length loop that mirrors the /api/next reach-up wiring: each item it
// computes recent accuracy + trivial share from the child's OWN recent history and
// fires reach-up per reachUpProbability. Returns the served-item p distribution so
// we can assert the trivial glut shrinks (coasting) and the band is never breached
// (struggling). `seedThetas` is where the child starts; `trueThetas` his real
// ability — reach-up climbs the gap.
function simulateReachUp(seed: number, seedThetas: number[], trueThetas: number[], steps: number, enableReachUp: boolean) {
  const rng = makeRng(seed);
  const theta = seedThetas.slice();
  const rd = seedThetas.map(() => SEED_RD);
  const vol = seedThetas.map(() => SEED_VOL);
  const nObs = seedThetas.map(() => 0);
  const lastSeen: (number | null)[] = seedThetas.map(() => null);
  let now = 1_000_000_000_000;
  let previousCode: string | null = null;
  const recent: string[] = [];
  const outcomes: number[] = []; // newest last
  const servedP: number[] = []; // newest last
  const target = 0.8;
  let belowBand = 0;

  for (let t = 0; t < steps; t++) {
    const recentAcc = outcomes.length ? outcomes.slice(-12).reduce((a, b) => a + b, 0) / Math.min(outcomes.length, 12) : 1;
    const trivialProp = servedP.length ? servedP.slice(-12).filter((p) => p >= 0.85).length / Math.min(servedP.length, 12) : 0;
    const recentlyStruggling = outcomes.length >= 2 && outcomes[outcomes.length - 1] === 0 && outcomes[outcomes.length - 2] === 0;
    const prob = enableReachUp ? reachUpProbability(recentAcc, 0.06, trivialProp, recentlyStruggling) : 0;
    const reachUp = rng.next() < prob;

    const states: SelState[] = seedThetas.map((_, i) => ({
      code: `s${i}`, family: 'sim', year: 1, mode: 'component', skillId: i,
      theta: theta[i], lastSeenAt: lastSeen[i], requires: [], rate: { source: 'provisional', value: 1e9 }, aim: null,
    }));
    const { chosen } = selectItem(states, { now, previousCode, recentCodes: recent, rand: () => rng.next(), reachUp });
    const i = Number(chosen!.code.slice(1));
    const p = predict(theta[i]);
    servedP.push(p);
    if (p < target - 0.2) belowBand++;

    const correct = rng.next() < sigmoid(trueThetas[i]) ? 1 : 0;
    outcomes.push(correct);
    const idle = lastSeen[i] == null ? 0 : (now - (lastSeen[i] as number)) / RATING_PERIOD_MS;
    const u = update({ theta: theta[i], rd: rd[i], vol: vol[i], childObs: nObs[i] }, correct, false, idle);
    theta[i] = u.theta; rd[i] = u.rd; vol[i] = u.vol; nObs[i]++;
    lastSeen[i] = now; now += 90_000;
    previousCode = chosen!.code;
    recent.unshift(chosen!.code);
    if (recent.length > 8) recent.pop();
  }

  const half = servedP.slice(Math.floor(steps / 2));
  const trivialShare = half.filter((p) => p >= 0.85).length / half.length;
  const edgeShare = half.filter((p) => p >= 0.7 && p < 0.85).length / half.length;
  return { trivialShare, edgeShare, belowBand };
}

describe('reach-up acceptance (fix-reach-up.md §5)', () => {
  // 6 genuinely-mastered skills (trivial) + 6 at the child's real edge but seeded
  // below the band, so without an upward mechanism they can never be served.
  const seedThetas = [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, -0.2, -0.2, -0.2, -0.2, -0.2, -0.2];
  const trueThetas = [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4];

  it('a coasting kid is pulled to his edge: trivial share drops, edge share rises', () => {
    const off = simulateReachUp(11, seedThetas, trueThetas, 120, false);
    const on = simulateReachUp(11, seedThetas, trueThetas, 120, true);
    expect(off.trivialShare).toBeGreaterThan(0.9); // stuck grinding trivial wins
    expect(on.trivialShare).toBeLessThan(off.trivialShare - 0.25); // substantially less trivial
    expect(on.edgeShare).toBeGreaterThan(off.edgeShare); // more time at his real edge
  });

  it('reach-up changes NOTHING for a struggling kid — it never fires for him', () => {
    // low true ability everywhere: recentAcc stays low -> reachUpProbability is 0
    // at every scaling, so switching reach-up on is indistinguishable from off.
    // (Below-band serves that do occur are the gate's own empty-band fallback when
    // his θ has collapsed below the band on everything — not a reach-up breach.)
    const lowTrue = seedThetas.map(() => -1.5);
    const seedLow = seedThetas.map(() => 1.2); // seeded in-band; he just keeps missing
    const off = simulateReachUp(21, seedLow, lowTrue, 120, false);
    const on = simulateReachUp(21, seedLow, lowTrue, 120, true);
    expect(on.belowBand).toBe(off.belowBand); // reach-up is inert for the non-coasting
  });
});

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
