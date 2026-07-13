import 'server-only';
import { getDb } from '@/db';
import { SKILLS, ancestors } from '@/skills';
import { PROBE_SETS, type ProbeItem } from './probes';

// Quasi-experimental analyses (quasi-experimental.md). OFFLINE READERS ONLY: they
// read the ledger and produce reports. They change no θ, no selection, no unlock,
// and — like the probe — no path here is ever read by the model. Nothing is
// stored; everything is computed on demand, so there is no analysis output to
// "drop" (§8). None of this is an RCT and must never be called one (§7).

const DAY = 24 * 3600 * 1000;

// A probe item's family, for the crossover subscores (§3.1) — derived from its
// operation so we don't hand-tag 29 items.
const OP_FAMILY: Record<string, string> = {
  add: 'add',
  sub: 'sub',
  mul: 'multiplication',
  div: 'division',
  order: 'order',
  linear: 'linear',
  fraction: 'fractions',
};
export function probeFamily(item: ProbeItem): string {
  return OP_FAMILY[item.operation] ?? item.operation;
}

type ProbeRow = { probe_set: string; item_ref: string; correct: number; administered_at: number };

// Group a set's probe rows into administrations — rows recorded within an hour of
// each other are one sitting. Returns, per administration, the mean correctness
// (the probe score) and its time.
type Admin = { at: number; score: number; byFamily: Map<string, { correct: number; n: number }>; n: number };
function administrations(rows: ProbeRow[]): Admin[] {
  const sorted = [...rows].sort((a, b) => a.administered_at - b.administered_at);
  const out: Admin[] = [];
  let cur: ProbeRow[] = [];
  const flush = () => {
    if (!cur.length) return;
    const byFamily = new Map<string, { correct: number; n: number }>();
    let correct = 0;
    for (const r of cur) {
      correct += r.correct;
      const item = (PROBE_SETS[r.probe_set] ?? []).find((i) => i.ref === r.item_ref);
      const fam = item ? probeFamily(item) : 'unknown';
      const f = byFamily.get(fam) ?? { correct: 0, n: 0 };
      f.correct += r.correct;
      f.n += 1;
      byFamily.set(fam, f);
    }
    out.push({ at: cur[cur.length - 1].administered_at, score: correct / cur.length, byFamily, n: cur.length });
    cur = [];
  };
  for (const r of sorted) {
    if (cur.length && r.administered_at - cur[cur.length - 1].administered_at > 3600 * 1000) flush();
    cur.push(r);
  }
  flush();
  return out;
}

function probeRows(playerId: string, probeSet?: string): ProbeRow[] {
  const db = getDb();
  return (
    probeSet
      ? db.prepare('SELECT probe_set, item_ref, correct, administered_at FROM probe WHERE player_id = ? AND probe_set = ? ORDER BY administered_at').all(playerId, probeSet)
      : db.prepare('SELECT probe_set, item_ref, correct, administered_at FROM probe WHERE player_id = ? ORDER BY administered_at').all(playerId)
  ) as ProbeRow[];
}

// first-attempt (tries = 1) practice items in [from, to). Warm-up items excluded
// (onboarding-ramp §4) — they aren't honest dose.
function doseBetween(playerId: string, from: number, to: number): number {
  return (getDb().prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0 AND tries = 1 AND at >= ? AND at < ?').get(playerId, from, to) as { c: number }).c;
}

// Least-squares slope of y over x (0 if <2 points or no x-variance).
function slope(pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return 0;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  return den === 0 ? 0 : num / den;
}

// ── §4 Dose-response ────────────────────────────────────────────────────────
// Per probe interval: dose (first-attempt items practised) vs response (probe
// score change). Always reported beside the calendar-time-only model (§4.2, §8):
// if dose predicts gain better than elapsed days, that's the result. Consistent
// with reverse causation on its own (§4.3) — never presented as causal alone.
export type DosePoint = { dose: number; response: number; days: number };
export function doseResponse(playerId: string): {
  points: DosePoint[];
  doseSlope: number;
  timeSlope: number;
  doseBeatsTime: boolean;
} {
  const admins = administrations(probeRows(playerId, 'arith_v1'));
  const points: DosePoint[] = [];
  for (let i = 1; i < admins.length; i++) {
    points.push({
      dose: doseBetween(playerId, admins[i - 1].at, admins[i].at),
      response: admins[i].score - admins[i - 1].score,
      days: (admins[i].at - admins[i - 1].at) / DAY,
    });
  }
  const doseSlope = slope(points.map((p) => ({ x: p.dose, y: p.response })));
  const timeSlope = slope(points.map((p) => ({ x: p.days, y: p.response })));
  // Compare residual fit: does dose explain more variance than time alone?
  const r2 = (xs: { x: number; y: number }[], m: number) => {
    if (xs.length < 2) return 0;
    const my = xs.reduce((s, p) => s + p.y, 0) / xs.length;
    const b = my - m * (xs.reduce((s, p) => s + p.x, 0) / xs.length);
    let ssr = 0;
    let sst = 0;
    for (const p of xs) {
      ssr += (p.y - (m * p.x + b)) ** 2;
      sst += (p.y - my) ** 2;
    }
    return sst === 0 ? 0 : 1 - ssr / sst;
  };
  const doseR2 = r2(points.map((p) => ({ x: p.dose, y: p.response })), doseSlope);
  const timeR2 = r2(points.map((p) => ({ x: p.days, y: p.response })), timeSlope);
  return { points, doseSlope, timeSlope, doseBeatsTime: doseR2 > timeR2 };
}

// ── §2 Staggered baseline ───────────────────────────────────────────────────
// "Before meaningful practice" is computed post-hoc from ledger volume, never by
// withholding (§2.3, §8): the baseline window ends at the first administration
// after which cumulative first-attempt practice crossed a threshold.
const PRACTICE_ONSET = 40; // first-attempt items that mark "meaningful practice began" (pre-registered)
export function staggeredBaseline(playerId: string): {
  baselineSlope: number;
  practiceSlope: number;
  contrast: number;
  baselinePoints: number;
  enoughBaseline: boolean;
} {
  const admins = administrations(probeRows(playerId, 'arith_v1'));
  if (!admins.length) return { baselineSlope: 0, practiceSlope: 0, contrast: 0, baselinePoints: 0, enoughBaseline: false };
  const start = admins[0].at;
  // onset = first administration by which cumulative practice since start >= threshold
  let onsetIdx = admins.length;
  for (let i = 0; i < admins.length; i++) {
    if (doseBetween(playerId, start, admins[i].at) >= PRACTICE_ONSET) {
      onsetIdx = i;
      break;
    }
  }
  const toPts = (a: Admin[]) => a.map((x) => ({ x: (x.at - start) / DAY, y: x.score }));
  const baseline = admins.slice(0, onsetIdx + 1); // through onset
  const practice = admins.slice(onsetIdx);
  const baselineSlope = slope(toPts(baseline));
  const practiceSlope = slope(toPts(practice));
  return {
    baselineSlope,
    practiceSlope,
    contrast: practiceSlope - baselineSlope,
    baselinePoints: baseline.length,
    enoughBaseline: baseline.length >= 2, // §2.2 — a two-point baseline, or it's inadmissible
  };
}

// ── §3 Untrained-skill crossover ────────────────────────────────────────────
// Trained vs untrained probe subscore change in the same child-window. A family
// is a clean control only for components it doesn't SHARE with trained skills
// (§3.3) — shared components are flagged and the control is marked leaky, not
// claimed clean.
const TRAINED_THRESHOLD = 15; // first-attempt items in the window (pre-registered)
export type CrossoverRow = { family: string; trained: boolean; scoreChange: number; leaky: boolean };
export function crossover(playerId: string): CrossoverRow[] {
  const admins = administrations(probeRows(playerId, 'arith_v1'));
  if (admins.length < 2) return [];
  const first = admins[0];
  const last = admins[admins.length - 1];

  // practice volume per family across the window
  const rows = getDb().prepare('SELECT skill_code, COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0 AND tries = 1 AND at >= ? AND at < ? GROUP BY skill_code').all(playerId, first.at, last.at) as { skill_code: string; c: number }[];
  const familyVolume = new Map<string, number>();
  const trainedComponents = new Set<string>();
  for (const r of rows) {
    const s = SKILLS.find((x) => x.code === r.skill_code);
    if (!s) continue;
    familyVolume.set(s.family, (familyVolume.get(s.family) ?? 0) + r.c);
    if (r.c > 0) {
      if (s.mode === 'component') trainedComponents.add(s.code);
      for (const a of ancestors(s.code)) trainedComponents.add(a); // components feeding a trained compound
    }
  }

  const out: CrossoverRow[] = [];
  for (const fam of new Set([...first.byFamily.keys(), ...last.byFamily.keys()])) {
    const f0 = first.byFamily.get(fam);
    const f1 = last.byFamily.get(fam);
    if (!f0 || !f1) continue;
    const trained = (familyVolume.get(fam) ?? 0) >= TRAINED_THRESHOLD;
    // leaky if any component of this family's skills is a trained component
    const famSkills = SKILLS.filter((s) => s.family === fam);
    const leaky = !trained && famSkills.some((s) => trainedComponents.has(s.code) || [...ancestors(s.code)].some((a) => trainedComponents.has(a)));
    out.push({ family: fam, trained, scoreChange: f1.correct / f1.n - f0.correct / f0.n, leaky });
  }
  return out;
}

// ── §5 The displacement anti-metric (the one the ethics require) ─────────────
// Every number here you want LOW and FLAT (§5.2). It has no target and no
// optimisation path — its only automated output is a single calm ceiling alarm
// (§5.3). Steady moderate use is the success state; growth is the thing to notice.
function hourInStockholm(ts: number): number {
  // hourCycle h23 (not hour12:false, which can render midnight as "24") so the
  // hour is always 0–23 and the late-evening flag isn't tripped at midnight.
  const h = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(ts);
  return parseInt(h, 10) % 24;
}
export type Displacement = {
  weekly: { weekStart: number; sessions: number }[];
  lateEveningSessions: number; // started >= 21:00, a proxy for "instead of sleep"
  enTillRate: number; // a RISING rate is a signal to look, not a success
  sessionsLast7: number;
  alarm: boolean; // > 2/day averaged over a week (motivation §4 cap)
};
export function displacement(playerId: string, now: number): Displacement {
  const db = getDb();
  const runs = (db.prepare('SELECT started_at FROM session_run WHERE player_id = ? ORDER BY started_at').all(playerId) as { started_at: number }[]).map((r) => r.started_at);

  // weekly buckets over the last 12 weeks, plotted over time so a rise is visible
  const weekMs = 7 * DAY;
  const weekly: { weekStart: number; sessions: number }[] = [];
  const startOfThisWeek = now - (now % weekMs);
  for (let w = 11; w >= 0; w--) {
    const s = startOfThisWeek - w * weekMs;
    weekly.push({ weekStart: s, sessions: runs.filter((t) => t >= s && t < s + weekMs).length });
  }

  let lateEveningSessions = 0;
  for (const t of runs) if (hourInStockholm(t) >= 21) lateEveningSessions++;

  const starts = (db.prepare("SELECT COUNT(*) c FROM usage_event WHERE player_id = ? AND kind = 'session_started'").get(playerId) as { c: number }).c;
  const enTill = (db.prepare("SELECT COUNT(*) c FROM usage_event WHERE player_id = ? AND kind = 'en_till'").get(playerId) as { c: number }).c;

  const sessionsLast7 = runs.filter((t) => t >= now - 7 * DAY).length;
  return {
    weekly,
    lateEveningSessions,
    enTillRate: starts ? enTill / starts : 0,
    sessionsLast7,
    alarm: sessionsLast7 > 14, // 2/day averaged over a week — a smoke detector, not a scold
  };
}
