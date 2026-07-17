import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'celerant-sprint-reward-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-abcdefghijklmnop';

import * as repo from '@/db/repo';
import { getDb } from '@/db';
import { classifySprint, sprintRateIsCredible, MILESTONE_BONUS, SPRINT_ACC_FLOOR, SPRINT_COLLAPSE_FLOOR } from '@/lib/fluency';
import { startSprint, sprintAnswer, finishSprint, skillEligibility, eligibleSprintSkills, isSprintEligible } from '@/lib/sprint';
import { rewardState } from '@/lib/reward';

const AIM_YR3 = 0.55 * (25 + 5 * 3); // 22 — the finalize aim for a year-3 child (no tool_rate)

// Seed N first-try-correct attempts on a skill (times strictly after `after`), so
// the skill clears the accuracy gate over its (post-demotion) window.
function makeAccurate(pid: string, code: string, after: number, n = 20): void {
  for (let i = 0; i < n; i++) {
    repo.appendAttempt({
      playerId: pid, skillCode: code, itemJson: '{"prompt":"x"}', given: '1', correct: 1, tries: 1,
      dontKnow: false, latencyMs: 1500, at: after + (i + 1) * 1000,
    });
  }
}

// Parse "a + b =" / "a − b =" and compute — lets the test drive CORRECT sprint
// answers (the answer key is server-side; the prompt is not).
function answerFor(prompt: string): number {
  const [a, op, b] = prompt.replace('=', '').trim().split(/\s+/);
  const x = parseInt(a, 10), y = parseInt(b, 10);
  if (op === '+') return x + y;
  if (op === '−' || op === '-') return x - y;
  throw new Error(`unhandled sprint prompt: ${prompt}`);
}

// Drive a real sprint: `corrects` correct answers then `wrongs` wrong ones, all
// inside the window, then finalize at end. Returns the SprintResult.
function driveSprint(pid: string, code: string, corrects: number, wrongs: number, t0: number, durationS = 30) {
  const start = startSprint(pid, code, durationS, t0);
  if (!start) throw new Error(`startSprint refused for ${code} (not eligible?)`);
  let prompt = start.prompt;
  let t = t0;
  for (let i = 0; i < corrects + wrongs; i++) {
    t += 1000;
    const given = String(i < corrects ? answerFor(prompt) : answerFor(prompt) + 777);
    const step = sprintAnswer(pid, start.sprintId, given, t);
    if (step && !step.done) prompt = step.prompt;
  }
  return finishSprint(pid, start.sprintId, t0 + durationS * 1000)!;
}

describe('classifySprint — ordered, total buckets (accuracy checked first)', () => {
  it('collapse when accuracy < floor, even if fast', () => {
    expect(classifySprint(2, 8, 999, AIM_YR3).kind).toBe('collapse'); // acc 0.2, blazing rate → still collapse
  });
  it('milestone only when fast AND clean', () => {
    expect(classifySprint(20, 0, AIM_YR3, AIM_YR3)).toEqual({ kind: 'milestone' }); // rate == aim, acc 1.0
  });
  it('fast-but-sloppy routes to near_miss/keep_clean — never milestone', () => {
    // acc 0.75 (≥0.5, <0.9), rate ≥ aim: speed bought by dropping accuracy pays nothing.
    expect(classifySprint(12, 4, AIM_YR3 + 5, AIM_YR3)).toEqual({ kind: 'near_miss', reason: 'keep_clean' });
  });
  it('slow-but-accurate routes to near_miss/build_speed', () => {
    expect(classifySprint(6, 0, AIM_YR3 - 10, AIM_YR3)).toEqual({ kind: 'near_miss', reason: 'build_speed' });
  });
  it('the boundaries: acc exactly at floors', () => {
    expect(classifySprint(1, 1, 100, AIM_YR3).kind).toBe('near_miss'); // acc 0.5 == COLLAPSE_FLOOR ⇒ not collapse
    expect(SPRINT_COLLAPSE_FLOOR).toBe(0.5);
    expect(SPRINT_ACC_FLOOR).toBe(0.9);
  });
  it('sprintRateIsCredible iff accuracy held (≥ floor)', () => {
    expect(sprintRateIsCredible(9, 1)).toBe(true); // 0.9
    expect(sprintRateIsCredible(8, 2)).toBe(false); // 0.8
    expect(sprintRateIsCredible(0, 0)).toBe(false); // empty
  });
});

let fam: string;
let pid: string;
beforeAll(() => {
  fam = repo.createFamily('cat+dog', 'a:b', 'a:c', 1000);
  pid = repo.createPlayer(fam, 'cat', 3, 1000); // year 3 ⇒ finalize aim 22
});

describe('eligibility windowing — the fluency-building band (seeded ≠ earned)', () => {
  it('accurate + provisional (never sprinted) = building; too few attempts = ground', () => {
    // Before enough attempts: ground (not yet reliably accurate).
    let e = skillEligibility(pid).find((x) => x.code === 'add_within_10')!;
    expect(e.band).toBe('ground');
    makeAccurate(pid, 'add_within_10', 2000);
    e = skillEligibility(pid).find((x) => x.code === 'add_within_10')!;
    expect(e.band).toBe('building'); // provisional-but-accurate IS eligible — needs a first sprint
    expect(isSprintEligible(pid, 'add_within_10')).toBe(true);
  });
  it('a MEASURED rate ≥ aim graduates the skill to fluent (ineligible); a seeded rate never does', () => {
    // A measured rate at/above aim ⇒ fluent. (Seeded provisional ≥ aim would NOT — that is the crux.)
    repo.appendSprint(pid, 'add_within_10', 30, 20, 0, 3000); // 40/min ≥ 22 ⇒ measured-fluent
    const e = skillEligibility(pid).find((x) => x.code === 'add_within_10')!;
    expect(e.band).toBe('fluent');
    expect(isSprintEligible(pid, 'add_within_10')).toBe(false);
  });
  it('written multi-column procedures are never eligible (not sprintable)', () => {
    // mult_2d_by_1d_carry is a component but NOT sprintable — no clock on a written algorithm.
    expect(skillEligibility(pid).some((x) => x.code === 'mult_2d_by_1d_carry')).toBe(false);
    expect(eligibleSprintSkills(pid).some((x) => x.code === 'mult_2d_by_1d_carry')).toBe(false);
  });
});

describe('milestone bonus — one-time by construction, into the economy but not the pass counter', () => {
  it('crossing the aim cleanly pays the bonus once, then the skill is ineligible', () => {
    makeAccurate(pid, 'add_doubles', 5000);
    expect(isSprintEligible(pid, 'add_doubles')).toBe(true);

    const before = rewardState(fam);
    const sharedId = before.sharedTarget.id; // auto-directs here (a cat by default)
    const res = driveSprint(pid, 'add_doubles', 12, 0, 100000); // 24/min ≥ 22, acc 1.0 ⇒ milestone

    expect(res.outcome).toEqual({ kind: 'milestone' });
    expect(res.bonus).toMatchObject({ units: MILESTONE_BONUS });
    // Bonus landed in the economy (the shared cat gained MILESTONE_BONUS units)...
    const after = rewardState(fam);
    expect((after.progress[sharedId] ?? 0) - (before.progress[sharedId] ?? 0)).toBe(MILESTONE_BONUS);
    // ...but NOT as a session/pass — the wellbeing counters never moved.
    expect(repo.sessionsThisWeek(pid, 200000)).toBe(0);

    // One-time: crossing made the skill measured-fluent ⇒ no longer eligible, so it
    // can't be sprinted (or re-paid) again.
    expect(isSprintEligible(pid, 'add_doubles')).toBe(false);
    expect(startSprint(pid, 'add_doubles', 30, 300000)).toBeNull();
  });

  it('redirect is idempotent — one row per crossing, units fixed, target moves', () => {
    const sid = repo.appendSprint(pid, 'bond_to_20', 30, 20, 0, 1000000); // a crossing sprint
    repo.setBonusAllocation(sid, pid, fam, 'cat', 'pythagoras', MILESTONE_BONUS, 1000001);
    repo.setBonusAllocation(sid, pid, fam, 'cat', 'euclid', MILESTONE_BONUS, 1000002); // redirect
    const b = repo.bonusAllocationForSprint(sid)!;
    expect(b.target_id).toBe('euclid'); // moved
    expect(b.units).toBe(MILESTONE_BONUS); // never re-sized
    const rows = getDb().prepare('SELECT COUNT(*) c FROM bonus_allocation WHERE sprint_id = ?').get(sid) as { c: number };
    expect(rows.c).toBe(1); // upsert, not append — never farmable
  });
});

describe('near-miss — progress, never a reward; credible rate only when accuracy held', () => {
  it('slow-but-accurate writes a real rate, pays nothing, stays eligible (build_speed)', () => {
    makeAccurate(pid, 'sub_within_10', 400000);
    const res = driveSprint(pid, 'sub_within_10', 5, 0, 500000); // 10/min < 22, acc 1.0
    expect(res.outcome).toEqual({ kind: 'near_miss', reason: 'build_speed' });
    expect(res.bonus).toBeNull();
    expect(repo.sprintsForSkill(pid, 'sub_within_10', 8).length).toBe(1); // credible ⇒ recorded
    expect(isSprintEligible(pid, 'sub_within_10')).toBe(true); // still building
  });

  it('fast-but-sloppy writes NO rate and pays nothing (keep_clean)', () => {
    makeAccurate(pid, 'add_cross_10', 600000);
    const res = driveSprint(pid, 'add_cross_10', 12, 4, 700000); // 24/min ≥ 22 but acc 0.75
    expect(res.outcome).toEqual({ kind: 'near_miss', reason: 'keep_clean' });
    expect(res.bonus).toBeNull();
    expect(repo.sprintsForSkill(pid, 'add_cross_10', 8).length).toBe(0); // not credible ⇒ NOT recorded
  });
});

describe('demote-on-collapse — state-based cooldown, no θ/unlock touched', () => {
  it('a collapse writes no rate, demotes the skill, and it re-earns eligibility on fresh accuracy', () => {
    makeAccurate(pid, 'add_tens', 800000);
    expect(isSprintEligible(pid, 'add_tens')).toBe(true);

    const collapseAt = 900000 + 30 * 1000; // finishSprint time inside driveSprint
    const res = driveSprint(pid, 'add_tens', 1, 5, 900000); // acc ~0.17 ⇒ collapse
    expect(res.outcome).toEqual({ kind: 'collapse' });
    expect(res.bonus).toBeNull();
    expect(repo.sprintsForSkill(pid, 'add_tens', 8).length).toBe(0); // no rate written

    // Demoted: sprint-ineligible now, and the demotion is recorded as a usage_event.
    expect(repo.lastSprintDemotionAt(pid, 'add_tens')).toBeGreaterThanOrEqual(collapseAt);
    expect(isSprintEligible(pid, 'add_tens')).toBe(false);
    expect(skillEligibility(pid).find((x) => x.code === 'add_tens')!.band).toBe('ground');

    // The pre-collapse accuracy no longer counts — only FRESH post-demotion practice
    // re-solidifies it. Seed 20 new correct attempts after the demotion ⇒ eligible again.
    makeAccurate(pid, 'add_tens', collapseAt + 1000);
    expect(isSprintEligible(pid, 'add_tens')).toBe(true);
  });
});
