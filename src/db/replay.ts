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
  attempts: { skill_code: string; given: string | null; correct: number; tries: number; dont_know: number; at: number }[],
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
      const u = update({ theta: c.theta, rd: c.rd, vol: c.volatility, childObs: c.n_obs }, decision.correct, decision.halveKChild, idle);
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
  const db = getDb();
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
      'SELECT skill_code, given, correct, tries, dont_know, at FROM attempt WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id',
    )
    .all(playerId) as {
    skill_code: string;
    given: string | null;
    correct: number;
    tries: number;
    dont_know: number;
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
