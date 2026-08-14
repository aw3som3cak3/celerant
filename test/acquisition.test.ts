import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-acq-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { replay } from '@/db/replay';
import { buildStates, issueNext, sessionAnswer } from '@/lib/practice';
import { acquisitionPlans, ignites, settleAcquisitionOnAnswer, stalledAcquisitions } from '@/lib/acquisition';
import {
  ADDITIVE_DERIVATIONS,
  DERIVATIONS,
  DERIVATIONS_BY_CODE,
  GRADUATED,
  L_BARE,
  L_CUED,
  L_FULL,
  L_PARTIAL,
  applyOutcome,
  buildScaffold,
  foldFade,
  hasDerivation,
  hintFor,
  pickDerivation,
  buildWordScaffold,
  type StrategyId,
} from '@/lib/acquisition-content';
import { T3_PAIRS } from '@/lib/spelling-content';
import { selectItem, type SelState } from '@/lib/selector';
import { buildItem } from '@/lib/item';

const NOW = Date.UTC(2026, 7, 13);
const AK4 = 4; // sushi's årskurs

// ── fixtures ───────────────────────────────────────────────────────────────

// A clean first-try success on a skill (an ORDINARY attempt).
function hit(pid: string, code: string, at: number) {
  repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: '1', correct: 1, tries: 1, dontKnow: false, latencyMs: 1500, at });
}
// A miss (first-try wrong) on a skill.
function miss(pid: string, code: string, at: number) {
  repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: '0', correct: 0, tries: 1, dontKnow: false, latencyMs: 4000, at });
}
// A considered "vet inte".
function idk(pid: string, code: string, at: number) {
  repo.appendAttempt({ playerId: pid, skillCode: code, itemJson: '{}', given: null, correct: 0, tries: 0, dontKnow: true, latencyMs: 8000, at });
}

// SUSHI, the acceptance case (spec §7): åk4, fluent on ×2/×5/×10 (seed-fluent at her grade),
// 0/4 on mult_table_6 and 3/7 on mult_table_8 — she can DERIVE them, she was never taught them.
function sushi(familyId: string): string {
  const pid = repo.createPlayer(familyId, 'sushi', AK4, NOW);
  // Past onboarding (4 completed sessions), so no warm-up ramp is in play — sushi is a child
  // who has been practising for months, and the ramp owns only the opening of a NEW child's
  // session (acquisition deliberately stands aside while it runs).
  for (let i = 0; i < 5; i++) {
    getDb()
      .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
      .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
  }
  let t = NOW + 1000;
  for (let i = 0; i < 4; i++) idk(pid, 'mult_table_6', (t += 1000)); // 0/4, all "vet inte"
  for (let i = 0; i < 3; i++) hit(pid, 'mult_table_8', (t += 1000));
  for (let i = 0; i < 4; i++) miss(pid, 'mult_table_8', (t += 1000)); // 3/7, the last four wrong
  return pid;
}

const plansFor = (pid: string) => acquisitionPlans(pid, buildStates(pid, AK4, 'maths'));

describe('scaffolded acquisition — the derivation content', () => {
  it('every derivation reproduces the canonical product, for every table and multiplier', () => {
    for (const d of DERIVATIONS) {
      for (let b = 2; b <= 12; b++) {
        const steps = d.substeps(b);
        expect(steps.length).toBeGreaterThanOrEqual(2);
        // The LAST sub-step's answer is the target product — the child builds it herself.
        expect(steps[steps.length - 1].answer).toBe(String(d.table * b));
        // Every step is a real, self-contained prompt ending in '='.
        for (const s of steps) expect(s.prompt.endsWith('=')).toBe(true);
        // The L1 partial states the fact and leaves exactly one operation.
        expect(d.partial(b).startsWith(`${d.table} × ${b} =`)).toBe(true);
      }
    }
  });

  it('covers the first slice (×3 ×4 ×6 ×7 ×8) and reaches ×9/×11/×12', () => {
    for (const t of [3, 4, 6, 7, 8, 9, 11, 12]) expect(DERIVATIONS_BY_CODE.has(`mult_table_${t}`)).toBe(true);
    // Never a derivation for the tables the strategies are BUILT from.
    for (const t of [2, 5, 10]) expect(DERIVATIONS_BY_CODE.has(`mult_table_${t}`)).toBe(false);
  });

  it('picks the SHALLOWEST fluent path, and vetoes when an input is missing (invariant 3)', () => {
    const all = () => true;
    expect(pickDerivation('mult_table_8', all)?.id).toBe('x4_double'); // 2 steps, needs ×4
    // ×4 not fluent → fall back to double-double from ×2 (3 steps), never nothing.
    const noFour = (c: string) => c !== 'mult_table_4';
    expect(pickDerivation('mult_table_8', noFour)?.id).toBe('x2_double_double');
    // Neither ×4 nor ×2 → NO scaffold at all: the graph must drop her lower instead.
    const noMult = (c: string) => !c.startsWith('mult_');
    expect(pickDerivation('mult_table_8', noMult)).toBeNull();
    // The addition the last step needs counts as an input too.
    const noAdd = (c: string) => c !== 'add_2d_carry';
    expect(pickDerivation('mult_table_6', noAdd)).toBeNull();
  });

  it('buildScaffold decomposes the ACTUAL item and never changes its answer', () => {
    for (let seed = 1; seed < 40; seed++) {
      const item = buildItem('mult_table_6', seed);
      const sc = buildScaffold('mult_table_6', seed, 'x5_plus_one')!;
      expect(sc.answer).toBe(item.answer); // grading is completely unchanged
      expect(sc.target).toBe(item.prompt);
      expect(sc.substeps[0].prompt).toBe(`5 × ${sc.b} =`);
      expect(sc.substeps[1].answer).toBe(item.answer);
      expect(sc.partial).toBe(`6 × ${sc.b} = ${5 * sc.b} + ${sc.b} =`);
    }
  });
});

describe('scaffolded acquisition — the fade schedule', () => {
  it('advances on two clean, drops one level on a miss, never below L0', () => {
    let s = applyOutcome(null, L_FULL, true);
    expect(s).toMatchObject({ level: L_FULL, clean: 1 });
    s = applyOutcome(s, L_FULL, true);
    expect(s.level).toBe(L_PARTIAL); // two clean at L0 → thin the scaffold
    s = applyOutcome(s, L_PARTIAL, false);
    expect(s.level).toBe(L_FULL); // a miss SOFTENS it
    s = applyOutcome(s, L_FULL, false);
    expect(s.level).toBe(L_FULL); // never below the fullest
    expect(s.l0Misses).toBe(1);
  });

  it('climbs L0 → L1 → L2 → L3 → GRADUATED on eight clean answers, and only then', () => {
    let s = null as ReturnType<typeof applyOutcome> | null;
    const levels: number[] = [];
    for (let i = 0; i < 8; i++) {
      levels.push(s?.level ?? L_FULL);
      s = applyOutcome(s, s?.level ?? L_FULL, true);
    }
    expect(levels).toEqual([L_FULL, L_FULL, L_PARTIAL, L_PARTIAL, L_CUED, L_CUED, L_BARE, L_BARE]);
    expect(s!.level).toBe(GRADUATED);
    // Graduation is monotonic — nothing re-opens it.
    expect(applyOutcome(s, L_BARE, false).level).toBe(GRADUATED);
  });

  it('a single clean answer never advances (a lucky one is not encoding)', () => {
    const s = applyOutcome(applyOutcome(null, L_FULL, true), L_FULL, false);
    expect(s.level).toBe(L_FULL);
    expect(s.clean).toBe(0);
  });

  it('the fold reproduces the same state as the step-by-step live path', () => {
    const rows = [
      { acqLevel: L_FULL, ok: true }, { acqLevel: L_FULL, ok: true },
      { acqLevel: L_PARTIAL, ok: false },
      { acqLevel: L_FULL, ok: true }, { acqLevel: L_FULL, ok: true },
      { acqLevel: L_PARTIAL, ok: true }, { acqLevel: L_PARTIAL, ok: true },
    ];
    let live = null as ReturnType<typeof applyOutcome> | null;
    for (const r of rows) live = applyOutcome(live, r.acqLevel, r.ok);
    expect(foldFade(rows)).toEqual(live);
    expect(foldFade(rows)!.level).toBe(L_CUED);
  });
});

describe('scaffolded acquisition — the trigger (spec §2)', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  it('the ignition test: unlearned yes, careless slip no', () => {
    expect(ignites([])).toBe(false); // never met the fact
    expect(ignites([false])).toBe(true); // first miss on a fact never produced → ignite
    expect(ignites([false, false, false, false])).toBe(true);
    expect(ignites([true, false, false])).toBe(false); // she just got it right
    expect(ignites([false, true, true, true, true])).toBe(false); // ONE slip on a fact she owns
    expect(ignites([false, false, true, true, true])).toBe(true); // two of the last four → real
  });

  it('SUSHI: the ×6 and ×8 gaps ignite, the tables she is fluent on do not', () => {
    const pid = sushi(fam);
    const plans = plansFor(pid);
    expect(plans.get('mult_table_6')).toMatchObject({ level: L_FULL, strategy: 'x5_plus_one' });
    expect(plans.get('mult_table_8')).toMatchObject({ level: L_FULL, strategy: 'x4_double' });
    // Nothing she has not failed is scaffolded — acquisition is not a blanket mode.
    expect(plans.has('mult_table_3')).toBe(false);
    expect(plans.has('mult_table_7')).toBe(false);
    expect(plans.has('mult_table_2')).toBe(false); // no derivation at all
  });

  it('does NOT fire when a derivation input is not fluent — the graph drops lower instead', () => {
    const pid = sushi(fam);
    const states = buildStates(pid, AK4, 'maths').map((s) =>
      // knock ×5 and ×2 out of fluency: nothing can derive ×6 any more
      s.code === 'mult_table_5' || s.code === 'mult_table_2'
        ? ({ ...s, seedFluent: false, earnedFluent: false, rate: { source: 'measured', value: 0.1 } } as SelState)
        : s,
    );
    expect(acquisitionPlans(pid, states).has('mult_table_6')).toBe(false);
  });

  it('stops firing once graduated, and never re-ignites', () => {
    const pid = sushi(fam);
    repo.startAcquisition(pid, 'mult_table_6', 'x5_plus_one', NOW);
    // Graduate it by hand, then fail the bare fact repeatedly.
    getDb().prepare('UPDATE acquisition_state SET fade_level = ? WHERE player_id = ? AND skill_code = ?').run(GRADUATED, pid, 'mult_table_6');
    for (let i = 0; i < 4; i++) miss(pid, 'mult_table_6', NOW + 500_000 + i * 1000);
    expect(plansFor(pid).has('mult_table_6')).toBe(false);
    expect(repo.acquisitionLevel(pid, 'mult_table_6')).toBeNull();
  });
});

describe('scaffolded acquisition — eligibility (the one selector touch)', () => {
  const base = (code: string, theta: number): SelState => ({
    code, family: 'multiplication', year: 3, mode: 'component', skillId: 0, theta,
    lastSeenAt: null, requires: [], rate: { source: 'provisional', value: 10 }, aim: 5, seedFluent: true,
  });

  it('a below-band ready-but-unlearned skill stays selectable — and is skipped without the touch', () => {
    const states = [base('mult_table_6', -2), base('add_within_10', 1.4)]; // ×6 is far below the band
    const opts = { now: NOW, previousCode: null, recentCodes: [], rand: () => 0.5 };
    // WITHOUT the touch: the selector routes around the fact she cannot do — today's behaviour.
    expect(selectItem(states, opts).chosen?.code).toBe('add_within_10');
    // WITH it: the scaffold is what will actually be served, so it competes at the target.
    const withAcq = selectItem(states, { ...opts, acquisitionCodes: new Set(['mult_table_6']) });
    expect(withAcq.chosen?.code).toBe('mult_table_6');
    expect(withAcq.scores.find((s) => s.code === 'mult_table_6')?.acquisition).toBe(true);
  });

  it('an empty/absent acquisition set leaves selection byte-identical', () => {
    const states = [base('mult_table_6', -2), base('add_within_10', 1.4), base('mult_table_2', 1.2)];
    const opts = { now: NOW, previousCode: null, recentCodes: [], rand: () => 0.25 };
    const a = selectItem(states, opts);
    const b = selectItem(states, { ...opts, acquisitionCodes: new Set<string>() });
    expect(b.chosen?.code).toBe(a.chosen?.code);
    expect(b.scores.map((s) => s.score)).toEqual(a.scores.map((s) => s.score));
  });

  it('still respects previousCode and interleaving — a scaffold is never hammered back-to-back', () => {
    const states = [base('mult_table_6', -2), base('add_within_10', 1.4)];
    const acquisitionCodes = new Set(['mult_table_6']);
    const r = selectItem(states, { now: NOW, previousCode: 'mult_table_6', recentCodes: ['mult_table_6'], rand: () => 0.5, acquisitionCodes });
    expect(r.chosen?.code).toBe('add_within_10');
  });

  it('the unlock gate is untouched: a LOCKED acquisition skill is still never served', () => {
    const locked: SelState = { ...base('mult_table_6', -2), requires: ['mult_table_2'] };
    const blocker: SelState = { ...base('mult_table_2', -3), seedFluent: false, rate: { source: 'measured', value: 0.1 }, aim: 5 };
    const r = selectItem([locked, blocker, base('add_within_10', 1.4)], {
      now: NOW, previousCode: null, recentCodes: [], rand: () => 0.5, acquisitionCodes: new Set(['mult_table_6']),
    });
    expect(r.chosen?.code).not.toBe('mult_table_6');
  });
});

describe('scaffolded acquisition — end to end on the real engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  const player = (pid: string) => ({ id: pid, school_year: AK4, stretch: 0 });

  // Answer the CURRENT item as issued, correctly or not, and return the next issued item.
  function answerWith(pid: string, sid: number, item: { code: string; seed: number }, correct: boolean, at: number, tries = 1) {
    const truth = buildItem(item.code, item.seed).answer;
    return sessionAnswer(
      player(pid), sid, item.code, item.seed,
      correct ? truth : 'wrong', false, tries, false, 2000,
      `idem-${item.code}-${at}-${Math.random()}`, null, at,
    );
  }

  it('sushi is SERVED the scaffold instead of being routed around', () => {
    const pid = sushi(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    let at = NOW + 100_000;
    const served: string[] = [];
    let item = issueNext(pid, AK4, at, { sessionId: sid, remaining: 10 });
    for (let i = 0; i < 12; i++) {
      served.push(item.acq ? `${item.code}@L${item.acq.level}` : item.code);
      at += 5000;
      const r = answerWith(pid, sid, item, true, at);
      if (r.status === 'retry' || !r.next) break;
      item = r.next;
    }
    // Both gaps are taught, at the fullest scaffold first.
    expect(served.some((s) => s === 'mult_table_6@L0')).toBe(true);
    expect(served.some((s) => s === 'mult_table_8@L0')).toBe(true);
  });

  it('a scaffolded attempt is warmup-class: weak-UP θ, no θ damage on a miss, NEVER a rate', () => {
    const pid = sushi(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const before = repo.abilities(pid).get('mult_table_6')!.theta;

    // Force a ×6 scaffold and answer it correctly.
    const item = { code: 'mult_table_6', seed: 12345 };
    repo.startAcquisition(pid, 'mult_table_6', 'x5_plus_one', NOW);
    let at = NOW + 200_000;
    answerWith(pid, sid, item, true, at);

    const rows = getDb().prepare('SELECT warmup, acq_level, latency_ms FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid, 'mult_table_6') as { warmup: number; acq_level: number; latency_ms: number };
    expect(rows.acq_level).toBe(L_FULL);
    expect(rows.warmup).toBe(1); // the flag every rate/aim/sprint query filters on

    const afterWin = repo.abilities(pid).get('mult_table_6')!.theta;
    expect(afterWin).toBeGreaterThan(before); // a scaffold she WINS pulls θ up — it stays in band

    // ...and a scaffold she misses does not dent it.
    at += 5000;
    answerWith(pid, sid, { code: 'mult_table_6', seed: 999 }, false, at, 2);
    expect(repo.abilities(pid).get('mult_table_6')!.theta).toBe(afterWin);

    // THE FLUENCY NUMBER STAYS HONEST: no scaffolded latency reaches the rate path.
    expect(repo.cleanPracticeRate(pid, 'mult_table_6')).toBeNull();
    expect(repo.abilities(pid).get('mult_table_6')!.rate_state).not.toBe('measured');
  });

  it('graduates off the bare rung and hands the skill back to the ordinary machinery', () => {
    const pid = sushi(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    repo.startAcquisition(pid, 'mult_table_6', 'x5_plus_one', NOW);
    let at = NOW + 300_000;
    // Eight clean answers walk L0 → L1 → L2 → L3 → graduation.
    for (let i = 0; i < 8; i++) {
      const level = repo.acquisitionLevel(pid, 'mult_table_6');
      expect(level).not.toBeNull();
      at += 5000;
      answerWith(pid, sid, { code: 'mult_table_6', seed: 1000 + i }, true, at);
    }
    expect(repo.acquisitionLevel(pid, 'mult_table_6')).toBeNull(); // graduated
    expect(plansFor(pid).has('mult_table_6')).toBe(false); // acquisition stops firing

    // The BARE (L3) attempts were ordinary — honest timing, eligible for the fluency path.
    const bare = getDb().prepare('SELECT warmup FROM attempt WHERE player_id = ? AND skill_code = ? AND acq_level = ?').all(pid, 'mult_table_6', L_BARE) as { warmup: number }[];
    expect(bare.length).toBe(2);
    for (const r of bare) expect(r.warmup).toBe(0);
  });

  it('replay refolds acquisition_state from the ledger (the cache is derived, not authoritative)', () => {
    const pid = sushi(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    repo.startAcquisition(pid, 'mult_table_6', 'x5_plus_one', NOW);
    let at = NOW + 400_000;
    for (let i = 0; i < 3; i++) {
      at += 5000;
      answerWith(pid, sid, { code: 'mult_table_6', seed: 2000 + i }, true, at);
    }
    const live = repo.acquisitionStates(pid).get('mult_table_6')!;
    expect(live.fade_level).toBe(L_PARTIAL);
    replay(pid);
    const rebuilt = repo.acquisitionStates(pid).get('mult_table_6')!;
    expect(rebuilt.fade_level).toBe(live.fade_level);
    expect(rebuilt.clean).toBe(live.clean);
    expect(rebuilt.strategy).toBe('x5_plus_one');
  });

  it('the grownup-alert seam: repeated L0 misses mark the skill stalled (nothing else changes)', () => {
    const pid = sushi(fam);
    repo.startAcquisition(pid, 'mult_table_6', 'x5_plus_one', NOW);
    expect(stalledAcquisitions(pid)).toEqual([]);
    for (let i = 0; i < 3; i++) settleAcquisitionOnAnswer(pid, 'mult_table_6', L_FULL, false, 1, false, NOW + i);
    expect(stalledAcquisitions(pid)).toEqual([{ skillCode: 'mult_table_6', strategy: 'x5_plus_one' }]);
    expect(repo.acquisitionLevel(pid, 'mult_table_6')).toBe(L_FULL); // still taught, never punished
  });
});

// ── SECOND DOMAIN · bridging-through-10 addition/subtraction ─────────────────────────────────
// The same faded-scaffold engine on a NEW seam: crossing ten by making ten. These tests prove
// only the new content + trigger + rendering; the fade schedule / θ rule / ledger flag / selector
// touch are domain-agnostic (proven above) and were not rebuilt for this slice.

const AK2 = 2; // seedGradeFor(2) = 1, so every year-1 input (add_within_10, missing_addend_10,
// sub_within_10) seeds FLUENT — a child who owns her within-ten facts but not the bridge.

describe('bridging-through-10 — the derivation content', () => {
  it('registers a derivation for the two cross-ten seams and nothing else additive', () => {
    expect(ADDITIVE_DERIVATIONS.map((d) => d.code).sort()).toEqual(['add_cross_10', 'sub_cross_10']);
    expect(hasDerivation('add_cross_10')).toBe(true);
    expect(hasDerivation('sub_cross_10')).toBe(true);
    // The no-bridge seams (within ten) are NOT trained — nothing to make-ten there.
    expect(hasDerivation('add_within_10')).toBe(false);
    expect(hasDerivation('sub_within_10')).toBe(false);
  });

  it('addition make-ten decomposes the ACTUAL item, always lands on 10, never changes the answer', () => {
    for (let seed = 1; seed < 60; seed++) {
      const item = buildItem('add_cross_10', seed);
      const sc = buildScaffold('add_cross_10', seed, 'make_ten_add')!;
      expect(sc.target).toBe(item.prompt);
      expect(sc.answer).toBe(item.answer); // grading is completely unchanged
      expect(sc.substeps).toHaveLength(2);
      expect(sc.substeps[0].answer).toBe('10'); // the make-ten step
      expect(sc.substeps[0].prompt.endsWith('=')).toBe(true);
      expect(sc.substeps[1].answer).toBe(item.answer); // she builds the target herself
      expect(sc.partial.startsWith(item.prompt.replace(/\s*=$/, ''))).toBe(true);
      expect(sc.partial.includes('10 +')).toBe(true);
    }
  });

  it('subtraction make-ten decomposes down to ten and back, answer unchanged', () => {
    for (let seed = 1; seed < 60; seed++) {
      const item = buildItem('sub_cross_10', seed);
      const sc = buildScaffold('sub_cross_10', seed, 'make_ten_sub')!;
      expect(sc.target).toBe(item.prompt);
      expect(sc.answer).toBe(item.answer);
      expect(sc.substeps).toHaveLength(2);
      expect(sc.substeps[0].answer).toBe('10'); // subtract down to ten first
      expect(sc.substeps[1].answer).toBe(item.answer);
      // Every sub-step is a real single-digit subtraction the child owns (10 − rem, rem ≥ 1).
      const rem = Number(sc.substeps[1].prompt.match(/10 − (\d+)/)![1]);
      expect(rem).toBeGreaterThanOrEqual(1);
      expect(rem).toBeLessThanOrEqual(9);
    }
  });

  it('a hint exists for both bridging strategies, in both locales, and never spoils the answer', () => {
    for (const strat of ['make_ten_add', 'make_ten_sub'] as const) {
      for (const loc of ['sv', 'en']) {
        const h = hintFor(strat, 8, loc);
        expect(typeof h).toBe('string');
        expect(h.length).toBeGreaterThan(0);
        expect(h).toContain('10'); // names the make-ten, the strategy she is walking
      }
    }
  });

  it('picks the make-ten strategy, and vetoes when a within-ten input is missing (invariant 3)', () => {
    const all = () => true;
    expect(pickDerivation('add_cross_10', all)?.id).toBe('make_ten_add');
    expect(pickDerivation('sub_cross_10', all)?.id).toBe('make_ten_sub');
    // Bond-to-ten not fluent → no scaffold: the graph must drop lower and teach the bond.
    const noBond = (c: string) => c !== 'missing_addend_10';
    expect(pickDerivation('add_cross_10', noBond)).toBeNull();
    expect(pickDerivation('sub_cross_10', noBond)).toBeNull();
    // The single-digit op the recombination needs counts as an input too.
    expect(pickDerivation('add_cross_10', (c) => c !== 'add_within_10')).toBeNull();
    expect(pickDerivation('sub_cross_10', (c) => c !== 'sub_within_10')).toBeNull();
  });
});

describe('bridging-through-10 — the trigger and the engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  // A child who owns her within-ten facts (year-1, seed-fluent at åk2) but keeps failing the
  // cross-ten bridge — exactly who make-ten is for. No attempts on the inputs, so they stay steady.
  function bridger(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'bridger', AK2, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'add_cross_10', (t += 1000)); // 0/4 — unlearned bridge
    for (let i = 0; i < 4; i++) idk(pid, 'sub_cross_10', (t += 1000)); // 0/4, all "vet inte"
    return pid;
  }

  it('both cross-ten gaps ignite with the make-ten strategy; the within-ten facts do not', () => {
    const pid = bridger(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK2, 'maths'));
    expect(plans.get('add_cross_10')).toMatchObject({ level: L_FULL, strategy: 'make_ten_add' });
    expect(plans.get('sub_cross_10')).toMatchObject({ level: L_FULL, strategy: 'make_ten_sub' });
    expect(plans.has('add_within_10')).toBe(false); // no derivation — nothing to bridge
    expect(plans.has('missing_addend_10')).toBe(false);
  });

  it('does NOT fire when the bond-to-ten input is not fluent — the graph drops lower', () => {
    const pid = bridger(fam);
    const states = buildStates(pid, AK2, 'maths').map((s) =>
      s.code === 'missing_addend_10'
        ? ({ ...s, seedFluent: false, earnedFluent: false, rate: { source: 'measured', value: 0.1 } } as SelState)
        : s,
    );
    expect(acquisitionPlans(pid, states).has('add_cross_10')).toBe(false);
    expect(acquisitionPlans(pid, states).has('sub_cross_10')).toBe(false);
  });

  it('is SERVED the make-ten scaffold instead of being routed around', () => {
    const pid = bridger(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK2, stretch: 0 };
    let at = NOW + 100_000;
    const served: string[] = [];
    let item = issueNext(pid, AK2, at, { sessionId: sid, remaining: 10 });
    for (let i = 0; i < 14; i++) {
      served.push(item.acq ? `${item.code}@L${item.acq.level}` : item.code);
      at += 5000;
      const r = sessionAnswer(player, sid, item.code, item.seed, buildItem(item.code, item.seed).answer, false, 1, false, 2000, `idem-${item.code}-${at}-${Math.random()}`, null, at);
      if (r.status === 'retry' || !r.next) break;
      item = r.next;
    }
    expect(served.some((s) => s === 'add_cross_10@L0' || s === 'sub_cross_10@L0')).toBe(true);
  });

  it('a scaffolded make-ten win is warmup-class (θ up, no rate) and graduates off the bare rung', () => {
    const pid = bridger(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK2, stretch: 0 };
    const answerWith = (seed: number, at: number) =>
      sessionAnswer(player, sid, 'add_cross_10', seed, buildItem('add_cross_10', seed).answer, false, 1, false, 2000, `idem-${at}-${Math.random()}`, null, at);

    const before = repo.abilities(pid).get('add_cross_10')!.theta;
    repo.startAcquisition(pid, 'add_cross_10', 'make_ten_add', NOW);
    let at = NOW + 200_000;
    answerWith(4242, at);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid, 'add_cross_10') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1); // the flag every rate/aim/sprint query filters on
    expect(repo.abilities(pid).get('add_cross_10')!.theta).toBeGreaterThan(before); // a scaffold she wins pulls θ up
    expect(repo.cleanPracticeRate(pid, 'add_cross_10')).toBeNull(); // the fluency number stays honest

    // Seven more clean answers (eight total from L0) walk L0 → L1 → L2 → L3 → graduation.
    for (let i = 0; i < 7; i++) { at += 5000; answerWith(5000 + i, at); }
    expect(repo.acquisitionLevel(pid, 'add_cross_10')).toBeNull(); // graduated, acquisition stops firing
    expect(acquisitionPlans(pid, buildStates(pid, AK2, 'maths')).has('add_cross_10')).toBe(false);
  });
});

// ── DOMAIN · DIVISION (inverse-multiplication) ──────────────────────────────────────────────
// A division fact reframed as the multiplication fact she owns: 56 / 8 → "8 × ? = 56" → 7.

const AK5 = 5; // seedGradeFor(5) = 4: every ×-table seeds fluent; div_table_7/8/9 (year 5) do not.

describe('division — the derivation content', () => {
  it('registers an inverse-mult derivation for every table + missing_factor, not the union node', () => {
    for (const t of [2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12]) expect(hasDerivation(`div_table_${t}`)).toBe(true);
    expect(hasDerivation('missing_factor')).toBe(true);
    expect(hasDerivation('div_mixed')).toBe(false); // a union node has no single-table inverse
  });

  it('decomposes the ACTUAL division into its × fact, never changing the quotient', () => {
    for (const t of [3, 7, 8, 12]) {
      for (let seed = 1; seed < 30; seed++) {
        const item = buildItem(`div_table_${t}`, seed);
        const sc = buildScaffold(`div_table_${t}`, seed, 'div_inverse_mult')!;
        expect(sc.target).toBe(item.prompt);
        expect(sc.answer).toBe(item.answer); // grading unchanged
        expect(sc.substeps).toHaveLength(1);
        const dividend = Number(item.prompt.match(/^(\d+)/)![1]);
        expect(sc.substeps[0].prompt).toBe(`${t} × □ = ${dividend}`);
        expect(sc.substeps[0].answer).toBe(item.answer); // she builds the quotient with her × fluency
        expect(sc.partial).toBe(`${t} × □ = ${dividend}`);
      }
    }
  });

  it('missing_factor reframes to a division she owns, answer unchanged', () => {
    for (let seed = 1; seed < 40; seed++) {
      const item = buildItem('missing_factor', seed);
      const sc = buildScaffold('missing_factor', seed, 'mf_inverse_div')!;
      expect(sc.answer).toBe(item.answer);
      expect(sc.substeps[0].prompt).toMatch(/^\d+ \/ \d+ =$/);
      expect(sc.substeps[0].answer).toBe(item.answer);
    }
  });

  it('picks inverse-mult when the table is fluent, vetoes when it is not (invariant 3)', () => {
    expect(pickDerivation('div_table_8', () => true)?.id).toBe('div_inverse_mult');
    expect(pickDerivation('div_table_8', (c) => c !== 'mult_table_8')).toBeNull();
    expect(pickDerivation('missing_factor', () => true)?.id).toBe('mf_inverse_div');
    expect(pickDerivation('missing_factor', (c) => c !== 'div_mixed')).toBeNull();
  });

  it('a division hint points at the × table, in both locales, never the quotient', () => {
    for (const loc of ['sv', 'en']) {
      const h = hintFor('div_inverse_mult', 8, loc);
      expect(h).toContain('8');
      expect(h).toContain('×');
    }
  });
});

describe('division — the trigger and the engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  // åk5: fluent on the ×-tables (seed) but failing the year-5 division facts — exactly who the
  // inverse-mult reframe is for. No attempts on the ×-tables, so they stay steady/fluent.
  function divver(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'divver', AK5, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'div_table_8', (t += 1000));
    for (let i = 0; i < 4; i++) idk(pid, 'div_table_7', (t += 1000));
    return pid;
  }

  it('both division gaps ignite with inverse-mult; the fluent ×-tables do not', () => {
    const pid = divver(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK5, 'maths'));
    expect(plans.get('div_table_8')).toMatchObject({ level: L_FULL, strategy: 'div_inverse_mult' });
    expect(plans.get('div_table_7')).toMatchObject({ level: L_FULL, strategy: 'div_inverse_mult' });
    expect(plans.has('mult_table_8')).toBe(false); // no derivation (it IS the input)
  });

  it('does NOT fire when the × table it inverts is not fluent — the graph drops lower', () => {
    const pid = divver(fam);
    const states = buildStates(pid, AK5, 'maths').map((s) =>
      s.code === 'mult_table_8'
        ? ({ ...s, seedFluent: false, earnedFluent: false, rate: { source: 'measured', value: 0.1 } } as SelState)
        : s,
    );
    expect(acquisitionPlans(pid, states).has('div_table_8')).toBe(false);
  });

  it('is served the reframe, warmup-class (θ up, no rate), and graduates', () => {
    const pid = divver(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK5, stretch: 0 };
    const answerWith = (seed: number, at: number) =>
      sessionAnswer(player, sid, 'div_table_8', seed, buildItem('div_table_8', seed).answer, false, 1, false, 2000, `idem-${at}-${Math.random()}`, null, at);

    // It is actually served as a scaffold on the real engine.
    let at = NOW + 100_000;
    const served: string[] = [];
    let item = issueNext(pid, AK5, at, { sessionId: sid, remaining: 10 });
    for (let i = 0; i < 14; i++) {
      served.push(item.acq ? `${item.code}@L${item.acq.level}` : item.code);
      at += 5000;
      const r = sessionAnswer(player, sid, item.code, item.seed, buildItem(item.code, item.seed).answer, false, 1, false, 2000, `idem-${item.code}-${at}-${Math.random()}`, null, at);
      if (r.status === 'retry' || !r.next) break;
      item = r.next;
    }
    expect(served.some((s) => s === 'div_table_8@L0' || s === 'div_table_7@L0')).toBe(true);

    // Warmup-class + graduation on a fresh forced arc (own family — the fixture icon is fixed).
    const fam2 = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
    const pid2 = divver(fam2);
    const sid2 = repo.createSessionRun(pid2, 10, NOW, 'maths');
    const p2 = { id: pid2, school_year: AK5, stretch: 0 };
    const before = repo.abilities(pid2).get('div_table_8')!.theta;
    repo.startAcquisition(pid2, 'div_table_8', 'div_inverse_mult', NOW);
    let at2 = NOW + 200_000;
    sessionAnswer(p2, sid2, 'div_table_8', 4242, buildItem('div_table_8', 4242).answer, false, 1, false, 2000, `d-${at2}`, null, at2);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid2, 'div_table_8') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1);
    expect(repo.abilities(pid2).get('div_table_8')!.theta).toBeGreaterThan(before);
    expect(repo.cleanPracticeRate(pid2, 'div_table_8')).toBeNull();
    for (let i = 0; i < 8; i++) { at2 += 5000; sessionAnswer(p2, sid2, 'div_table_8', 5000 + i, buildItem('div_table_8', 5000 + i).answer, false, 1, false, 2000, `d2-${at2}-${i}`, null, at2); }
    expect(repo.acquisitionLevel(pid2, 'div_table_8')).toBeNull(); // graduated
  });
});

// ── DOMAIN · 2-DIGIT place value (split into tens + ones; carry/borrow chain onto bridging) ──

const AK3 = 3; // seedGradeFor(3) = 2: year-1 inputs + add_2d_no_carry/sub_2d_no_borrow (yr2) seed
// fluent; add_2d_carry is being failed, sub_2d_borrow (yr3) is genuinely below the seed.

describe('2-digit place value — the derivation content', () => {
  const cases = [
    { code: 'add_2d_no_carry', strat: 'split_add_2d' as StrategyId, steps: 3 },
    { code: 'add_2d_carry', strat: 'split_add_2d_carry' as StrategyId, steps: 3 },
    { code: 'sub_2d_no_borrow', strat: 'split_sub_2d' as StrategyId, steps: 3 },
    { code: 'sub_2d_borrow', strat: 'split_sub_2d_borrow' as StrategyId, steps: 2 },
  ];

  it('registers a split derivation for all four 2-digit seams', () => {
    for (const c of cases) expect(hasDerivation(c.code)).toBe(true);
  });

  it('every scaffold parses + decomposes the ACTUAL item and lands on its answer (buildScaffold guard)', () => {
    for (const c of cases) {
      for (let seed = 1; seed < 50; seed++) {
        const item = buildItem(c.code, seed);
        const sc = buildScaffold(c.code, seed, c.strat);
        expect(sc, `${c.code} seed ${seed}`).not.toBeNull(); // non-null over EVERY generated instance = parse+guard hold
        expect(sc!.answer).toBe(item.answer); // grading unchanged
        expect(sc!.target).toBe(item.prompt);
        expect(sc!.substeps).toHaveLength(c.steps);
        expect(sc!.substeps[sc!.substeps.length - 1].answer).toBe(item.answer);
        for (const s of sc!.substeps) expect(s.prompt.endsWith('=')).toBe(true);
        expect(sc!.partial.endsWith('=')).toBe(true);
      }
    }
  });

  it('the borrow compensation keeps every sub-step non-negative and no-cross (invariant 3 arithmetic)', () => {
    for (let seed = 1; seed < 80; seed++) {
      const sc = buildScaffold('sub_2d_borrow', seed, 'split_sub_2d_borrow')!;
      // step 1 "a − bRoundUp = mid": mid ≥ 0; step 2 "mid + overshoot": the ones never cross ten.
      const mid = Number(sc.substeps[0].answer);
      expect(mid).toBeGreaterThanOrEqual(0);
      const overshoot = Number(sc.substeps[1].prompt.match(/\+ (\d+)/)![1]);
      expect(overshoot).toBeGreaterThanOrEqual(1);
      expect(overshoot).toBeLessThanOrEqual(9);
      expect((mid % 10) + overshoot).toBeLessThan(10);
    }
  });

  it('picks the split, and the carry/borrow seams VETO on the bridging input (the chain)', () => {
    expect(pickDerivation('add_2d_carry', () => true)?.id).toBe('split_add_2d_carry');
    expect(pickDerivation('add_2d_carry', (c) => c !== 'add_cross_10')).toBeNull(); // chains onto bridging
    expect(pickDerivation('sub_2d_borrow', () => true)?.id).toBe('split_sub_2d_borrow');
    expect(pickDerivation('sub_2d_borrow', (c) => c !== 'sub_2d_no_borrow')).toBeNull();
    expect(pickDerivation('add_2d_no_carry', (c) => c !== 'add_tens')).toBeNull();
  });
});

describe('2-digit place value — the trigger and the engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  // åk3: fluent on the within-ten facts AND add_2d_no_carry / sub_2d_no_borrow (seed), but failing
  // the carry/borrow seams. No attempts on the inputs, so they stay steady/fluent.
  function twoDigit(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'twodigit', AK3, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'add_2d_carry', (t += 1000));
    for (let i = 0; i < 4; i++) idk(pid, 'sub_2d_borrow', (t += 1000));
    return pid;
  }

  it('the carry and borrow gaps ignite; the no-carry facts she owns do not', () => {
    const pid = twoDigit(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK3, 'maths'));
    expect(plans.get('add_2d_carry')).toMatchObject({ level: L_FULL, strategy: 'split_add_2d_carry' });
    expect(plans.get('sub_2d_borrow')).toMatchObject({ level: L_FULL, strategy: 'split_sub_2d_borrow' });
    expect(plans.has('add_2d_no_carry')).toBe(false); // fluent, not failed
    expect(plans.has('sub_2d_no_borrow')).toBe(false);
  });

  it('sub_2d_borrow is served, warmup-class, and graduates on the real engine', () => {
    const pid = twoDigit(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK3, stretch: 0 };
    const answerWith = (seed: number, at: number) =>
      sessionAnswer(player, sid, 'sub_2d_borrow', seed, buildItem('sub_2d_borrow', seed).answer, false, 1, false, 2000, `idem-${at}-${Math.random()}`, null, at);

    const before = repo.abilities(pid).get('sub_2d_borrow')!.theta;
    repo.startAcquisition(pid, 'sub_2d_borrow', 'split_sub_2d_borrow', NOW);
    let at = NOW + 200_000;
    answerWith(4242, at);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid, 'sub_2d_borrow') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1);
    expect(repo.abilities(pid).get('sub_2d_borrow')!.theta).toBeGreaterThan(before);
    expect(repo.cleanPracticeRate(pid, 'sub_2d_borrow')).toBeNull();
    for (let i = 0; i < 8; i++) { at += 5000; answerWith(5000 + i, at); }
    expect(repo.acquisitionLevel(pid, 'sub_2d_borrow')).toBeNull(); // graduated
  });
});

// ── DOMAIN · NEGATIVE integers (sign-rule rewrites) ─────────────────────────────────────────
// A signed operation reframed as the unsigned one she owns + a sign rule. The sign-flip case
// (neg_div) is the subtle one: BOTH its walk and its L1 partial must land on the negative answer.

const AK7 = 7; // seedGradeFor(7) = 6: neg_add_pos, mult_mixed, div_mixed all seed fluent.

describe('negatives — the derivation content', () => {
  it('registers a sign-rewrite for the three seams', () => {
    expect(hasDerivation('neg_sub_neg')).toBe(true);
    expect(hasDerivation('neg_mult_neg_neg')).toBe(true);
    expect(hasDerivation('neg_div')).toBe(true);
  });

  it('each sign-rewrite decomposes the actual item and lands on the SIGNED answer', () => {
    const map = [
      ['neg_sub_neg', 'neg_minus_minus'],
      ['neg_mult_neg_neg', 'neg_mult_same_sign'],
      ['neg_div', 'neg_div_signs'],
    ] as const;
    for (const [code, strat] of map) {
      for (let seed = 1; seed < 50; seed++) {
        const item = buildItem(code, seed);
        const sc = buildScaffold(code, seed, strat);
        expect(sc, `${code} seed ${seed}`).not.toBeNull();
        expect(sc!.answer).toBe(item.answer); // grading unchanged
        expect(sc!.target).toBe(item.prompt);
        expect(sc!.substeps[sc!.substeps.length - 1].answer).toBe(item.answer); // walk ends on the signed answer
      }
    }
  });

  it('neg_div negates explicitly: magnitude first (positive), last step and partial are negative', () => {
    for (let seed = 1; seed < 40; seed++) {
      const item = buildItem('neg_div', seed);
      const sc = buildScaffold('neg_div', seed, 'neg_div_signs')!;
      expect(sc.substeps).toHaveLength(2);
      expect(Number(sc.substeps[0].answer)).toBeGreaterThan(0); // the magnitude quotient
      expect(Number(sc.substeps[1].answer)).toBeLessThan(0); // the sign applied
      expect(sc.partial.startsWith('−(')).toBe(true); // the partial pulls the minus out → never grades +q
      expect(item.answer.startsWith('-')).toBe(true);
    }
  });

  it('picks the sign-rewrite, vetoes when the unsigned input is not fluent (invariant 3)', () => {
    expect(pickDerivation('neg_sub_neg', () => true)?.id).toBe('neg_minus_minus');
    expect(pickDerivation('neg_sub_neg', (c) => c !== 'neg_add_pos')).toBeNull();
    expect(pickDerivation('neg_mult_neg_neg', (c) => c !== 'mult_mixed')).toBeNull();
    expect(pickDerivation('neg_div', (c) => c !== 'div_mixed')).toBeNull();
  });
});

describe('negatives — the trigger and the engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  function negs(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'negs', AK7, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'neg_sub_neg', (t += 1000));
    for (let i = 0; i < 4; i++) miss(pid, 'neg_mult_neg_neg', (t += 1000));
    for (let i = 0; i < 4; i++) idk(pid, 'neg_div', (t += 1000));
    return pid;
  }

  it('all three sign seams ignite with their rewrite', () => {
    const pid = negs(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK7, 'maths'));
    expect(plans.get('neg_sub_neg')).toMatchObject({ level: L_FULL, strategy: 'neg_minus_minus' });
    expect(plans.get('neg_mult_neg_neg')).toMatchObject({ level: L_FULL, strategy: 'neg_mult_same_sign' });
    expect(plans.get('neg_div')).toMatchObject({ level: L_FULL, strategy: 'neg_div_signs' });
  });

  it('neg_mult_neg_neg is served, warmup-class, and graduates (a positive-answer rewrite)', () => {
    const pid = negs(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK7, stretch: 0 };
    const answerWith = (seed: number, at: number) =>
      sessionAnswer(player, sid, 'neg_mult_neg_neg', seed, buildItem('neg_mult_neg_neg', seed).answer, false, 1, false, 2000, `idem-${at}-${Math.random()}`, null, at);

    const before = repo.abilities(pid).get('neg_mult_neg_neg')!.theta;
    repo.startAcquisition(pid, 'neg_mult_neg_neg', 'neg_mult_same_sign', NOW);
    let at = NOW + 200_000;
    answerWith(4242, at);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid, 'neg_mult_neg_neg') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1);
    expect(repo.abilities(pid).get('neg_mult_neg_neg')!.theta).toBeGreaterThan(before);
    expect(repo.cleanPracticeRate(pid, 'neg_mult_neg_neg')).toBeNull();
    for (let i = 0; i < 8; i++) { at += 5000; answerWith(5000 + i, at); }
    expect(repo.acquisitionLevel(pid, 'neg_mult_neg_neg')).toBeNull(); // graduated
  });
});

// ── DOMAIN · DECIMALS (add tenths as whole counts, place the comma) + FRACTIONS ─────────────
// dec_times_whole is deliberately absent — its ×-core is often multi-digit (see the report).

const AK6 = 6; // seedGradeFor(6) = 5: dec_read_tenths, add_2d_carry, div_mixed, mult_mixed fluent.

describe('decimals + fractions — the derivation content', () => {
  const cases = [
    { code: 'dec_add_same', strat: 'dec_add_tenths' as StrategyId },
    { code: 'dec_add_carry', strat: 'dec_add_tenths' as StrategyId },
    { code: 'frac_of_quantity', strat: 'frac_of_qty' as StrategyId },
    { code: 'frac_equivalent', strat: 'frac_equiv_scale' as StrategyId },
    { code: 'frac_add_same_denom', strat: 'frac_add_same' as StrategyId },
  ];

  it('registers a derivation for the two decimal adds and the three trainable fractions', () => {
    for (const c of cases) expect(hasDerivation(c.code)).toBe(true);
    expect(hasDerivation('dec_times_whole')).toBe(false); // multi-digit ×-core → reported, not built
  });

  it('every scaffold parses + decomposes the ACTUAL item and lands on its answer (all five)', () => {
    for (const c of cases) {
      for (let seed = 1; seed < 60; seed++) {
        const item = buildItem(c.code, seed);
        const sc = buildScaffold(c.code, seed, c.strat);
        expect(sc, `${c.code} seed ${seed}`).not.toBeNull(); // parse + internal reconstruct hold over every instance
        expect(sc!.answer).toBe(item.answer); // grading unchanged
        expect(sc!.target).toBe(item.prompt);
        expect(sc!.substeps[sc!.substeps.length - 1].answer).toBe(item.answer);
        for (const s of sc!.substeps) expect(s.prompt.endsWith('=')).toBe(true);
      }
    }
  });

  it('decimal add makes the tenths a whole-number sum, then reads it back with the comma', () => {
    const sc = buildScaffold('dec_add_carry', 3, 'dec_add_tenths')!;
    expect(sc.substeps).toHaveLength(2);
    expect(sc.substeps[0].prompt).toMatch(/^\d+ \+ \d+ =$/); // the tenth-counts, added as wholes
    expect(sc.substeps[1].prompt).toContain('tiondelar');
  });

  it('same-denominator add is graded by VALUE, so a reducing sum still scaffolds', () => {
    // find a reducing instance (e.g. 2/8 + 2/8 = 4/8 = 1/2) and confirm the walk lands on the
    // reduced canonical answer, never the unreduced fraction.
    let sawReducing = false;
    for (let seed = 1; seed < 200 && !sawReducing; seed++) {
      const item = buildItem('frac_add_same_denom', seed);
      if (!item.answer.includes('/')) continue;
      const sc = buildScaffold('frac_add_same_denom', seed, 'frac_add_same');
      if (!sc) continue;
      const denom = Number(item.prompt.match(/\/(\d+)/)![1]);
      const ansDenom = Number(item.answer.split('/')[1]);
      if (ansDenom !== denom) { sawReducing = true; expect(sc.substeps[sc.substeps.length - 1].answer).toBe(item.answer); }
    }
    expect(sawReducing).toBe(true);
  });

  it('picks each derivation and vetoes on a missing input (invariant 3)', () => {
    expect(pickDerivation('dec_add_carry', () => true)?.id).toBe('dec_add_tenths');
    expect(pickDerivation('dec_add_carry', (c) => c !== 'add_2d_carry')).toBeNull();
    expect(pickDerivation('dec_add_same', (c) => c !== 'dec_read_tenths')).toBeNull();
    expect(pickDerivation('frac_of_quantity', (c) => c !== 'div_mixed')).toBeNull();
    expect(pickDerivation('frac_equivalent', (c) => c !== 'mult_mixed')).toBeNull();
    expect(pickDerivation('frac_add_same_denom', (c) => c !== 'add_within_10')).toBeNull();
  });
});

describe('decimals + fractions — the trigger and the engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  function decFrac(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'decfrac', AK6, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'maths')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'dec_add_same', (t += 1000));
    for (let i = 0; i < 4; i++) idk(pid, 'dec_add_carry', (t += 1000));
    for (let i = 0; i < 4; i++) miss(pid, 'frac_of_quantity', (t += 1000));
    for (let i = 0; i < 4; i++) idk(pid, 'frac_equivalent', (t += 1000));
    return pid;
  }

  it('the decimal and fraction gaps ignite with their methods', () => {
    const pid = decFrac(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK6, 'maths'));
    expect(plans.get('dec_add_same')).toMatchObject({ level: L_FULL, strategy: 'dec_add_tenths' });
    expect(plans.get('dec_add_carry')).toMatchObject({ level: L_FULL, strategy: 'dec_add_tenths' });
    expect(plans.get('frac_of_quantity')).toMatchObject({ level: L_FULL, strategy: 'frac_of_qty' });
    expect(plans.get('frac_equivalent')).toMatchObject({ level: L_FULL, strategy: 'frac_equiv_scale' });
  });

  it('frac_of_quantity is served, warmup-class, and graduates', () => {
    const pid = decFrac(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'maths');
    const player = { id: pid, school_year: AK6, stretch: 0 };
    const answerWith = (seed: number, at: number) =>
      sessionAnswer(player, sid, 'frac_of_quantity', seed, buildItem('frac_of_quantity', seed).answer, false, 1, false, 2000, `idem-${at}-${Math.random()}`, null, at);

    const before = repo.abilities(pid).get('frac_of_quantity')!.theta;
    repo.startAcquisition(pid, 'frac_of_quantity', 'frac_of_qty', NOW);
    let at = NOW + 200_000;
    answerWith(4242, at);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid, 'frac_of_quantity') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1);
    expect(repo.abilities(pid).get('frac_of_quantity')!.theta).toBeGreaterThan(before);
    expect(repo.cleanPracticeRate(pid, 'frac_of_quantity')).toBeNull();
    for (let i = 0; i < 8; i++) { at += 5000; answerWith(5000 + i, at); }
    expect(repo.acquisitionLevel(pid, 'frac_of_quantity')).toBeNull(); // graduated
  });
});

// ── WORD SUBJECT · Swedish doubling (spelling_t3) — RULE-APPLICATION-FADE ────────────────────
// The first non-derivation support-type on the SAME engine: a discrimination walk (hear the word →
// short vowel doubles) then produce it, fading to a bare dictation.

const AK4_SP = 4; // seedGradeFor(4) = 3: spelling_t2 (yr2) seeds fluent — the base she owns; she is
// failing the DOUBLING (spelling_t3, yr3).

const t3IsShort = (word: string) => T3_PAIRS.some((p) => p.short === word);

describe('word subjects — Swedish doubling (rule-application-fade) content', () => {
  it('registers a rule derivation on spelling_t3 with a fluent-input veto', () => {
    expect(hasDerivation('spelling_t3')).toBe(true);
    expect(pickDerivation('spelling_t3', () => true)?.id).toBe('sv_double');
    // The rule joins the base she must already spell — spelling_t2 fluency is the veto (spec §2).
    expect(pickDerivation('spelling_t3', (c) => c !== 'spelling_t2')).toBeNull();
  });

  it('the L0 walk is a hear→short/long discrimination, then the produced word is the real answer', () => {
    for (let seed = 0; seed < 34; seed++) {
      const item = buildItem('spelling_t3', seed);
      const sc = buildWordScaffold('spelling_t3', seed, 'sv_double');
      expect(sc, `seed ${seed} word ${item.answer}`).not.toBeNull();
      expect(sc!.answer).toBe(item.answer); // the produced target IS the item's real word — grading unchanged
      expect(sc!.isRule).toBe(true);
      expect(sc!.substeps).toHaveLength(1);
      const sub = sc!.substeps[0];
      expect(sub.kind).toBe('choice');
      if (sub.kind === 'choice') {
        expect(sub.prompt).toEqual({ show: 'listen', code: 'spelling_t3', word: item.answer }); // hears the dictated word
        expect(sub.options.map((o) => o.value)).toEqual(['kort', 'lång']);
        expect(sub.answer).toBe(t3IsShort(item.answer) ? 'kort' : 'lång'); // the rule's discrimination
      }
    }
  });

  it('the cue flags the doubling: two slots for a short (doubled) word, one for a long, tip at L2', () => {
    const shortSeed = [0, 2, 4, 6, 8].find((s) => t3IsShort(buildItem('spelling_t3', s).answer))!;
    const longSeed = [0, 2, 4, 6, 8].find((s) => !t3IsShort(buildItem('spelling_t3', s).answer))!;
    const shortSc = buildWordScaffold('spelling_t3', shortSeed, 'sv_double')!;
    const longSc = buildWordScaffold('spelling_t3', longSeed, 'sv_double')!;
    expect((shortSc.cueAt(L_FULL)!.match(/_/g) || []).length).toBe(2); // double → two blanks
    expect((longSc.cueAt(L_FULL)!.match(/_/g) || []).length).toBe(1); // single → one blank
    expect(shortSc.cueAt(L_PARTIAL)).toBe(shortSc.cueAt(L_FULL)); // L1 keeps the gap cue
    expect(shortSc.cueAt(L_CUED)).toContain('vokal'); // L2 is the bare rule tip
    expect(shortSc.cueAt(L_CUED)).not.toContain('_');
  });
});

describe('word subjects — Swedish doubling trigger + engine', () => {
  let fam: string;
  beforeEach(() => {
    fam = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
  });

  // A speller who owns transparent spelling (spelling_t2, seed-fluent) but keeps failing the
  // doubling. No attempts on spelling_t2, so it stays steady/fluent (the rule's input).
  function speller(familyId: string): string {
    const pid = repo.createPlayer(familyId, 'speller', AK4_SP, NOW);
    for (let i = 0; i < 5; i++) {
      getDb()
        .prepare("INSERT INTO session_run (player_id, target, completed, started_at, ended_at, subject) VALUES (?, 10, 10, ?, ?, 'spelling')")
        .run(pid, NOW - 100_000 - i * 1000, NOW - 90_000 - i * 1000);
    }
    let t = NOW + 1000;
    for (let i = 0; i < 4; i++) miss(pid, 'spelling_t3', (t += 1000));
    return pid;
  }

  it('the doubling gap ignites with sv_double; the base she owns is not scaffolded', () => {
    const pid = speller(fam);
    const plans = acquisitionPlans(pid, buildStates(pid, AK4_SP, 'spelling'));
    expect(plans.get('spelling_t3')).toMatchObject({ level: L_FULL, strategy: 'sv_double' });
    expect(plans.has('spelling_t2')).toBe(false); // no derivation — it IS the input she owns
  });

  it('does NOT fire when the base spelling (spelling_t2) is not fluent — drop lower', () => {
    const pid = speller(fam);
    const states = buildStates(pid, AK4_SP, 'spelling').map((s) =>
      s.code === 'spelling_t2'
        ? ({ ...s, seedFluent: false, earnedFluent: false, rate: { source: 'measured', value: 0.1 } } as SelState)
        : s,
    );
    expect(acquisitionPlans(pid, states).has('spelling_t3')).toBe(false);
  });

  it('is served the rule-walk, warmup-class (θ up, no rate), and graduates', () => {
    const pid = speller(fam);
    const sid = repo.createSessionRun(pid, 10, NOW, 'spelling');
    const player = { id: pid, school_year: AK4_SP, stretch: 0 };

    // Actually served as a scaffold in a spelling session (not routed around).
    let at = NOW + 100_000;
    const served: string[] = [];
    let item = issueNext(pid, AK4_SP, at, { sessionId: sid, remaining: 10, subject: 'spelling' });
    for (let i = 0; i < 14; i++) {
      served.push(item.acq ? `${item.code}@L${item.acq.level}:${item.acq.strategy}` : item.code);
      at += 5000;
      const r = sessionAnswer(player, sid, item.code, item.seed, buildItem(item.code, item.seed).answer, false, 1, false, 2000, `idem-${item.code}-${at}-${Math.random()}`, null, at);
      if (r.status === 'retry' || !r.next) break;
      item = r.next;
    }
    expect(served.some((s) => s === 'spelling_t3@L0:sv_double')).toBe(true);

    // Warmup-class + graduation on a fresh forced arc (own family — fixed fixture icon).
    const fam2 = repo.createFamily(`turtle+ice_cream-${Math.random().toString(36).slice(2)}`, 't:i', 't:x', NOW);
    const pid2 = speller(fam2);
    const sid2 = repo.createSessionRun(pid2, 10, NOW, 'spelling');
    const p2 = { id: pid2, school_year: AK4_SP, stretch: 0 };
    const before = repo.abilities(pid2).get('spelling_t3')!.theta;
    repo.startAcquisition(pid2, 'spelling_t3', 'sv_double', NOW);
    let at2 = NOW + 200_000;
    sessionAnswer(p2, sid2, 'spelling_t3', 0, buildItem('spelling_t3', 0).answer, false, 1, false, 2000, `s-${at2}`, null, at2);
    const row = getDb().prepare('SELECT warmup, acq_level FROM attempt WHERE player_id = ? AND skill_code = ? ORDER BY id DESC LIMIT 1').get(pid2, 'spelling_t3') as { warmup: number; acq_level: number };
    expect(row.acq_level).toBe(L_FULL);
    expect(row.warmup).toBe(1); // warmup-class — never a fluency/rate measure
    expect(repo.abilities(pid2).get('spelling_t3')!.theta).toBeGreaterThan(before);
    expect(repo.cleanPracticeRate(pid2, 'spelling_t3')).toBeNull();
    for (let i = 0; i < 8; i++) { at2 += 5000; sessionAnswer(p2, sid2, 'spelling_t3', i * 2, buildItem('spelling_t3', i * 2).answer, false, 1, false, 2000, `s2-${at2}-${i}`, null, at2); }
    expect(repo.acquisitionLevel(pid2, 'spelling_t3')).toBeNull(); // graduated
  });
});
