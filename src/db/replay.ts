import 'server-only';
import { getDb } from './index';
import { SKILLS, seedTheta } from '@/skills';
import { update, updateDecision, SEED_RD, SEED_VOL, RATING_PERIOD_MS } from '@/model/elo';
import { aimFor } from '@/lib/fluency';

// replay(playerId) — the most important function in the codebase (ui-lifecycle
// §1). `ability` is a cache; this rebuilds it for one player by seeding θ and
// the provisional rates from their årskurs, then folding the append-only
// ledgers (attempt, sprint, tool_rate) over that seed in `at` order. It is
// deterministic and idempotent: dropping the cache and replaying reproduces it
// exactly. Every ledger write is followed by a replay, so the cache and the
// replay can never diverge.
//
// A component whose year is at/below the child's is seeded fluent — a hair ABOVE
// the aim so the gate never turns on float equality (correction to a rate that
// was exactly 0.55×ceiling). One beyond their year is seeded clearly below it.
const PROVISIONAL_AT = 1.001;
const PROVISIONAL_BELOW = 0.6;

type Row = {
  theta: number;
  rd: number;
  volatility: number;
  n_obs: number;
  last_seen_at: number | null;
  rate: number | null;
  rate_state: 'unknown' | 'provisional' | 'measured';
};

// Pure core, exposed for testing: given the school year, tool rate, and ordered
// ledgers, produce the ability cache. No DB.
export function computeAbility(
  schoolYear: number,
  toolRate: number | null,
  attempts: { skill_code: string; given: string | null; correct: number; tries: number; dont_know: number; warmup: number; at: number }[],
  sprints: { skill_code: string; correct: number; errors: number; duration_s: number; at: number }[],
): Map<string, Row> {
  const cache = new Map<string, Row>();

  for (const s of SKILLS) {
    const component = s.mode === 'component';
    cache.set(s.code, {
      theta: seedTheta(schoolYear, s),
      rd: SEED_RD,
      volatility: SEED_VOL,
      n_obs: 2, // the seed is a rumour, not a measurement
      last_seen_at: null,
      rate: component ? aimFor(toolRate, schoolYear) * (schoolYear >= s.year ? PROVISIONAL_AT : PROVISIONAL_BELOW) : null,
      rate_state: component ? 'provisional' : 'unknown',
    });
  }

  for (const a of attempts) {
    const c = cache.get(a.skill_code);
    if (!c) continue; // a skill deleted from the graph: its evidence is skipped
    const decision = updateDecision(a.dont_know === 1 || a.given === null, a.tries, a.correct);
    if (decision.apply) {
      // Idle since this skill was last seen — grows RD (spacing affecting belief).
      const idle = c.last_seen_at == null ? 0 : (a.at - c.last_seen_at) / RATING_PERIOD_MS;
      // Warm-up success is halved, a warm-up miss is full — same rule as the fast
      // path, driven by the stored flag, so replay reproduces θ (onboarding §4).
      const halve = decision.halveKChild || (a.warmup === 1 && decision.correct === 1);
      const u = update({ theta: c.theta, rd: c.rd, vol: c.volatility, childObs: c.n_obs }, decision.correct, halve, idle);
      c.theta = u.theta;
      c.rd = u.rd;
      c.volatility = u.vol;
      c.n_obs += 1;
    }
    c.last_seen_at = a.at;
  }

  // A sprint is real evidence: the latest one replaces the provisional rate
  // outright (never averaged). A run below aim therefore drops the skill.
  for (const sp of sprints) {
    const c = cache.get(sp.skill_code);
    if (!c) continue;
    c.rate = (sp.correct * 60) / sp.duration_s;
    c.rate_state = 'measured';
  }

  return cache;
}

// Rebuild and persist the ability cache for one player. `override.schoolYear`
// re-seeds from a new year (årskurs change) without discarding evidence (§6.1).
export function replay(playerId: string, override?: { schoolYear?: number }): void {
  replayOne(getDb(), playerId, override);
}

// Same, but against a supplied db handle — so the boot-time migration can run it
// without going through getDb() (which would recurse during open()).
function replayOne(db: ReturnType<typeof getDb>, playerId: string, override?: { schoolYear?: number }): void {
  const player = db.prepare('SELECT school_year FROM player WHERE id = ?').get(playerId) as
    | { school_year: number }
    | undefined;
  if (!player) return;
  const schoolYear = override?.schoolYear ?? player.school_year;

  const toolRow = db
    .prepare('SELECT digits_per_min FROM tool_rate WHERE player_id = ? AND voided_at IS NULL ORDER BY at DESC, id DESC LIMIT 1')
    .get(playerId) as { digits_per_min: number } | undefined;
  const toolRate = toolRow ? toolRow.digits_per_min : null;

  const attempts = db
    .prepare(
      'SELECT skill_code, given, correct, tries, dont_know, warmup, at FROM attempt WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id',
    )
    .all(playerId) as {
    skill_code: string;
    given: string | null;
    correct: number;
    tries: number;
    dont_know: number;
    warmup: number;
    at: number;
  }[];

  const sprints = db
    .prepare(
      'SELECT skill_code, correct, errors, duration_s, at FROM sprint WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id',
    )
    .all(playerId) as { skill_code: string; correct: number; errors: number; duration_s: number; at: number }[];

  const cache = computeAbility(schoolYear, toolRate, attempts, sprints);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ability WHERE player_id = ?').run(playerId);
    const ins = db.prepare(
      `INSERT INTO ability (player_id, skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [code, r] of cache) {
      ins.run(playerId, code, r.theta, r.rd, r.volatility, r.n_obs, r.last_seen_at, r.rate, r.rate_state);
    }
  });
  tx();
}

// The model version the ability cache is built under. Bump when the θ/rd/vol
// update changes, so a deploy heals every existing cache (instrumentation §3).
const MODEL_VERSION = 2; // 1 = pre-Glicko θ-only k; 2 = one-sided Glicko-2 (rd, volatility)

// Run once per boot after schema + column migrations, using the open db handle
// (never getDb — that would recurse through open()). Idempotent via a meta flag:
//   1. canonicalise any legacy family rows and backfill icon_display, so the DB
//      UNIQUE genuinely lives on the canonical pair;
//   2. replay EVERY player, so pre-existing ability rows stop running incremental
//      updates on default rd/volatility and match a full replay exactly.
// On a fresh/empty DB both loops are no-ops and only the flag is written. The
// window where this heal is free closes the day the first real family signs up.
export function runStartupMigration(db: ReturnType<typeof getDb>): void {
  const cur = db.prepare("SELECT value FROM meta WHERE key = 'model_v'").get() as { value: string } | undefined;
  if (cur && Number(cur.value) >= MODEL_VERSION) return;

  const tx = db.transaction(() => {
    const fams = db.prepare('SELECT id, icon_pair, icon_display FROM family').all() as {
      id: string;
      icon_pair: string;
      icon_display: string;
    }[];
    for (const f of fams) {
      const canon = f.icon_pair.split('+').sort().join('+');
      const display = f.icon_display || f.icon_pair;
      if (canon !== f.icon_pair || display !== f.icon_display) {
        try {
          db.prepare('UPDATE family SET icon_pair = ?, icon_display = ? WHERE id = ?').run(canon, display, f.id);
        } catch {
          // two legacy families that canonicalise to the same pair — the very
          // dup this fix prevents going forward; leave both, don't crash boot.
        }
      }
    }
    const players = db.prepare('SELECT id FROM player').all() as { id: string }[];
    for (const p of players) replayOne(db, p.id);
    db.prepare("INSERT INTO meta (key, value) VALUES ('model_v', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(MODEL_VERSION));
  });
  tx();
}
