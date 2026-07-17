import 'server-only';
import { getDb } from './index';
import { SKILLS, seedTheta } from '@/skills';
import { update, updateDecision, SEED_RD, SEED_VOL, RATING_PERIOD_MS } from '@/model/elo';
import { aimFor } from '@/lib/fluency';
import { seedGradeFor } from '@/lib/onboarding';

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

// Pure core, exposed for testing: given the CHOSEN grade, tool rate, and ordered
// ledgers, produce the ability cache. No DB. `chosenYear` is the grade the child
// is in (what the parent picked); the start-from-below minus-one is applied HERE,
// once, via seedGradeFor — the single source of the grade→seed offset
// (fix-grade-source-of-truth §1). Every seeding decision below uses that one
// derived seed grade, so θ-seed and the fluency provisional never disagree.
export function computeAbility(
  chosenYear: number,
  toolRate: number | null,
  attempts: { skill_code: string; given: string | null; correct: number; tries: number; dont_know: number; warmup: number; at: number }[],
  sprints: { skill_code: string; correct: number; errors: number; duration_s: number; at: number }[],
): Map<string, Row> {
  const cache = new Map<string, Row>();
  const seedGrade = seedGradeFor(chosenYear);

  for (const s of SKILLS) {
    const component = s.mode === 'component';
    cache.set(s.code, {
      theta: seedTheta(seedGrade, s),
      rd: SEED_RD,
      volatility: SEED_VOL,
      n_obs: 2, // the seed is a rumour, not a measurement
      last_seen_at: null,
      rate: component ? aimFor(toolRate, seedGrade) * (seedGrade >= s.year ? PROVISIONAL_AT : PROVISIONAL_BELOW) : null,
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

// The model version the ability cache is built under. Bump when the seed or the
// θ/rd/vol update changes, so a deploy heals every existing cache.
//   1 = pre-Glicko θ-only k
//   2 = one-sided Glicko-2 (rd, volatility)  [instrumentation §3]
//   3 = start-from-below easy-floor seed      [replay-all so existing kids created
//        on the old grade seed pick up the easy floor]
//   4 = single-source grade seed (seedGradeFor): school_year now stores the CHOSEN
//        grade and the minus-one lives only in the seed function [replay-all so
//        every existing cache is rebuilt under the new offset, not the old baked-in
//        one; also corrects the real family's grades to the chosen values]
const MODEL_VERSION = 4;

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
    // One-time grade correction (model_v 4): under the old model school_year held
    // a date-offset SEED grade; from v4 it holds the CHOSEN grade (the grade the
    // child is in). Set the real family's known-correct chosen grades BEFORE the
    // replay-all re-seeds everyone via seedGradeFor. Scoped to the one real family
    // by its icon pair; a no-op on the test/fresh DBs. pig is in åk1, mouse åk2,
    // sailboat åk4 (all behind/entering the next grade after summer — start-from-
    // below seeds each one year lower).
    const realFam = db.prepare("SELECT id FROM family WHERE icon_display = 'turtle+ice_cream'").get() as { id: string } | undefined;
    if (realFam) {
      const setYear = db.prepare('UPDATE player SET school_year = ? WHERE family_id = ? AND icon = ?');
      for (const [icon, grade] of [['pig', 1], ['mouse', 2], ['sailboat', 4]] as [string, number][]) {
        setYear.run(grade, realFam.id, icon);
      }
    }

    const players = db.prepare('SELECT id FROM player').all() as { id: string }[];
    for (const p of players) replayOne(db, p.id);
    db.prepare("INSERT INTO meta (key, value) VALUES ('model_v', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(MODEL_VERSION));
  });
  tx();
}

// One-off manual placements — narrowly-scoped corrections for a specific child,
// each guarded by its OWN meta flag so it applies exactly once and never re-runs.
// (Unlike a MODEL_VERSION bump, this doesn't re-seed everyone, so it can't clobber
// a grade a parent has since changed by hand.)
export function runOneOffPlacements(db: ReturnType<typeof getDb>): void {
  const done = (key: string) => db.prepare('SELECT 1 FROM meta WHERE key = ?').get(key) != null;
  const mark = (key: string) => db.prepare("INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run(key);

  // Set one real child's grade once, by their CURRENT icon, and replay their
  // ledger over the new seed. Marks the flag ONLY once actually applied, so it
  // never fires on a DB where the child isn't there yet and never clobbers a grade
  // a parent later sets by hand.
  const place = (flag: string, icon: string, grade: number) => {
    if (done(flag)) return;
    const fam = db.prepare("SELECT id FROM family WHERE icon_display = 'turtle+ice_cream'").get() as { id: string } | undefined;
    const kid = fam && (db.prepare('SELECT id FROM player WHERE family_id = ? AND icon = ?').get(fam.id, icon) as { id: string } | undefined);
    if (kid) {
      db.prepare('UPDATE player SET school_year = ? WHERE id = ?').run(grade, kid.id);
      replayOne(db, kid.id);
      mark(flag);
    }
  };

  // Global session shortening + goal doubling (one-time, net-neutral). Sessions go
  // 20→10 items everywhere and every session-denominated goal doubles, so the
  // per-item earn-rate is unchanged. The reward COUNTS weight each session by
  // ceil(items/10), so the old 20-item sessions already count double — existing
  // cat progress and unlocks are preserved and this migration only needs to (a)
  // set every existing child's length to 10 and (b) double stored goal targets
  // (e.g. the family goal 30→60). Guarded — runs exactly once; a parent shortening
  // a child further later (e.g. dolphin→6) is not clobbered.
  if (!done('sessions_10_goals_x2_v1')) {
    db.prepare('UPDATE player SET session_target = 10').run();
    db.prepare('UPDATE family_goal SET target = target * 2').run();
    mark('sessions_10_goals_x2_v1');
  }

  // pig (now turtle) mastered year-1 but her åk1 seed locked year-2 — placed at
  // åk3 so year-2 becomes her served content. (Already applied.)
  place('placed_pig_ak3', 'pig', 3);
  // mouse climbed from behind-and-struggling to 95% mastery of åk2 and is now
  // coasting on it — placed at åk3 so he gets year-2 content and stays engaged.
  place('placed_mouse_ak3', 'mouse', 3);

  // Empty-run cleanup (bug-hunt-fluency follow-up). Two sprints finalized with
  // correct=0 AND errors=0 — no answer graded either way — minting a spurious
  // `measured` rate of 0 that read as "0/22 (mätt)" on a child's STRONGEST skill.
  // An empty run is not a measurement; it is the same non-event as an aborted
  // sprint (sprint.ts now refuses to write one going forward). Tombstone every
  // empty sprint already in the ledger and replay each affected child, so the
  // skill falls back to its provisional seed and reads "ej övad" again. Runs once
  // (own meta flag); a no-op on any DB that has no empty sprints.
  if (!done('voided_empty_sprints_v1')) {
    const affected = db
      .prepare('SELECT DISTINCT player_id FROM sprint WHERE correct = 0 AND errors = 0 AND voided_at IS NULL')
      .all() as { player_id: string }[];
    db.prepare("UPDATE sprint SET voided_at = ?, void_reason = 'empty_run' WHERE correct = 0 AND errors = 0 AND voided_at IS NULL")
      .run(Date.now());
    for (const { player_id } of affected) replayOne(db, player_id);
    mark('voided_empty_sprints_v1');
  }
}
