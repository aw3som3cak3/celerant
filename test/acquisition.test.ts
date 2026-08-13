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
  pickDerivation,
} from '@/lib/acquisition-content';
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
