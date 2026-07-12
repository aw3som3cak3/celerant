import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from './index';
import { replay } from './replay';
import { update, updateDecision } from '@/model/elo';

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
  at: number,
): void {
  const db = getDb();
  const ab = db
    .prepare('SELECT theta, n_obs FROM ability WHERE player_id = ? AND skill_code = ?')
    .get(playerId, skillCode) as { theta: number; n_obs: number } | undefined;
  if (!ab) return; // a skill not in the graph: no cache row to update
  const decision = updateDecision(dontKnow || given === null, tries, correct);
  let theta = ab.theta;
  let nObs = ab.n_obs;
  if (decision.apply) {
    theta = update({ theta, childObs: nObs }, decision.correct, decision.halveKChild).theta;
    nObs += 1;
  }
  db.prepare('UPDATE ability SET theta = ?, n_obs = ?, last_seen_at = ? WHERE player_id = ? AND skill_code = ?')
    .run(theta, nObs, at, playerId, skillCode);
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
  icon_pair: string;
  pin_hash: string;
  parent_hash: string;
  created_at: number;
  deleted_at: number | null;
};

// iconPair is stored in the ENTERED order (so the family shows as it was made);
// uniqueness and lookup are order-independent via familyByIcons.
export function createFamily(iconPair: string, pinHash: string, parentHash: string, now: number): string {
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO family (id, icon_pair, pin_hash, parent_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, iconPair, pinHash, parentHash, now);
  return id;
}

export function familyById(id: string): FamilyRow | undefined {
  return getDb().prepare('SELECT * FROM family WHERE id = ? AND deleted_at IS NULL').get(id) as FamilyRow | undefined;
}

// A family is an unordered pair, so match either order (older families were
// stored sorted; newer ones keep the entered order for display).
export function familyByIcons(a: string, b: string): FamilyRow | undefined {
  return getDb()
    .prepare('SELECT * FROM family WHERE icon_pair IN (?, ?) AND deleted_at IS NULL')
    .get(`${a}+${b}`, `${b}+${a}`) as FamilyRow | undefined;
}

// Icon pairs only — never player counts (ui-lifecycle §5.1).
export function listFamilyIconPairs(): string[] {
  return (getDb().prepare('SELECT icon_pair FROM family WHERE deleted_at IS NULL').all() as { icon_pair: string }[]).map(
    (r) => r.icon_pair,
  );
}

export function updateFamilyPin(id: string, pinHash: string): void {
  getDb().prepare('UPDATE family SET pin_hash = ? WHERE id = ?').run(pinHash, id);
}
export function updateFamilyParentPin(id: string, parentHash: string): void {
  getDb().prepare('UPDATE family SET parent_hash = ? WHERE id = ?').run(parentHash, id);
}
export function updateFamilyIcons(id: string, iconPair: string): void {
  getDb().prepare('UPDATE family SET icon_pair = ? WHERE id = ?').run(iconPair, id);
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
    .prepare('INSERT INTO player (id, family_id, icon, school_year, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, familyId, icon, schoolYear, now);
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
  n_obs: number;
  last_seen_at: number | null;
  rate: number | null;
  rate_state: 'unknown' | 'provisional' | 'measured';
};

export function abilities(playerId: string): Map<string, AbilityRow> {
  const rows = getDb()
    .prepare('SELECT skill_code, theta, n_obs, last_seen_at, rate, rate_state FROM ability WHERE player_id = ?')
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
  latencyMs: number;
  at: number;
};

// Append to the ledger, then rebuild the cache. Item generation itself writes
// nothing (§6.7); this is the only write on the answer path.
export function appendAttempt(a: AppendAttempt): number {
  const info = getDb()
    .prepare(
      `INSERT INTO attempt (player_id, skill_code, item_json, given, correct, tries, dont_know, latency_ms, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.playerId, a.skillCode, a.itemJson, a.given, a.correct, a.tries, a.dontKnow ? 1 : 0, a.latencyMs, a.at);
  applyAttemptToCache(a.playerId, a.skillCode, a.given, a.tries, a.correct, a.dontKnow, a.at); // fast path, not full replay
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
  return { family: familyById(familyId), players, attempts, sprints, toolRates };
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
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO pending_item
       (item_id, player_id, skill_code, prompt, answer, steps_json, seed, scores_json, served_at, tries, first_wrong)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    )
    .run(p.itemId, p.playerId, p.skillCode, p.prompt, p.answer, p.stepsJson, p.seed, p.scoresJson, p.servedAt);
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
export function insertCardIfFirst(playerId: string, skillCode: string, attemptId: number, now: number): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO card (player_id, skill_code, attempt_id, earned_at) VALUES (?, ?, ?, ?)')
    .run(playerId, skillCode, attemptId, now);
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
  getDb()
    .prepare(
      `INSERT INTO family_goal (family_id, label, target, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET label = excluded.label, target = excluded.target, created_at = excluded.created_at, reached_at = NULL`,
    )
    .run(familyId, label, target, now);
}
export function clearGoal(familyId: string): void {
  getDb().prepare('DELETE FROM family_goal WHERE family_id = ?').run(familyId);
}
export function markGoalReached(familyId: string, now: number): void {
  getDb().prepare('UPDATE family_goal SET reached_at = ? WHERE family_id = ? AND reached_at IS NULL').run(now, familyId);
}
