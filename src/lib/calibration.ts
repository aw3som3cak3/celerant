import 'server-only';
import * as repo from '@/db/repo';
import { TARGET_SUCCESS, P_BAND } from './selector';
import { IDK_CONSIDER_MS } from '@/model/elo';

// The calibration monitor. It watches the gap the whole Koala episode turned on: what
// the model PREDICTS a child can do (the selector targets ~80% first-try success)
// versus what she OBSERVABLY does. When those diverge with enough evidence, something
// is wrong — a mis-estimated θ serving items too hard, or a skill she's outgrown. It's
// a permanent instrument (the failure mode of a confident model is MISplacement, and
// that lands on the child), and it is POSITION-AWARE so a tired session's tail reads as
// fatigue, not as the model being wrong.
//
// Scoring matches what the model actually counts: a sub-3s "don't know" is a tap-
// through, not an observation (see IDK_CONSIDER_MS), so it's excluded here too — the
// monitor and the estimator must see the same data.

type Row = { correct: number; tries: number; dont_know: number; latency_ms: number };
const scored = (a: Row) => !(a.dont_know === 1 && a.latency_ms < IDK_CONSIDER_MS); // the model counts it
const firstTryOK = (a: Row) => a.dont_know !== 1 && a.correct === 1 && a.tries === 1;

const MIN_OBS = 15; // enough first-try observations to trust a divergence, per skill
const LOWER = TARGET_SUCCESS - P_BAND; // 0.60 — below this, items are too hard for her
const UPPER = 0.95; // above this she's coasting — items too easy

export type SkillCalibration = { code: string; n: number; observed: number; verdict: 'ok' | 'too_hard' | 'too_easy' };

// Predicted (the selector's ~80% aim) vs observed first-try, per skill with enough obs.
export function calibrationReport(playerId: string): SkillCalibration[] {
  const rows = repo.recentAttemptsForCalibration(playerId, 400);
  const bySkill = new Map<string, { n: number; ok: number }>();
  for (const a of rows) {
    if (!scored(a)) continue;
    const s = bySkill.get(a.skill_code) ?? { n: 0, ok: 0 };
    s.n++;
    if (firstTryOK(a)) s.ok++;
    bySkill.set(a.skill_code, s);
  }
  const out: SkillCalibration[] = [];
  for (const [code, s] of bySkill) {
    if (s.n < MIN_OBS) continue;
    const observed = s.ok / s.n;
    const verdict = observed < LOWER ? 'too_hard' : observed > UPPER ? 'too_easy' : 'ok';
    out.push({ code, n: s.n, observed, verdict });
  }
  return out.sort((a, b) => a.observed - b.observed);
}

export type PositionPoint = { pos: number; n: number; firstTry: number };
export type FatigueReport = {
  curve: PositionPoint[];
  breakPos: number | null; // first position where first-try drops below the band — the session got too long here
  currentTarget: number;
  enoughData: boolean;
};

// Accuracy-by-position — a first-class diagnosis, not just an exclusion rule. If a
// child's first-try craters after position N, her session is too long and the tail is
// poisoning every measurement; the fix is to right-size the session so the bad data
// never exists (engineer the tail away, don't model around it).
export function fatigueReport(playerId: string, currentTarget: number): FatigueReport {
  const rows = repo.attemptPositions(playerId);
  const byPos = new Map<number, { n: number; ok: number }>();
  for (const a of rows) {
    if (!scored(a)) continue;
    const p = byPos.get(a.pos) ?? { n: 0, ok: 0 };
    p.n++;
    if (firstTryOK(a)) p.ok++;
    byPos.set(a.pos, p);
  }
  const curve = [...byPos.entries()]
    .filter(([, p]) => p.n >= 5)
    .map(([pos, p]) => ({ pos, n: p.n, firstTry: p.ok / p.n }))
    .sort((a, b) => a.pos - b.pos);
  let breakPos: number | null = null;
  for (const pt of curve) {
    if (pt.firstTry < LOWER) { breakPos = pt.pos; break; }
  }
  return { curve, breakPos, currentTarget, enoughData: curve.length >= 3 };
}
