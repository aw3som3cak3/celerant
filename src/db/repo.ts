import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from './index';
import { replay } from './replay';
import { update, updateDecision, RATING_PERIOD_MS } from '@/model/elo';
import { SKILLS, ancestors } from '@/skills';
import { aimFor } from '@/lib/fluency';
import { doseResponse, staggeredBaseline, crossover, displacement } from '@/lib/analysis';

// Incremental cache update for one resolved attempt — the fast path. Attempts
// are appended in non-decreasing `at`, and attempts touch only θ/n_obs/last_seen
// while sprints touch only rate, so folding them incrementally lands on exactly
// what a full replay would produce. The equality test guards this (ui-lifecycle
// §7); a full replay() is reserved for invalidation (void, reassign, årskurs,
// tool-rate) where the whole fold must be redone.
function applyAttemptToCache(
  playerId: string,
  skillCode: string,
  given: string | null,
  tries: number,
  correct: number,
  dontKnow: boolean,
  warmup: number,
  at: number,
): void {
  const db = getDb();
  const ab = db
    .prepare('SELECT theta, rd, volatility, n_obs, last_seen_at FROM ability WHERE player_id = ? AND skill_code = ?')
    .get(playerId, skillCode) as
    | { theta: number; rd: number; volatility: number; n_obs: number; last_seen_at: number | null }
    | undefined;
  if (!ab) return; // a skill not in the graph: no cache row to update
  const decision = updateDecision(dontKnow || given === null, tries, correct);
  let theta = ab.theta;
  let rd = ab.rd;
  let vol = ab.volatility;
  let nObs = ab.n_obs;
  if (decision.apply) {
    // Same idle-inflation as replay, from the stored last_seen — so this fast
    // path stays byte-for-byte identical to a full replay (ui-lifecycle §7).
    const idle = ab.last_seen_at == null ? 0 : (at - ab.last_seen_at) / RATING_PERIOD_MS;
    // Warm-up: a correct answer on an easy opener is uninformative (she was meant
    // to get it), so halve it; a warm-up MISS is surprising and updates fully
    // (onboarding-ramp §4).
    const halve = decision.halveKChild || (warmup === 1 && decision.correct === 1);
    const u = update({ theta, rd, vol, childObs: nObs }, decision.correct, halve, idle);
    theta = u.theta;
    rd = u.rd;
    vol = u.vol;
    nObs += 1;
  }
  db.prepare('UPDATE ability SET theta = ?, rd = ?, volatility = ?, n_obs = ?, last_seen_at = ? WHERE player_id = ? AND skill_code = ?')
    .run(theta, rd, vol, nObs, at, playerId, skillCode);
}

// --- meta ------------------------------------------------------------------

export function getMeta(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? r.value : null;
}
export function setMeta(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

// --- family ----------------------------------------------------------------

export type FamilyRow = {
  id: string;
  icon_pair: string; // canonical (sorted)
  icon_display: string; // entered order
  pin_hash: string;
  parent_hash: string;
  created_at: number;
  deleted_at: number | null;
};

// The canonical key for a pair: sorted, so "a+b" and "b+a" collapse to one. The
// DB UNIQUE on icon_pair then makes duplicate families impossible at the storage
// layer, not by an app-layer convention that one forgetful caller can bypass.
function canonPair(iconPair: string): string {
  return iconPair.split('+').sort().join('+');
}

// Stores the canonical pair as the unique key and the entered order for display.
export function createFamily(iconPair: string, pinHash: string, parentHash: string, now: number): string {
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO family (id, icon_pair, icon_display, pin_hash, parent_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, canonPair(iconPair), iconPair, pinHash, parentHash, now);
  return id;
}

export function familyById(id: string): FamilyRow | undefined {
  return getDb().prepare('SELECT * FROM family WHERE id = ? AND deleted_at IS NULL').get(id) as FamilyRow | undefined;
}

// A single canonical lookup — order-independent by construction.
export function familyByIcons(a: string, b: string): FamilyRow | undefined {
  return getDb()
    .prepare('SELECT * FROM family WHERE icon_pair = ? AND deleted_at IS NULL')
    .get(canonPair(`${a}+${b}`)) as FamilyRow | undefined;
}

// Icon pairs only — never player counts (ui-lifecycle §5.1). Returns the ENTERED
// order (what the family made), for the login chips.
export function listFamilyIconPairs(): string[] {
  return (getDb().prepare('SELECT icon_display, icon_pair FROM family WHERE deleted_at IS NULL').all() as {
    icon_display: string;
    icon_pair: string;
  }[]).map((r) => r.icon_display || r.icon_pair);
}

export function updateFamilyPin(id: string, pinHash: string): void {
  getDb().prepare('UPDATE family SET pin_hash = ? WHERE id = ?').run(pinHash, id);
}
export function updateFamilyParentPin(id: string, parentHash: string): void {
  getDb().prepare('UPDATE family SET parent_hash = ? WHERE id = ?').run(parentHash, id);
}
export function updateFamilyIcons(id: string, iconPair: string): void {
  getDb().prepare('UPDATE family SET icon_pair = ?, icon_display = ? WHERE id = ?').run(canonPair(iconPair), iconPair, id);
}
export function softDeleteFamily(id: string, now: number): void {
  getDb().prepare('UPDATE family SET deleted_at = ? WHERE id = ?').run(now, id);
}

// The only place a ledger row is truly deleted (§5.1): a purge cascades.
export function hardDeleteFamily(id: string): void {
  const db = getDb();
  const players = (db.prepare('SELECT id FROM player WHERE family_id = ?').all(id) as { id: string }[]).map((p) => p.id);
  const tx = db.transaction(() => {
    for (const pid of players) {
      db.prepare('DELETE FROM attempt WHERE player_id = ?').run(pid);
      db.prepare('DELETE FROM sprint WHERE player_id = ?').run(pid);
      db.prepare('DELETE FROM tool_rate WHERE player_id = ?').run(pid);
      db.prepare('DELETE FROM ability WHERE player_id = ?').run(pid);
    }
    db.prepare('DELETE FROM player WHERE family_id = ?').run(id);
    db.prepare('DELETE FROM session WHERE family_id = ?').run(id);
    db.prepare('DELETE FROM family WHERE id = ?').run(id);
  });
  tx();
}

// --- player ----------------------------------------------------------------

export type PlayerRow = {
  id: string;
  family_id: string;
  icon: string;
  school_year: number;
  stretch: number;
  session_target: number;
  created_at: number;
  archived_at: number | null;
};

export function createPlayer(familyId: string, icon: string, schoolYear: number, now: number): string {
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO player (id, family_id, icon, school_year, session_target, created_at) VALUES (?, ?, ?, ?, 10, ?)')
    .run(id, familyId, icon, schoolYear, now); // sessions are 10 items globally; a parent can shorten further
  replay(id); // seed the ability cache from årskurs
  return id;
}

export function playerById(id: string): PlayerRow | undefined {
  return getDb().prepare('SELECT * FROM player WHERE id = ?').get(id) as PlayerRow | undefined;
}

export function playersInFamily(familyId: string, includeArchived = false): PlayerRow[] {
  const sql = includeArchived
    ? 'SELECT * FROM player WHERE family_id = ? ORDER BY created_at'
    : 'SELECT * FROM player WHERE family_id = ? AND archived_at IS NULL ORDER BY created_at';
  return getDb().prepare(sql).all(familyId) as PlayerRow[];
}

// The entire authorisation model (§6.6): a player must belong to the session's
// family. player_id is a request parameter, never session state.
export function playerBelongsToFamily(playerId: string, familyId: string): boolean {
  const r = getDb().prepare('SELECT 1 FROM player WHERE id = ? AND family_id = ?').get(playerId, familyId);
  return !!r;
}

export function iconsUsedInFamily(familyId: string): Set<string> {
  return new Set(
    (getDb().prepare('SELECT icon FROM player WHERE family_id = ?').all(familyId) as { icon: string }[]).map(
      (r) => r.icon,
    ),
  );
}

export function updatePlayerIcon(id: string, icon: string): void {
  getDb().prepare('UPDATE player SET icon = ? WHERE id = ?').run(icon, id);
}
export function updatePlayerYear(id: string, schoolYear: number): void {
  getDb().prepare('UPDATE player SET school_year = ? WHERE id = ?').run(schoolYear, id);
  replay(id, { schoolYear }); // re-seed and replay; evidence is preserved (§6.1)
}
// "svårare" toggle (motivation §3.2). A setting, not evidence — no replay.
export function setStretch(id: string, on: boolean): void {
  getDb().prepare('UPDATE player SET stretch = ? WHERE id = ?').run(on ? 1 : 0, id);
}
// Items per session — shorter for a young child, so finishing (and today's dot)
// is actually reachable. A setting, not evidence; affects only future sessions.
export function setSessionTarget(id: string, target: number): void {
  const clamped = Math.max(4, Math.min(30, Math.round(target)));
  getDb().prepare('UPDATE player SET session_target = ? WHERE id = ?').run(clamped, id);
}
export function archivePlayer(id: string, now: number): void {
  getDb().prepare('UPDATE player SET archived_at = ? WHERE id = ?').run(now, id);
}
export function restorePlayer(id: string): void {
  getDb().prepare('UPDATE player SET archived_at = NULL WHERE id = ?').run(id);
}

// --- ability (cache; read-only from outside — only replay writes it) -------

export type AbilityRow = {
  skill_code: string;
  theta: number;
  rd: number;
  volatility: number;
  n_obs: number;
  last_seen_at: number | null;
  rate: number | null;
  rate_state: 'unknown' | 'provisional' | 'measured';
};

export function abilities(playerId: string): Map<string, AbilityRow> {
  const rows = getDb()
    .prepare('SELECT skill_code, theta, rd, volatility, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ?')
    .all(playerId) as AbilityRow[];
  return new Map(rows.map((r) => [r.skill_code, r]));
}

// --- attempt ledger --------------------------------------------------------

export type AppendAttempt = {
  playerId: string;
  skillCode: string;
  itemJson: string;
  given: string | null;
  correct: number;
  tries: number;
  dontKnow: boolean;
  warmup?: boolean;
  latencyMs: number;
  at: number;
};

// Append to the ledger, then rebuild the cache. Item generation itself writes
// nothing (§6.7); this is the only write on the answer path.
export function appendAttempt(a: AppendAttempt): number {
  const warmup = a.warmup ? 1 : 0;
  const info = getDb()
    .prepare(
      `INSERT INTO attempt (player_id, skill_code, item_json, given, correct, tries, dont_know, warmup, latency_ms, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.playerId, a.skillCode, a.itemJson, a.given, a.correct, a.tries, a.dontKnow ? 1 : 0, warmup, a.latencyMs, a.at);
  applyAttemptToCache(a.playerId, a.skillCode, a.given, a.tries, a.correct, a.dontKnow, warmup, a.at); // fast path, not full replay
  return Number(info.lastInsertRowid);
}

export function voidAttempt(id: number, reason: string, now: number): string | null {
  const db = getDb();
  const row = db.prepare('SELECT player_id FROM attempt WHERE id = ?').get(id) as { player_id: string } | undefined;
  if (!row) return null;
  db.prepare('UPDATE attempt SET voided_at = ?, void_reason = ? WHERE id = ?').run(now, reason, id);
  replay(row.player_id);
  return row.player_id;
}

export function voidRange(playerId: string, lo: number, hi: number, reason: string, now: number): void {
  getDb()
    .prepare('UPDATE attempt SET voided_at = ?, void_reason = ? WHERE player_id = ? AND id BETWEEN ? AND ? AND voided_at IS NULL')
    .run(now, reason, playerId, lo, hi);
  replay(playerId);
}

// The only UPDATE permitted on a ledger's ownership (§6.2): change owner, never
// content, then replay both children.
export function reassignAttempts(lo: number, hi: number, fromPlayer: string, toPlayer: string): void {
  const db = getDb();
  db.prepare('UPDATE attempt SET player_id = ? WHERE id BETWEEN ? AND ? AND player_id = ?').run(toPlayer, lo, hi, fromPlayer);
  replay(fromPlayer);
  replay(toPlayer);
}

// --- sprint & tool_rate ledgers --------------------------------------------

export function appendSprint(
  playerId: string,
  skillCode: string,
  durationS: number,
  correct: number,
  errors: number,
  now: number,
): void {
  getDb()
    .prepare('INSERT INTO sprint (player_id, skill_code, duration_s, correct, errors, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(playerId, skillCode, durationS, correct, errors, now);
  // Fast path: the latest sprint replaces this skill's rate outright (measured).
  getDb()
    .prepare("UPDATE ability SET rate = ?, rate_state = 'measured' WHERE player_id = ? AND skill_code = ?")
    .run((correct * 60) / durationS, playerId, skillCode);
}

export function appendToolRate(playerId: string, digitsPerMin: number, now: number): void {
  getDb()
    .prepare('INSERT INTO tool_rate (player_id, digits_per_min, at) VALUES (?, ?, ?)')
    .run(playerId, digitsPerMin, now);
  // A new ceiling invalidates every provisional (aim-derived) rate — rare, so a
  // full replay is the honest, correct move.
  replay(playerId);
}

export function latestToolRate(playerId: string): number | null {
  const r = getDb()
    .prepare('SELECT digits_per_min FROM tool_rate WHERE player_id = ? AND voided_at IS NULL ORDER BY at DESC, id DESC LIMIT 1')
    .get(playerId) as { digits_per_min: number } | undefined;
  return r ? r.digits_per_min : null;
}

export type SprintRow = { duration_s: number; correct: number; errors: number; at: number };
export function sprintsForSkill(playerId: string, skillCode: string, limit: number): SprintRow[] {
  return getDb()
    .prepare(
      'SELECT duration_s, correct, errors, at FROM sprint WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL ORDER BY at DESC LIMIT ?',
    )
    .all(playerId, skillCode, limit) as SprintRow[];
}

// --- reads for selection & parent view -------------------------------------

export function recentAttemptSkillCodes(playerId: string, limit: number): string[] {
  return (
    getDb()
      .prepare('SELECT skill_code FROM attempt WHERE player_id = ? AND voided_at IS NULL ORDER BY id DESC LIMIT ?')
      .all(playerId, limit) as { skill_code: string }[]
  ).map((r) => r.skill_code);
}

export function recentFirstTryAccuracy(playerId: string, skillCode: string, n: number): { acc: number; count: number } {
  const rows = getDb()
    .prepare('SELECT correct, tries FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL ORDER BY id DESC LIMIT ?')
    .all(playerId, skillCode, n) as { correct: number; tries: number }[];
  if (rows.length === 0) return { acc: 0, count: 0 };
  return { acc: rows.filter((r) => r.correct === 1 && r.tries === 1).length / rows.length, count: rows.length };
}

export function recentOverallFirstTryAccuracy(playerId: string, n: number): number {
  const rows = getDb()
    .prepare('SELECT correct, tries FROM attempt WHERE player_id = ? AND voided_at IS NULL ORDER BY id DESC LIMIT ?')
    .all(playerId, n) as { correct: number; tries: number }[];
  if (rows.length === 0) return 1.0;
  return rows.filter((r) => r.correct === 1 && r.tries === 1).length / rows.length;
}

// Share of the last `n` real (non-warm-up) items the child was served at p ≥ 0.85
// — the "trivial proportion" (fix-reach-up.md §3). Direct evidence of being served
// below one's edge: read from the logged score vector, the p the selector actually
// predicted at serve time, so it measures what was shown, not a recomputed guess.
// Drives reach-up firmness. 0 with no history (a new player is not "coasting").
export function recentTrivialProportion(playerId: string, n: number): number {
  const rows = getDb()
    .prepare(
      "SELECT skill_code, item_json FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0 ORDER BY id DESC LIMIT ?",
    )
    .all(playerId, n) as { skill_code: string; item_json: string }[];
  let trivial = 0;
  let total = 0;
  for (const r of rows) {
    try {
      const j = JSON.parse(r.item_json) as { scores?: { scores?: { code: string; p: number }[] } };
      const sc = j.scores?.scores?.find((s) => s.code === r.skill_code);
      if (sc && typeof sc.p === 'number') {
        total++;
        if (sc.p >= 0.85) trivial++;
      }
    } catch {
      // ignore an unparsable row
    }
  }
  return total === 0 ? 0 : trivial / total;
}

export function totalAttempts(playerId: string): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL')
    .get(playerId) as { c: number };
  return r.c;
}

export function attemptsLast7Days(playerId: string, now: number): number {
  const cutoff = now - 7 * 24 * 3600 * 1000;
  const r = getDb()
    .prepare('SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL AND at >= ?')
    .get(playerId, cutoff) as { c: number };
  return r.c;
}

// Recent attempts across a family, newest first — the raw material for the
// parent's "det var fel barn" reassignment (§6.2). Ids let the parent pick a
// range; icon labels the runs without ever naming a child.
export function recentFamilyAttempts(
  familyId: string,
  limit: number,
): { id: number; player_id: string; icon: string; at: number }[] {
  return getDb()
    .prepare(
      `SELECT a.id, a.player_id, p.icon, a.at
       FROM attempt a JOIN player p ON p.id = a.player_id
       WHERE p.family_id = ? AND a.voided_at IS NULL
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(familyId, limit) as { id: number; player_id: string; icon: string; at: number }[];
}

export function exportFamily(familyId: string): unknown {
  const db = getDb();
  const players = db.prepare('SELECT * FROM player WHERE family_id = ?').all(familyId) as PlayerRow[];
  const ids = players.map((p) => p.id);
  const inClause = ids.map(() => '?').join(',') || 'NULL';
  const attempts = ids.length ? db.prepare(`SELECT * FROM attempt WHERE player_id IN (${inClause}) ORDER BY id`).all(...ids) : [];
  const sprints = ids.length ? db.prepare(`SELECT * FROM sprint WHERE player_id IN (${inClause}) ORDER BY id`).all(...ids) : [];
  const toolRates = ids.length ? db.prepare(`SELECT * FROM tool_rate WHERE player_id IN (${inClause}) ORDER BY id`).all(...ids) : [];
  // The event ledgers (instrumentation.md §5): the analysis substrate must carry
  // them, or the questions in §4 can never be asked off-box. The `ability` cache
  // is deliberately NOT exported — it is derivable; recompute it offline.
  const goalEvents = db.prepare('SELECT * FROM goal_event WHERE family_id = ? ORDER BY id').all(familyId);
  const usageEvents = ids.length
    ? db.prepare(`SELECT * FROM usage_event WHERE player_id IN (${inClause}) ORDER BY id`).all(...ids)
    : [];
  // Evidence layer (evidence-and-theses.md §5): the probe rows, the pre-registered
  // theses, and the derived application signal — the analysis substrate for the
  // transfer claim. Still no ability cache: derivable, recompute offline.
  const probes = ids.length ? db.prepare(`SELECT * FROM probe WHERE player_id IN (${inClause}) ORDER BY id`).all(...ids) : [];
  const prereg = preregRows();
  const now = Date.now();
  // Quasi-experimental analyses (quasi-experimental.md): offline reports computed
  // from the ledger, per player. Dose-response is always carried beside its
  // time-only comparison; displacement is the ethics safeguard, not an engagement
  // metric. None of this is stored or read by the model.
  const analysis = players.map((p) => ({
    playerId: p.id,
    applicationSignal: applicationSignal(p.id),
    doseResponse: doseResponse(p.id),
    staggeredBaseline: staggeredBaseline(p.id),
    crossover: crossover(p.id),
    displacement: displacement(p.id, now),
  }));
  return {
    family: familyById(familyId),
    players,
    attempts,
    sprints,
    toolRates,
    goalEvents,
    usageEvents,
    probes,
    prereg,
    analysis,
  };
}

// --- pending items (ephemeral scratch: the served answer key, §6.7) ---------

export type PendingItemRow = {
  item_id: string;
  player_id: string;
  skill_code: string;
  prompt: string;
  answer: string;
  steps_json: string;
  seed: number;
  scores_json: string;
  served_at: number;
  tries: number;
  warmup: number;
  first_wrong: string | null;
};

export function savePendingItem(p: {
  itemId: string;
  playerId: string;
  skillCode: string;
  prompt: string;
  answer: string;
  stepsJson: string;
  seed: number;
  scoresJson: string;
  servedAt: number;
  warmup?: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO pending_item
       (item_id, player_id, skill_code, prompt, answer, steps_json, seed, scores_json, served_at, tries, warmup, first_wrong)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`,
    )
    .run(p.itemId, p.playerId, p.skillCode, p.prompt, p.answer, p.stepsJson, p.seed, p.scoresJson, p.servedAt, p.warmup ? 1 : 0);
}

// Completed sessions so far (for the warm-up ramp fade, onboarding-ramp §3):
// finished sessions only, read from session_run — not a flag, so it survives replay.
export function completedSessionCount(playerId: string): number {
  return (
    getDb()
      .prepare('SELECT COUNT(*) c FROM session_run WHERE player_id = ? AND ended_at IS NOT NULL AND completed >= target')
      .get(playerId) as { c: number }
  ).c;
}

// Highest per-skill volatility — the "still swinging" signal that holds a new
// player at the gentler target until his wins are steady (start-from-below §4).
export function maxVolatility(playerId: string): number {
  const r = getDb().prepare('SELECT MAX(volatility) v FROM ability WHERE player_id = ?').get(playerId) as { v: number | null };
  return r.v ?? 0.06;
}

// Did the last two resolved items both miss? (start-from-below §5): two in a row
// in the opening means the floor was too high — retreat to easier ground.
export function lastTwoMissed(playerId: string): boolean {
  const rows = getDb()
    .prepare('SELECT correct FROM attempt WHERE player_id = ? AND voided_at IS NULL ORDER BY id DESC LIMIT 2')
    .all(playerId) as { correct: number }[];
  return rows.length === 2 && rows.every((r) => r.correct === 0);
}
export function getPendingItem(itemId: string): PendingItemRow | undefined {
  return getDb().prepare('SELECT * FROM pending_item WHERE item_id = ?').get(itemId) as PendingItemRow | undefined;
}
// A first miss keeps the item alive for one retry (nothing recorded yet).
export function markPendingRetry(itemId: string, firstWrong: string): void {
  getDb().prepare('UPDATE pending_item SET tries = 1, first_wrong = ? WHERE item_id = ?').run(firstWrong, itemId);
}
export function deletePendingItem(itemId: string): void {
  getDb().prepare('DELETE FROM pending_item WHERE item_id = ?').run(itemId);
}
// Reap items that were served but never resolved (tab closed, etc.).
export function cleanupPendingItems(olderThan: number): void {
  getDb().prepare('DELETE FROM pending_item WHERE served_at < ?').run(olderThan);
}

// --- session ---------------------------------------------------------------

export function createSession(tokenHash: string, familyId: string, parent: boolean, now: number, expiresAt: number): void {
  getDb()
    .prepare('INSERT INTO session (token_hash, family_id, parent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(tokenHash, familyId, parent ? 1 : 0, now, expiresAt);
}

export type SessionRow = { token_hash: string; family_id: string; parent: number; expires_at: number };
export function sessionByTokenHash(tokenHash: string): SessionRow | undefined {
  return getDb().prepare('SELECT * FROM session WHERE token_hash = ?').get(tokenHash) as SessionRow | undefined;
}
export function deleteSession(tokenHash: string): void {
  getDb().prepare('DELETE FROM session WHERE token_hash = ?').run(tokenHash);
}

// --- motivation layer (strictly downstream; replay() never reads these) -----

export type SessionRunRow = {
  id: number;
  player_id: string;
  target: number;
  completed: number;
  ended_at: number | null;
  ended_early: number;
  started_at: number;
};

export function createSessionRun(playerId: string, target: number, now: number): number {
  const info = getDb()
    .prepare('INSERT INTO session_run (player_id, target, started_at) VALUES (?, ?, ?)')
    .run(playerId, target, now);
  return Number(info.lastInsertRowid);
}
// The most recent still-open session for a player, if it started within the
// resume window (#3). Lets the client continue an interrupted session — its
// already-completed items are banked in `completed` — instead of losing it to a
// fresh start. Never returns a completed/early-ended run (ended_at IS NOT NULL).
export function openSessionRun(playerId: string, sinceMs: number): { id: number; target: number; completed: number } | undefined {
  return getDb()
    .prepare('SELECT id, target, completed FROM session_run WHERE player_id = ? AND ended_at IS NULL AND started_at >= ? ORDER BY started_at DESC, id DESC LIMIT 1')
    .get(playerId, sinceMs) as { id: number; target: number; completed: number } | undefined;
}

export function sessionRunById(id: number): SessionRunRow | undefined {
  return getDb().prepare('SELECT * FROM session_run WHERE id = ?').get(id) as SessionRunRow | undefined;
}
export function bumpSessionRun(id: number, now: number): SessionRunRow {
  const db = getDb();
  db.prepare('UPDATE session_run SET completed = completed + 1 WHERE id = ? AND ended_at IS NULL').run(id);
  const row = sessionRunById(id)!;
  if (row.ended_at == null && row.completed >= row.target) {
    db.prepare('UPDATE session_run SET ended_at = ? WHERE id = ?').run(now, id);
  }
  return sessionRunById(id)!;
}
export function endSessionRunEarly(id: number, now: number): void {
  getDb().prepare('UPDATE session_run SET ended_at = ?, ended_early = 1 WHERE id = ? AND ended_at IS NULL').run(now, id);
}

// The day boundary is the CHILD's day, not the server's. A session at 22:30 on a
// summer evening must land on that evening, not two hours into "tomorrow" in UTC.
// Intl in a fixed zone also handles the March/October DST shift for free.
const DAY_TZ = 'Europe/Stockholm';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: DAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
// "YYYY-MM-DD" for an instant, in the child's local day (sv-SE renders ISO order).
function localDayKey(ts: number): string {
  return dayFmt.format(ts);
}
// The 7 local day-keys ending today (index 6 = today), oldest first.
function last7DayKeys(now: number): string[] {
  const [y, m, d] = localDayKey(now).split('-').map(Number);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    // Noon UTC of the calendar date (today - i): far from any midnight/DST edge,
    // so formatting it back into the child's zone yields exactly that day.
    keys.push(localDayKey(Date.UTC(y, m - 1, d - i, 12)));
  }
  return keys;
}

// A completed session, at the CHILD's own target — ending early is a button, not
// a failure (§3.1), so a child on a 6-item target who does 6 counts. Only full
// completion sets ended_at with completed >= target.
const DONE_SESSION = 'ended_at IS NOT NULL AND completed >= target';

// A factual record of the last 7 days for one player: did they complete a
// session that day? index 0 = 6 days ago ... index 6 = today. Private to the
// child (shown only behind their own icon). NOT a streak — no consecutive-day
// counter, no penalty, no nagging; just a record, like the card shelf.
export function sessionDaysLast7(playerId: string, now: number): boolean[] {
  const keys = last7DayKeys(now);
  const idxByKey = new Map(keys.map((k, i) => [k, i] as const));
  const lowerBound = now - 8 * 24 * 3600 * 1000; // loose prefilter; exact bucketing by day-key below
  const rows = getDb()
    .prepare(`SELECT started_at FROM session_run WHERE player_id = ? AND ${DONE_SESSION} AND started_at >= ?`)
    .all(playerId, lowerBound) as { started_at: number }[];
  const days = new Array(7).fill(false);
  for (const r of rows) {
    const idx = idxByKey.get(localDayKey(r.started_at));
    if (idx !== undefined) days[idx] = true;
  }
  return days;
}

// Completed sessions in the last 7 days for one player. For the PARENT view only
// (§3.6 relatedness): a plain number the parent can notice and name at the table
// — "you did three today?". The child never sees a count; enthusiasm shows up for
// them as a fuller shelf and a steeper chart, never a score.
export function sessionsThisWeek(playerId: string, now: number): number {
  const lowerBound = now - 7 * 24 * 3600 * 1000;
  const r = getDb()
    .prepare(`SELECT COUNT(*) c FROM session_run WHERE player_id = ? AND ${DONE_SESSION} AND started_at >= ?`)
    .get(playerId, lowerBound) as { c: number };
  return r.c;
}

// Completed sessions family-wide (§4.1). No per-player breakdown exists.
export function completedSessionsForFamily(familyId: string, sinceMs: number): number {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) c FROM session_run sr JOIN player p ON p.id = sr.player_id
       WHERE p.family_id = ? AND sr.ended_early = 0 AND sr.ended_at IS NOT NULL
       AND sr.completed >= sr.target AND sr.started_at >= ?`,
    )
    .get(familyId, sinceMs) as { c: number };
  return r.c;
}

// --- cards (evidence, not verdicts) ----------------------------------------

// First solved problem of a skill wins the card; later solves are ignored.
// Returns true iff a new card was earned (so the caller can log it, §4.3).
export function insertCardIfFirst(playerId: string, skillCode: string, attemptId: number, now: number): boolean {
  const info = getDb()
    .prepare('INSERT OR IGNORE INTO card (player_id, skill_code, attempt_id, earned_at) VALUES (?, ?, ?, ?)')
    .run(playerId, skillCode, attemptId, now);
  return info.changes > 0;
}

export function cardsForPlayer(playerId: string): { skillCode: string; prompt: string; given: string | null; earnedAt: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT c.skill_code AS skillCode, c.earned_at AS earnedAt, a.item_json AS itemJson, a.given AS given
       FROM card c JOIN attempt a ON a.id = c.attempt_id
       WHERE c.player_id = ? ORDER BY c.earned_at`,
    )
    .all(playerId) as { skillCode: string; earnedAt: number; itemJson: string; given: string | null }[];
  return rows.map((r) => {
    let prompt = '';
    try {
      prompt = (JSON.parse(r.itemJson) as { prompt?: string }).prompt ?? '';
    } catch {
      /* ignore */
    }
    return { skillCode: r.skillCode, prompt, given: r.given, earnedAt: r.earnedAt };
  });
}

// --- family goal (cooperative, session-denominated, no per-child) ----------

export type GoalRow = { family_id: string; label: string; target: number; created_at: number; reached_at: number | null };
export function getGoal(familyId: string): GoalRow | undefined {
  return getDb().prepare('SELECT * FROM family_goal WHERE family_id = ?').get(familyId) as GoalRow | undefined;
}
export function setGoal(familyId: string, label: string, target: number, now: number): void {
  const prev = getGoal(familyId);
  getDb()
    .prepare(
      `INSERT INTO family_goal (family_id, label, target, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET label = excluded.label, target = excluded.target, created_at = excluded.created_at, reached_at = NULL`,
    )
    .run(familyId, label, target, now);
  // 'retargeted' if a goal was already here, else 'created' (§4.1 event stream).
  appendGoalEvent(familyId, label, target, prev ? 'retargeted' : 'created', prev ? target : null, now);
}
export function clearGoal(familyId: string, now: number): void {
  const prev = getGoal(familyId);
  getDb().prepare('DELETE FROM family_goal WHERE family_id = ?').run(familyId);
  if (prev) appendGoalEvent(familyId, prev.label, prev.target, 'cleared', null, now);
}
export function markGoalReached(familyId: string, now: number): void {
  const info = getDb()
    .prepare('UPDATE family_goal SET reached_at = ? WHERE family_id = ? AND reached_at IS NULL')
    .run(now, familyId);
  if (info.changes > 0) {
    const g = getGoal(familyId)!;
    appendGoalEvent(familyId, g.label, g.target, 'reached', null, now);
  }
}

// --- cat collection reward layer (celerant-cat-collection-spec.md) ----------
// A completed session is directed to ONE target. One row per session (upserted
// while the kid is on the done screen). The family goal is the RESIDUAL — every
// completed session counts toward it EXCEPT those directed to a cat/prop — so a
// cat genuinely costs the goal a session (the intended opportunity cost).

export type AllocationRow = { session_run_id: number; target_kind: 'cat' | 'family' | 'prop'; target_id: string };

export function setAllocation(sessionRunId: number, playerId: string, familyId: string, kind: 'cat' | 'family' | 'prop', targetId: string, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO session_allocation (session_run_id, player_id, family_id, target_kind, target_id, at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_run_id) DO UPDATE SET target_kind = excluded.target_kind, target_id = excluded.target_id, at = excluded.at`,
    )
    .run(sessionRunId, playerId, familyId, kind, targetId, at);
}

export function getAllocation(sessionRunId: number): AllocationRow | undefined {
  return getDb()
    .prepare('SELECT session_run_id, target_kind, target_id FROM session_allocation WHERE session_run_id = ?')
    .get(sessionRunId) as AllocationRow | undefined;
}

// Session-units directed to each cat (all-time), for the reward state's progress
// map. Each completed session counts ceil(items/10) units — a new 10-item session
// = 1, an old 20-item session = 2 (see roster.ts) — so doubling cat costs 20→40
// alongside halving sessions 20→10 is net-neutral, and a cat earned under the old
// counting can never re-lock (its 20-item sessions still count double).
export function catAllocationCounts(familyId: string): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT a.target_id, SUM((sr.target + 9) / 10) c FROM session_allocation a
       JOIN session_run sr ON sr.id = a.session_run_id
       WHERE a.family_id = ? AND a.target_kind = 'cat' GROUP BY a.target_id`,
    )
    .all(familyId) as { target_id: string; c: number }[];
  return new Map(rows.map((r) => [r.target_id, r.c]));
}

// Completed family sessions (since a cutoff) that were directed to a cat/prop —
// subtracted from the family-goal count so the goal is the residual.
export function catPropAllocatedSessions(familyId: string, sinceMs: number): number {
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM((sr.target + 9) / 10), 0) c FROM session_allocation a JOIN session_run sr ON sr.id = a.session_run_id
       WHERE a.family_id = ? AND a.target_kind IN ('cat','prop')
       AND sr.started_at >= ? AND sr.ended_at IS NOT NULL AND sr.ended_early = 0 AND sr.completed >= sr.target`,
    )
    .get(familyId, sinceMs) as { c: number };
  return r.c;
}

// The family goal's progress: the RESIDUAL — completed family sessions MINUS those
// a kid directed to a cat/prop, so a cat genuinely costs the goal a session (the
// intended opportunity cost). Legacy sessions (no allocation row) always count, so
// existing progress is preserved. Never negative.
//
// Counted in session-units (ceil(items/10)) like the cat costs, so a goal denomi-
// nated in sessions is net-neutral across the 20→10 halving: an old 20-item session
// counts 2, a new 10-item session 1. (completedSessionsForFamily stays a raw count
// for its own callers; the weighting lives here where the goal is compared to its
// doubled target.)
export function familyGoalProgress(familyId: string, sinceMs: number): number {
  const completedUnits = (
    getDb()
      .prepare(
        `SELECT COALESCE(SUM((sr.target + 9) / 10), 0) c FROM session_run sr JOIN player p ON p.id = sr.player_id
         WHERE p.family_id = ? AND sr.ended_early = 0 AND sr.ended_at IS NOT NULL
         AND sr.completed >= sr.target AND sr.started_at >= ?`,
      )
      .get(familyId, sinceMs) as { c: number }
  ).c;
  return Math.max(0, completedUnits - catPropAllocatedSessions(familyId, sinceMs));
}

export type SharedTargetRow = { target_kind: 'cat' | 'family' | 'prop'; target_id: string };
export function setSharedTarget(familyId: string, kind: 'cat' | 'family' | 'prop', targetId: string, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO family_shared_target (family_id, target_kind, target_id, at) VALUES (?, ?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET target_kind = excluded.target_kind, target_id = excluded.target_id, at = excluded.at`,
    )
    .run(familyId, kind, targetId, at);
}
export function getSharedTarget(familyId: string): SharedTargetRow | undefined {
  return getDb()
    .prepare('SELECT target_kind, target_id FROM family_shared_target WHERE family_id = ?')
    .get(familyId) as SharedTargetRow | undefined;
}

// --- event ledgers (instrumentation.md §4) ----------------------------------

export function appendGoalEvent(
  familyId: string,
  goalLabel: string,
  target: number,
  kind: 'created' | 'progressed' | 'reached' | 'cleared' | 'retargeted',
  value: number | null,
  at: number,
): void {
  getDb()
    .prepare('INSERT INTO goal_event (family_id, goal_label, target, kind, value, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(familyId, goalLabel, target, kind, value, at);
}

export function appendUsageEvent(playerId: string, kind: string, detail: string | null, at: number): void {
  getDb().prepare('INSERT INTO usage_event (player_id, kind, detail, at) VALUES (?, ?, ?, ?)').run(playerId, kind, detail, at);
}

// Read-back for the sprint-OFFER throttle (fluency-sprint-wiring §6). Usage events
// are a motivational-layer signal — the ability replay never reads them, so these
// can never move what the child is served.
export function lastUsageEventAt(playerId: string, kind: string): number | null {
  const r = getDb()
    .prepare('SELECT MAX(at) m FROM usage_event WHERE player_id = ? AND kind = ?')
    .get(playerId, kind) as { m: number | null };
  return r.m ?? null;
}

export function usageDetailsSince(playerId: string, kind: string, sinceMs: number): string[] {
  const rows = getDb()
    .prepare('SELECT detail FROM usage_event WHERE player_id = ? AND kind = ? AND at >= ? AND detail IS NOT NULL')
    .all(playerId, kind, sinceMs) as { detail: string }[];
  return rows.map((r) => r.detail);
}

// Completed sessions started at/after sinceMs, for one player. The offer throttle
// counts these to space proactive offers to ~1 per N sessions.
export function completedSessionsSince(playerId: string, sinceMs: number): number {
  const r = getDb()
    .prepare(`SELECT COUNT(*) c FROM session_run WHERE player_id = ? AND ${DONE_SESSION} AND started_at >= ?`)
    .get(playerId, sinceMs) as { c: number };
  return r.c;
}

// --- the probe (evidence-and-theses.md §2) — a clean ruler, never read by the
// --- model. These are the ONLY functions that touch the `probe` table.

export function appendProbe(p: {
  playerId: string;
  probeSet: string;
  itemRef: string;
  featuresJson: string;
  given: string | null;
  correct: number;
  latencyMs: number;
  at: number;
  isBaseline: boolean;
  probeVersion: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO probe (player_id, probe_set, item_ref, features_json, given, correct, latency_ms, administered_at, is_baseline, probe_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(p.playerId, p.probeSet, p.itemRef, p.featuresJson, p.given, p.correct, p.latencyMs, p.at, p.isBaseline ? 1 : 0, p.probeVersion);
}
export function hasBaselineProbe(playerId: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM probe WHERE player_id = ? AND is_baseline = 1 LIMIT 1').get(playerId);
}
export function lastProbeAt(playerId: string, probeSet?: string): number | null {
  const row = probeSet
    ? (getDb().prepare('SELECT MAX(administered_at) m FROM probe WHERE player_id = ? AND probe_set = ?').get(playerId, probeSet) as { m: number | null })
    : (getDb().prepare('SELECT MAX(administered_at) m FROM probe WHERE player_id = ?').get(playerId) as { m: number | null });
  return row.m;
}
export function probesForPlayer(playerId: string): unknown[] {
  return getDb().prepare('SELECT * FROM probe WHERE player_id = ? ORDER BY id').all(playerId);
}
const PROBE_DAY = 24 * 3600 * 1000;
// Monthly cadence (§2.3): >4 weeks since the last arith probe.
export function monthlyProbeDue(playerId: string, now: number): boolean {
  const last = lastProbeAt(playerId, 'arith_v1');
  return last != null && now - last >= 28 * PROBE_DAY;
}
// Event-triggered (§2.3): a component has crossed its fluency aim, and no
// transfer probe has run in the last two weeks — the pre/post window.
export function transferProbeDue(playerId: string, now: number): boolean {
  const last = lastProbeAt(playerId, 'transfer_v1');
  if (last != null && now - last < 14 * PROBE_DAY) return false;
  const player = playerById(playerId);
  if (!player) return false;
  const aim = aimFor(latestToolRate(playerId), player.school_year);
  for (const ab of abilities(playerId).values()) {
    if (ab.rate_state === 'measured' && ab.rate != null && ab.rate >= aim) return true;
  }
  return false;
}

// --- pre-registration (evidence-and-theses.md §3) ---------------------------

export type PreregRow = {
  thesis_id: string;
  statement: string;
  measure: string;
  threshold: string;
  registered_at: number;
  outcome: string | null;
  resolved_at: number | null;
};
export function preregRows(): PreregRow[] {
  return getDb().prepare('SELECT * FROM prereg ORDER BY thesis_id').all() as PreregRow[];
}
// §6: a thesis resolved by data older than its registration is inadmissible —
// refuse to mark it 'confirmed' if any probe evidence predates registration.
export function resolveThesis(
  thesisId: string,
  outcome: 'confirmed' | 'refuted' | 'inconclusive',
  now: number,
): { ok: boolean; reason?: string } {
  const row = getDb().prepare('SELECT registered_at FROM prereg WHERE thesis_id = ?').get(thesisId) as { registered_at: number } | undefined;
  if (!row) return { ok: false, reason: 'unknown_thesis' };
  if (outcome === 'confirmed') {
    const first = getDb().prepare('SELECT MIN(administered_at) m FROM probe').get() as { m: number | null };
    if (first.m != null && first.m < row.registered_at) return { ok: false, reason: 'evidence_predates_registration' };
  }
  getDb().prepare('UPDATE prereg SET outcome = ?, resolved_at = ? WHERE thesis_id = ?').run(outcome, now, thesisId);
  return { ok: true };
}

// --- the application signal (evidence-and-theses.md §2.4, T1) ----------------
// Free evidence from the existing ledger: when a component's rate crosses its
// aim, median latency on COMPOUND attempts containing that component before vs
// after. A drop is transfer — the Morningside thesis, per child. Reads only the
// model's own ledgers (attempt, sprint); writes nothing.
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export type SignalRow = {
  component: string;
  aimCrossedAt: number;
  beforeMedianMs: number;
  afterMedianMs: number;
  nBefore: number;
  nAfter: number;
};
export function applicationSignal(playerId: string): SignalRow[] {
  const player = playerById(playerId);
  if (!player) return [];
  const aim = aimFor(latestToolRate(playerId), player.school_year);
  const db = getDb();
  const sprints = db
    .prepare('SELECT skill_code, correct, duration_s, at FROM sprint WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id')
    .all(playerId) as { skill_code: string; correct: number; duration_s: number; at: number }[];
  const attempts = db
    .prepare('SELECT skill_code, latency_ms, at, dont_know FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0')
    .all(playerId) as { skill_code: string; latency_ms: number; at: number; dont_know: number }[];

  const out: SignalRow[] = [];
  for (const c of SKILLS) {
    if (c.mode !== 'component') continue;
    // earliest sprint on this component that met the aim
    let crossed: number | null = null;
    for (const sp of sprints) {
      if (sp.skill_code !== c.code) continue;
      if ((sp.correct * 60) / sp.duration_s >= aim) {
        crossed = sp.at;
        break;
      }
    }
    if (crossed == null) continue;
    // compounds that (transitively) require this component
    const compounds = new Set(SKILLS.filter((s) => s.mode === 'compound' && ancestors(s.code).has(c.code)).map((s) => s.code));
    if (!compounds.size) continue;
    const before: number[] = [];
    const after: number[] = [];
    for (const a of attempts) {
      if (!compounds.has(a.skill_code) || a.dont_know === 1) continue;
      (a.at < crossed ? before : after).push(a.latency_ms);
    }
    if (before.length < 3 || after.length < 3) continue; // not enough to say anything
    out.push({
      component: c.code,
      aimCrossedAt: crossed,
      beforeMedianMs: median(before),
      afterMedianMs: median(after),
      nBefore: before.length,
      nAfter: after.length,
    });
  }
  return out;
}
