import 'server-only';
import * as repo from '@/db/repo';
import { SKILLS } from '@/skills';
import { eligibleSprintSkills } from './sprint-eligibility';
import { classifySprint, sprintRateIsCredible, aimFor, SHADOW_TRIGGER_FACTOR } from './fluency';
import { seedGradeFor } from './onboarding';
import { isValidInterval } from './rate';

// ── WS III burst — PHASE B0 (SHADOW) ────────────────────────────────────────
// A burst is a short CONSECUTIVE run of one mastered, sprintable skill, served inline in ordinary
// practice and SILENTLY timed — reproducing the sprint MEASUREMENT CONDITION (a warmed-up, same-shape
// batch) WITHOUT the stopwatch, the verdict, or a reward. The shadow read (2026-08-12) showed calm
// practice-rate is too loose a proxy for capability (median 0.56, spread 0.43–0.98, 71% precision), so
// the practice-crossing is DEMOTED to the OFFER signal and the burst does the real measurement.
//
// B0 is a SHADOW: it serves the run and records the measurement to `burst_result`, but AWARDS NOTHING
// (no done-screen diploma, no fluent-drop, no ledger). Nothing in replay / everMilestonedSkills / the
// selector reads it. It is compared OFFLINE to the sprint ledger to decide the B1 cutover. The CLIENT
// is UNCHANGED — no auto-submit, no banner; a burst is indistinguishable from ordinary practice, which
// is what keeps it un-optimizable and done-never-failed. (Auto-submit + the diploma reveal are B1.)

const META = new Map(SKILLS.map((s) => [s.code, s]));

export const BURST_ITEMS = 6; // resolved items per run (B0; small enough to fit a session — tune on data)
export const BURST_COOLDOWN_MS = 48 * 3600 * 1000; // a skill re-measures at most this often

// B0 rollout gate: the TEST family only, so real children are untouched while the mechanism is
// validated. Widening to the real family (needed for the burst-vs-sprint agreement data) is a
// one-line change here once Erik has tablet-checked it.
export function burstEnabledFor(playerId: string): boolean {
  return repo.isTestFamilyPlayer(playerId);
}

// The sprint-calibrated aim + tap floor for a skill — computed exactly as recordShadowFluency does,
// so the readiness comparison and the recorded snapshot share one definition (maths skills only; the
// eligibility pool this reads is subject:'maths').
function burstAim(playerId: string, code: string, schoolYear: number): { aim: number; floor: number } {
  const floor = repo.bestObservedDigitRate(playerId);
  const aim = aimFor(repo.latestToolRate(playerId), seedGradeFor(schoolYear), code, floor);
  return { aim, floor };
}

// The easiest burst-READY skill, or null. Ready = fluency-building band (accurate, not yet earned
// fluent — reuses the sprint eligibility, easiest-first) AND shadow-ready (clean practice rate ≥
// factor × aim — the same OFFER trigger the shadow data validated as a screen) AND off cooldown.
export function burstReadyCode(playerId: string, schoolYear: number, now: number): string | null {
  for (const e of eligibleSprintSkills(playerId)) {
    const last = repo.lastBurstStartedAt(playerId, e.code);
    if (last != null && now - last < BURST_COOLDOWN_MS) continue; // cooldown
    const pr = repo.cleanPracticeRate(playerId, e.code);
    if (pr == null) continue; // not enough clean samples yet
    const { aim } = burstAim(playerId, e.code, schoolYear);
    if (pr >= SHADOW_TRIGGER_FACTOR * aim) return e.code; // shadow-ready → offer a burst
  }
  return null;
}

// Decide whether the NEXT item's skill is driven by a burst: continue an active run, else start one.
// Returns the skill code to force, or null to leave selection to the normal selector. Never starts
// during the warm-up ramp or on the peak-end item, and only starts when the run FITS the remaining
// session (so a started burst reliably completes).
export function nextBurstCode(
  playerId: string,
  sessionRunId: number,
  schoolYear: number,
  now: number,
  opts: { warmupTarget?: number; peakEnd?: boolean; remaining: number },
): string | null {
  if (!burstEnabledFor(playerId)) return null;
  const active = repo.activeBurstRun(playerId, sessionRunId);
  if (active) return active.skill_code; // continue the run
  if (opts.warmupTarget != null || opts.peakEnd) return null; // never start on the ramp or the sure-win end
  if (opts.remaining < BURST_ITEMS) return null; // only start if it fits this session
  const code = burstReadyCode(playerId, schoolYear, now);
  if (!code) return null;
  repo.createBurstRun(playerId, code, sessionRunId, now, BURST_ITEMS);
  return code;
}

// On each RESOLVED answer, advance the active burst; on completion, compute the run's rate exactly as
// a sprint does (correct/min over summed VALID intervals), classify it, and write the SHADOW result.
// Awards nothing. A first-try-wrong item never reaches here (it retries and records nothing), so
// done_n counts resolved burst items.
export function settleBurstOnAnswer(playerId: string, sessionRunId: number, answeredCode: string, schoolYear: number, now: number): void {
  const active = repo.activeBurstRun(playerId, sessionRunId);
  if (!active || active.skill_code !== answeredCode) return;
  const { done_n, target_n } = repo.bumpBurstRun(active.id);
  if (done_n < target_n) return; // still mid-run

  const rows = repo.burstRunAttempts(playerId, active.skill_code, sessionRunId, active.started_at);
  let correct = 0;
  let errors = 0;
  let sumValid = 0;
  for (const r of rows) {
    if (r.correct) correct++;
    else errors++;
    if (isValidInterval(r.latency_ms)) sumValid += r.latency_ms; // time = all valid intervals (as ingestSprint)
  }
  const rate = sumValid > 0 ? (correct * 60000) / sumValid : 0;
  const { aim, floor } = burstAim(playerId, active.skill_code, schoolYear);
  const outcome = classifySprint(correct, errors, rate, aim).kind;
  repo.insertBurstResult({
    playerId,
    code: active.skill_code,
    burstRunId: active.id,
    correct,
    errors,
    intervalMs: sumValid,
    rate,
    aim,
    floor,
    outcome,
    credible: sprintRateIsCredible(correct, errors),
    at: now,
  });
  repo.endBurstRun(active.id, now);
}

// exported for tests / potential B1 reuse
export const _burstMeta = META;
