import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from './index';
import { replay } from './replay';
import { update, updateDecision, RATING_PERIOD_MS } from '@/model/elo';
import { BY_CODE, ancestors, type Subject } from '@/skills';
import { skillsForSubject } from '@/lib/subjects';
import { wordForSeed } from '@/lib/spelling-content';
import { aimFor, aimForSkill, bestObservedDigitRate as bestObservedFrom, SPRINT_ACC_FLOOR, SHADOW_TRIGGER_FACTOR, SPRINT_ACCURACY_WINDOW, SPRINT_ACCURACY_GATE, RECOG_ACCURACY_WINDOW, RECOG_ACCURACY_GATE } from '@/lib/fluency';
import { expectedPhysicalDigits } from '@/lib/item';
import { L_BARE as ACQ_BARE_LEVEL, GRADUATED as ACQ_GRADUATED, isClean, applyOutcome, foldFade, isStalled, type FadeState } from '@/lib/acquisition-content';
import { seedGradeFor } from '@/lib/onboarding';
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
  latencyMs: number,
  acqLevel: number | null = null,
): void {
  const db = getDb();
  const ab = db
    .prepare('SELECT theta, rd, volatility, n_obs, last_seen_at FROM ability WHERE player_id = ? AND skill_code = ?')
    .get(playerId, skillCode) as
    | { theta: number; rd: number; volatility: number; n_obs: number; last_seen_at: number | null }
    | undefined;
  if (!ab) return; // a skill not in the graph: no cache row to update
  const decision = updateDecision(dontKnow || given === null, tries, correct, latencyMs);
  // SCAFFOLDED ACQUISITION (spec §5, invariant 2): a scaffolded item (fade level 0-2) is
  // warmup-class for θ — a WEAK UPWARD nudge on success (so a ready-but-unlearned skill is
  // pulled back INTO band rather than avoided) and NO update at all on a miss (the miss says
  // the scaffold was too thin, not that the child got worse; the response is to soften a
  // level). A bare L3 item is an ordinary item in every respect. NULL (every pre-existing row)
  // keeps the old behaviour byte-for-byte. Mirrored exactly in replay.computeAbility.
  const scaffolded = acqLevel != null && acqLevel < ACQ_BARE_LEVEL;
  let theta = ab.theta;
  let rd = ab.rd;
  let vol = ab.volatility;
  let nObs = ab.n_obs;
  if (decision.apply && !(scaffolded && decision.correct === 0)) {
    // Same idle-inflation as replay, from the stored last_seen — so this fast
    // path stays byte-for-byte identical to a full replay (ui-lifecycle §7).
    const idle = ab.last_seen_at == null ? 0 : (at - ab.last_seen_at) / RATING_PERIOD_MS;
    // Warm-up: a correct answer on an easy opener is uninformative (she was meant
    // to get it), so halve it; a warm-up MISS is surprising and updates fully
    // (onboarding-ramp §4). A scaffolded acquisition success is halved for the same
    // reason (she was helped to it) — and its miss never reaches here at all.
    const halve = decision.halveKChild || (warmup === 1 && decision.correct === 1) || scaffolded;
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

// --- groups (docs/groups.md) -----------------------------------------------
// A general group a child belongs to BEYOND their family (a patrol, a class, a club). The FAMILY is
// surfaced as a group by groupsForPlayer(), SYNTHESISED from player.family_id — so "a child is in
// several groups, and family is one" is true in the accessor, without storing family as a
// member_group row (family stays the anchor: auth, identity, rewards). Icons are unique only WITHIN a
// family, so a group can hold two children with the same icon; disambiguate by icon + family at
// render time, never enforce icon-uniqueness across a group.

export type Group = {
  id: string;
  kind: string; // 'family' (synthesised) | 'patrol' | 'class' | 'club' | …
  name: string;
  role?: string; // the player's role IN this group; undefined for the (virtual) family group
};

export function createGroup(kind: string, name: string, now: number): string {
  if (kind === 'family') throw new Error("member_group.kind must not be 'family' (the family group is virtual)");
  const id = randomUUID();
  getDb().prepare('INSERT INTO member_group (id, kind, name, created_at) VALUES (?, ?, ?, ?)').run(id, kind, name, now);
  return id;
}

export function addToGroup(groupId: string, playerId: string, now: number, role = 'member'): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO group_membership (group_id, player_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(groupId, playerId, role, now);
}

export function removeFromGroup(groupId: string, playerId: string): void {
  getDb().prepare('DELETE FROM group_membership WHERE group_id = ? AND player_id = ?').run(groupId, playerId);
}

// Members of a group, each WITH their family — so a roster can disambiguate a shared icon. Ordered by
// join time. Set membership, never an ordering that carries rank (the disclosure guardrail).
export type GroupMember = { playerId: string; icon: string; schoolYear: number; familyId: string; role: string };
export function membersOfGroup(groupId: string): GroupMember[] {
  return getDb()
    .prepare(
      `SELECT p.id AS playerId, p.icon AS icon, p.school_year AS schoolYear, p.family_id AS familyId, m.role AS role
       FROM group_membership m JOIN player p ON p.id = m.player_id
       WHERE m.group_id = ? ORDER BY m.joined_at`,
    )
    .all(groupId) as GroupMember[];
}

// The explicit (non-family) groups a player belongs to.
export function memberGroupsForPlayer(playerId: string): Group[] {
  return getDb()
    .prepare(
      `SELECT g.id AS id, g.kind AS kind, g.name AS name, m.role AS role
       FROM group_membership m JOIN member_group g ON g.id = m.group_id
       WHERE m.player_id = ? AND g.archived_at IS NULL ORDER BY g.created_at`,
    )
    .all(playerId) as Group[];
}

// EVERY group a child belongs to: the FAMILY group first (synthesised from player.family_id), then
// their member_groups. The unified accessor behind "a child is in several groups, and family is one".
export function groupsForPlayer(playerId: string): Group[] {
  const player = playerById(playerId);
  if (!player) return [];
  const fam = familyById(player.family_id);
  const familyGroup: Group = {
    id: `family:${player.family_id}`,
    kind: 'family',
    name: fam?.icon_display || fam?.icon_pair || 'family',
  };
  return [familyGroup, ...memberGroupsForPlayer(playerId)];
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
  acqLevel?: number | null; // SCAFFOLDED ACQUISITION: the fade level this item was SERVED at (0-3); NULL = an ordinary item
  latencyMs: number;
  at: number;
  idemKey?: string | null; // client idempotency key (input-timing Phase A); NULL server-generated
  sessionRunId?: number | null; // which session this item belonged to — for position-in-session analysis
  envJson?: string | null; // model-INVISIBLE device fingerprint (JSON), aim-calibration analysis only; no model path reads it
};

// Append to the ledger, then rebuild the cache. Item generation itself writes
// nothing (§6.7); this is the only write on the answer path.
export function appendAttempt(a: AppendAttempt): number {
  const acqLevel = a.acqLevel ?? null;
  // A SCAFFOLDED acquisition item (levels 0-2) is also flagged warmup — that one flag is what
  // every rate/aim/sprint/analysis query already filters on, so a derived latency can never
  // reach the fluency number (invariant 2). A bare L3 item keeps warmup as given: it IS the
  // ordinary retrieval rung, and its timing is honest.
  const warmup = a.warmup || (acqLevel != null && acqLevel < ACQ_BARE_LEVEL) ? 1 : 0;
  const info = getDb()
    .prepare(
      `INSERT INTO attempt (player_id, skill_code, item_json, given, correct, tries, dont_know, warmup, latency_ms, at, idem_key, session_run_id, env_json, acq_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.playerId, a.skillCode, a.itemJson, a.given, a.correct, a.tries, a.dontKnow ? 1 : 0, warmup, a.latencyMs, a.at, a.idemKey ?? null, a.sessionRunId ?? null, a.envJson ?? null, acqLevel);
  applyAttemptToCache(a.playerId, a.skillCode, a.given, a.tries, a.correct, a.dontKnow, warmup, a.at, a.latencyMs, acqLevel); // fast path, not full replay
  return Number(info.lastInsertRowid);
}

// Idempotency check for the client-driven answer path: has this exact captured
// answer already been recorded? A retried POST must not double-record or double-bump
// the session.
export function attemptExistsByIdemKey(idemKey: string): boolean {
  return getDb().prepare('SELECT 1 FROM attempt WHERE idem_key = ?').get(idemKey) != null;
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
): number {
  const info = getDb()
    .prepare('INSERT INTO sprint (player_id, skill_code, duration_s, correct, errors, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(playerId, skillCode, durationS, correct, errors, now);
  // Fast path: the latest sprint replaces this skill's rate outright (measured).
  getDb()
    .prepare("UPDATE ability SET rate = ?, rate_state = 'measured' WHERE player_id = ? AND skill_code = ?")
    .run((correct * 60) / durationS, playerId, skillCode);
  return Number(info.lastInsertRowid);
}

// Interval-based sprint record (input-timing Phase A). Stores the summed VALID
// client intervals; rate = correct×60000/intervalMs. Idempotent on sprintKey — a
// retried ingest returns null and writes nothing, so the milestone bonus / demote
// side effects can fire exactly once. duration_s is left 0 (the legacy wall-clock
// field is unused on interval rows; replay reads interval_ms first). A non-credible
// run (accuracy didn't hold) is written but VOIDED, so replay skips it (no rate) yet
// sprint_key still dedups it — same as the empty-run tombstone. Returns the new
// sprint id, or null if this key was already ingested.
export function appendSprintIngest(
  playerId: string,
  skillCode: string,
  correct: number,
  errors: number,
  intervalMs: number,
  credible: boolean,
  sprintKey: string,
  now: number,
  source: 'sprint' | 'burst' = 'sprint',
): number | null {
  if (getDb().prepare('SELECT 1 FROM sprint WHERE sprint_key = ?').get(sprintKey) != null) return null;
  const info = getDb()
    .prepare(
      'INSERT INTO sprint (player_id, skill_code, duration_s, correct, errors, at, interval_ms, sprint_key, voided_at, void_reason, source) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(playerId, skillCode, correct, errors, now, intervalMs, sprintKey, credible ? null : now, credible ? null : 'not_credible', source);
  if (credible && intervalMs > 0) {
    getDb()
      .prepare("UPDATE ability SET rate = ?, rate_state = 'measured' WHERE player_id = ? AND skill_code = ?")
      .run((correct * 60000) / intervalMs, playerId, skillCode);
  }
  return Number(info.lastInsertRowid);
}

export function appendToolRate(playerId: string, digitsPerMin: number, now: number, envJson: string | null = null): void {
  getDb()
    .prepare('INSERT INTO tool_rate (player_id, digits_per_min, at, env_json) VALUES (?, ?, ?, ?)')
    .run(playerId, digitsPerMin, now, envJson);
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

// The writing-speed test invitation (celerant tool-test wiring). We ask a child to
// run the copy-speed game AT MOST once per day and stop after TOOL_TEST_TARGET real
// measurements — enough to ground the aim, never a chore. These two reads drive the
// per-child `needsToolTest` flag on /api/me.
export function toolRateCount(playerId: string): number {
  return (getDb().prepare('SELECT COUNT(*) c FROM tool_rate WHERE player_id = ? AND voided_at IS NULL').get(playerId) as { c: number }).c;
}
// Did this child already record a measurement on their CURRENT local day (Europe/
// Stockholm, like the session record)? If so, the invitation is gone until tomorrow.
export function measuredToolRateToday(playerId: string, now: number): boolean {
  const r = getDb()
    .prepare('SELECT MAX(at) m FROM tool_rate WHERE player_id = ? AND voided_at IS NULL')
    .get(playerId) as { m: number | null };
  return r.m != null && localDayKey(r.m) === localDayKey(now);
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

// Same as recentFirstTryAccuracy but only over attempts AFTER `sinceAt` — the
// state-based sprint cooldown (sprint-eligibility): a skill demoted by a collapsed
// sprint must re-earn eligibility on FRESH untimed accuracy, so its accuracy is
// measured only over practice since the demotion. `sinceAt = 0` ⇒ whole history.
export function recentFirstTryAccuracySince(playerId: string, skillCode: string, n: number, sinceAt: number): { acc: number; count: number } {
  const rows = getDb()
    .prepare('SELECT correct, tries FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL AND at > ? ORDER BY id DESC LIMIT ?')
    .all(playerId, skillCode, sinceAt, n) as { correct: number; tries: number }[];
  if (rows.length === 0) return { acc: 0, count: 0 };
  return { acc: rows.filter((r) => r.correct === 1 && r.tries === 1).length / rows.length, count: rows.length };
}

// --- Calibration monitor inputs (lib/calibration.ts) -----------------------
// Recent real (non-warm-up) attempts, newest first — for the predicted-vs-observed
// first-try check per skill.
export function recentAttemptsForCalibration(playerId: string, limit: number): { skill_code: string; correct: number; tries: number; dont_know: number; latency_ms: number }[] {
  return getDb()
    .prepare('SELECT skill_code, correct, tries, dont_know, latency_ms FROM attempt WHERE player_id = ? AND warmup = 0 AND voided_at IS NULL ORDER BY id DESC LIMIT ?')
    .all(playerId, limit) as { skill_code: string; correct: number; tries: number; dont_know: number; latency_ms: number }[];
}

// Each attempt with its RELIABLE position-in-session (ROW_NUMBER over session_run_id),
// for the fatigue curve. Only rows recorded since the session link was added.
export function attemptPositions(playerId: string): { pos: number; correct: number; tries: number; dont_know: number; latency_ms: number }[] {
  return getDb()
    .prepare(
      `SELECT ROW_NUMBER() OVER (PARTITION BY session_run_id ORDER BY at, id) pos, correct, tries, dont_know, latency_ms
       FROM attempt WHERE player_id = ? AND session_run_id IS NOT NULL AND warmup = 0 AND voided_at IS NULL`,
    )
    .all(playerId) as { pos: number; correct: number; tries: number; dont_know: number; latency_ms: number }[];
}

// All-time count of clean first-try successes on a skill (not warm-ups) — "has this
// child demonstrated the symbol?", used to override the GROUND acquisition routing so
// a kid who can clearly do the skill isn't sent back to pre-symbolic scaffolding.
export function firstTrySuccesses(playerId: string, skillCode: string): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) c FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL AND warmup = 0 AND correct = 1 AND tries = 1 AND dont_know = 0")
    .get(playerId, skillCode) as { c: number };
  return r.c;
}

// Non-warmup, non-voided attempt count per skill for one child, in a single query.
// Drives the sprint-offer tie-breaker's "practised dependent" test (a dependent with
// enough real attempts that transfer to it could be observed). A map, so a caller
// can check many dependents without a query each.
export function nonWarmupCountsBySkill(playerId: string): Map<string, number> {
  const rows = getDb()
    .prepare('SELECT skill_code, COUNT(*) c FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0 GROUP BY skill_code')
    .all(playerId) as { skill_code: string; c: number }[];
  return new Map(rows.map((r) => [r.skill_code, r.c]));
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

// Per-child read token (fluency signal, least privilege). The caller generates the token and
// passes its hash (mirrors createSession); only the hash is stored.
export function createPlayerReadToken(tokenHash: string, playerId: string, now: number): void {
  getDb()
    .prepare('INSERT INTO player_read_token (token_hash, player_id, created_at) VALUES (?, ?, ?)')
    .run(tokenHash, playerId, now);
}
// The player a live (non-revoked) read token authorises, or null.
export function playerIdForReadToken(tokenHash: string): string | null {
  const row = getDb()
    .prepare('SELECT player_id FROM player_read_token WHERE token_hash = ? AND revoked_at IS NULL')
    .get(tokenHash) as { player_id: string } | undefined;
  return row?.player_id ?? null;
}
export function revokePlayerReadToken(tokenHash: string, now: number): void {
  getDb().prepare('UPDATE player_read_token SET revoked_at = ? WHERE token_hash = ?').run(now, tokenHash);
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
  subject: 'maths' | 'spelling' | 'english' | 'electronics';
  subjects: string | null; // JSON array of active subjects for a MIXED session; NULL = single (use `subject`)
};

export function createSessionRun(
  playerId: string,
  target: number,
  now: number,
  subject: 'maths' | 'spelling' | 'english' | 'electronics' = 'maths',
  subjects?: readonly ('maths' | 'spelling' | 'english' | 'electronics')[], // pass the SET for a mixed Öva; omit for single-subject
): number {
  // An accidental open with no answered question is NOT a session (a wrong icon +
  // "tillbaka"). Clear the player's prior empty, still-open runs so they never
  // linger or get counted as a started/abandoned session.
  getDb().prepare('DELETE FROM session_run WHERE player_id = ? AND completed = 0 AND ended_at IS NULL').run(playerId);
  const set = subjects && subjects.length > 1 ? JSON.stringify(subjects) : null;
  const info = getDb()
    .prepare('INSERT INTO session_run (player_id, target, started_at, subject, subjects) VALUES (?, ?, ?, ?, ?)')
    .run(playerId, target, now, subject, set);
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
  const run = getDb().prepare('SELECT completed FROM session_run WHERE id = ? AND ended_at IS NULL').get(id) as { completed: number } | undefined;
  if (!run) return;
  // Ended with zero answers → it never started; remove it entirely so it's not an
  // abandoned session. Otherwise it's a real early-end (recorded, never a failure).
  if (run.completed === 0) getDb().prepare('DELETE FROM session_run WHERE id = ?').run(id);
  else getDb().prepare('UPDATE session_run SET ended_at = ?, ended_early = 1 WHERE id = ?').run(now, id);
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

export type GoalRow = { id: number; family_id: string; label: string; target: number; created_at: number; reached_at: number | null; acknowledged_at: number | null; carry_offset: number };

// The single ACTIVE goal a family is working toward: not reached, not acknowledged.
export function getActiveGoal(familyId: string): GoalRow | undefined {
  return getDb()
    .prepare('SELECT * FROM family_goal WHERE family_id = ? AND reached_at IS NULL AND acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 1')
    .get(familyId) as GoalRow | undefined;
}
// CELEBRATED goals: reached but not yet acknowledged ("Klar") — they linger for celebration next
// to a new active goal until the parent presses Klar. Newest first.
export function celebratedGoals(familyId: string): GoalRow[] {
  return getDb()
    .prepare('SELECT * FROM family_goal WHERE family_id = ? AND reached_at IS NOT NULL AND acknowledged_at IS NULL ORDER BY reached_at DESC')
    .all(familyId) as GoalRow[];
}
// Back-compat: callers that want "the current goal" get the active one.
export function getGoal(familyId: string): GoalRow | undefined {
  return getActiveGoal(familyId);
}
// Create a NEW active goal. Any existing ACTIVE goal is being replaced → archive it (acknowledged),
// so only ONE active goal exists; celebrated goals are untouched and keep showing. carryOffset seeds
// the new goal's starting points (carried from the replaced unfinished goal, the parent's choice).
export function createGoal(familyId: string, label: string, target: number, now: number, carryOffset = 0): number {
  const prev = getActiveGoal(familyId);
  if (prev) getDb().prepare('UPDATE family_goal SET acknowledged_at = ? WHERE id = ?').run(now, prev.id);
  const info = getDb()
    .prepare('INSERT INTO family_goal (family_id, label, target, created_at, carry_offset) VALUES (?, ?, ?, ?, ?)')
    .run(familyId, label, target, now, carryOffset);
  appendGoalEvent(familyId, label, target, prev ? 'retargeted' : 'created', carryOffset || null, now);
  return Number(info.lastInsertRowid);
}
// Back-compat alias (tests / any caller): set === create a new active goal.
export function setGoal(familyId: string, label: string, target: number, now: number, carryOffset = 0): void {
  createGoal(familyId, label, target, now, carryOffset);
}
// "Klar": acknowledge a CELEBRATED goal (hide it). With no id, acknowledges all the family's
// celebrated goals. Also usable to discard the active goal (the old clear behaviour).
export function acknowledgeGoal(familyId: string, goalId: number | null, now: number): void {
  const rows: (GoalRow | undefined)[] = goalId != null
    ? [getDb().prepare('SELECT * FROM family_goal WHERE id = ? AND family_id = ? AND acknowledged_at IS NULL').get(goalId, familyId) as GoalRow | undefined]
    : celebratedGoals(familyId);
  for (const g of rows) {
    if (!g) continue;
    getDb().prepare('UPDATE family_goal SET acknowledged_at = ? WHERE id = ?').run(now, g.id);
    appendGoalEvent(familyId, g.label, g.target, 'cleared', null, now);
  }
}
// Back-compat: clear the ACTIVE goal (discard it without celebrating).
export function clearGoal(familyId: string, now: number): void {
  const g = getActiveGoal(familyId);
  if (g) acknowledgeGoal(familyId, g.id, now);
}
export function markGoalReached(familyId: string, now: number): void {
  const g = getActiveGoal(familyId);
  if (!g) return;
  getDb().prepare('UPDATE family_goal SET reached_at = ? WHERE id = ?').run(now, g.id);
  appendGoalEvent(familyId, g.label, g.target, 'reached', null, now);
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
// Directed-session counts per collectable TARGET (cats and props alike — both
// accumulate toward a cost the same way). The family goal is the residual and is
// counted separately (familyGoalProgress).
export function targetAllocationCounts(familyId: string): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT a.target_id, SUM((sr.target + 9) / 10) c FROM session_allocation a
       JOIN session_run sr ON sr.id = a.session_run_id
       WHERE a.family_id = ? AND a.target_kind IN ('cat','prop') GROUP BY a.target_id`,
    )
    .all(familyId) as { target_id: string; c: number }[];
  const counts = new Map(rows.map((r) => [r.target_id, r.c]));
  // Fold in sprint milestone bonus units (not sessions) directed to each target.
  for (const [id, u] of bonusTargetUnits(familyId)) counts.set(id, (counts.get(id) ?? 0) + u);
  return counts;
}

// --- Sprint milestone BONUS units (celerant sprint-reward) ------------------
// A one-time reward for a child crossing a skill's fluency aim on a sprint. It
// pays into the SAME cat/family/prop economy as sessions, but in raw UNITS that
// are NOT sessions — so it advances a cat or the goal WITHOUT ever incrementing
// the weekly "pass"/displacement wellbeing counter (which reads session_run only;
// a sprint is never a pass). Keyed on the crossing sprint (one per skill, since
// crossing makes the skill fluent → sprint-ineligible), so it is one-time by
// construction and the child may REDIRECT it (upsert) but never farm it.
export function setBonusAllocation(
  sprintId: number,
  playerId: string,
  familyId: string,
  kind: 'cat' | 'family' | 'prop',
  targetId: string,
  units: number,
  at: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO bonus_allocation (sprint_id, player_id, family_id, target_kind, target_id, units, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sprint_id) DO UPDATE SET target_kind = excluded.target_kind, target_id = excluded.target_id, at = excluded.at`,
    )
    .run(sprintId, playerId, familyId, kind, targetId, units, at);
}

export function bonusAllocationForSprint(sprintId: number): { player_id: string; family_id: string; target_kind: string; target_id: string; units: number } | undefined {
  return getDb()
    .prepare('SELECT player_id, family_id, target_kind, target_id, units FROM bonus_allocation WHERE sprint_id = ?')
    .get(sprintId) as { player_id: string; family_id: string; target_kind: string; target_id: string; units: number } | undefined;
}

// Timestamped units directed to ONE consumable target (the fish), session + bonus, oldest
// first. The caller walks these to spawn a treat every `cost` units at that unit's time, then
// keeps only spawns inside the life window — so a fish is born when earned and eaten at +48h.
export function timedTargetUnits(familyId: string, targetId: string): { at: number; units: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT a.at at, (sr.target + 9) / 10 units FROM session_allocation a
         JOIN session_run sr ON sr.id = a.session_run_id
         WHERE a.family_id = ? AND a.target_kind = 'prop' AND a.target_id = ?
       UNION ALL
       SELECT at, units FROM bonus_allocation
         WHERE family_id = ? AND target_kind = 'prop' AND target_id = ?`,
    )
    .all(familyId, targetId, familyId, targetId) as { at: number; units: number }[];
  return rows.sort((a, b) => a.at - b.at);
}

// --- Audio review (the granska ear-vet tool): Erik's per-clip verdict, global (not per family). ---
export function setAudioReview(tier: string, word: string, verdict: 'ok' | 'bad', note: string | null, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO audio_review (tier, word, verdict, note, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tier, word) DO UPDATE SET verdict = excluded.verdict, note = excluded.note, at = excluded.at`,
    )
    .run(tier, word, verdict, note, at);
}

export function getAudioReviews(): { tier: string; word: string; verdict: string; note: string | null }[] {
  return getDb()
    .prepare('SELECT tier, word, verdict, note FROM audio_review')
    .all() as { tier: string; word: string; verdict: string; note: string | null }[];
}

// Image eye-vet (granska-bilder) — sibling of the audio review, keyed (kind, word).
export function setImageReview(kind: string, word: string, verdict: 'ok' | 'bad', note: string | null, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO image_review (kind, word, verdict, note, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kind, word) DO UPDATE SET verdict = excluded.verdict, note = excluded.note, at = excluded.at`,
    )
    .run(kind, word, verdict, note, at);
}

export function getImageReviews(): { kind: string; word: string; verdict: string; note: string | null }[] {
  return getDb()
    .prepare('SELECT kind, word, verdict, note FROM image_review')
    .all() as { kind: string; word: string; verdict: string; note: string | null }[];
}

// --- Question log: a resolved wrong/idk answer, with the question rebuilt from its seed, so a
// broken generated item (misheard audio, ambiguous prompt, wrong key) is inspectable. ---
export function logWrongQuestion(row: {
  playerId: string; skillCode: string; subject: string | null; seed: number | null;
  prompt: string; answer: string; given: string | null; dontKnow: boolean; detail: string; at: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO question_log (player_id, skill_code, subject, seed, prompt, answer, given, dont_know, detail, at)
       VALUES (@playerId, @skillCode, @subject, @seed, @prompt, @answer, @given, @dontKnow, @detail, @at)`,
    )
    .run({ ...row, dontKnow: row.dontKnow ? 1 : 0 });
}

export type QuestionLogRow = {
  id: number; icon: string; skill_code: string; subject: string | null; seed: number | null;
  prompt: string | null; answer: string | null; given: string | null; dont_know: number; detail: string | null; at: number;
};

// Recent flagged questions (all families — this is Erik's diagnostic lens), newest first.
export function getQuestionLog(sinceMs: number, limit = 500): QuestionLogRow[] {
  return getDb()
    .prepare(
      `SELECT q.id, p.icon, q.skill_code, q.subject, q.seed, q.prompt, q.answer, q.given, q.dont_know, q.detail, q.at
         FROM question_log q JOIN player p ON p.id = q.player_id
        WHERE q.at >= ? ORDER BY q.at DESC LIMIT ?`,
    )
    .all(sinceMs, limit) as QuestionLogRow[];
}

// Bonus units directed to each cat/prop (all-time), mirroring targetAllocationCounts.
export function bonusTargetUnits(familyId: string): Map<string, number> {
  const rows = getDb()
    .prepare("SELECT target_id, COALESCE(SUM(units),0) u FROM bonus_allocation WHERE family_id = ? AND target_kind IN ('cat','prop') GROUP BY target_id")
    .all(familyId) as { target_id: string; u: number }[];
  return new Map(rows.map((r) => [r.target_id, r.u]));
}

// Bonus units directed to the family goal since a cutoff (goal.created_at), added
// to the goal residual the same way a bonus-to-cat is added to that cat's count.
export function bonusFamilyUnits(familyId: string, sinceMs: number): number {
  const r = getDb()
    .prepare("SELECT COALESCE(SUM(units),0) u FROM bonus_allocation WHERE family_id = ? AND target_kind = 'family' AND at >= ?")
    .get(familyId, sinceMs) as { u: number };
  return r.u;
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
export function familyGoalProgress(familyId: string, sinceMs: number, carryOffset = 0): number {
  const completedUnits = (
    getDb()
      .prepare(
        `SELECT COALESCE(SUM((sr.target + 9) / 10), 0) c FROM session_run sr JOIN player p ON p.id = sr.player_id
         WHERE p.family_id = ? AND sr.ended_early = 0 AND sr.ended_at IS NOT NULL
         AND sr.completed >= sr.target AND sr.started_at >= ?`,
      )
      .get(familyId, sinceMs) as { c: number }
  ).c;
  // Bonus units directed to the goal add on top of the session residual; a sprint
  // milestone is a real contribution to "simhallen", but it is never a session/pass.
  // carryOffset = points carried from a replaced unfinished goal (the parent's choice).
  return Math.max(0, completedUnits - catPropAllocatedSessions(familyId, sinceMs)) + bonusFamilyUnits(familyId, sinceMs) + carryOffset;
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

// Per-child default target (Model A: personal steering, shared cats). Latest-wins.
export function setPlayerTarget(playerId: string, kind: 'cat' | 'family' | 'prop', targetId: string, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO player_target (player_id, target_kind, target_id, at) VALUES (?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET target_kind = excluded.target_kind, target_id = excluded.target_id, at = excluded.at`,
    )
    .run(playerId, kind, targetId, at);
}
export function getPlayerTarget(playerId: string): SharedTargetRow | undefined {
  return getDb()
    .prepare('SELECT target_kind, target_id FROM player_target WHERE player_id = ?')
    .get(playerId) as SharedTargetRow | undefined;
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

// --- GROUND / acquisition ---------------------------------------------------
// The separate GROUND scene retired when its acquisition rungs became the graph's bottom
// rungs (one-ova-track WS II); nothing writes or reads ground_event any more. The table
// is kept (append-only history), but its accessors are gone.

// When a skill was last DEMOTED by a collapsed sprint (sprint-eligibility). The
// sprint cooldown is state-based: a demoted skill re-earns eligibility only on
// fresh untimed accuracy AFTER this instant (recentFirstTryAccuracySince). Reads a
// usage_event, which replay never sees — so a collapse never dents θ or an unlock.
export function lastSprintDemotionAt(playerId: string, skillCode: string): number {
  const r = getDb()
    .prepare("SELECT MAX(at) m FROM usage_event WHERE player_id = ? AND kind = 'sprint_demoted' AND detail = ?")
    .get(playerId, skillCode) as { m: number | null };
  return r.m ?? 0;
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
  const tr = latestToolRate(playerId);
  const floor = bestObservedDigitRate(playerId);
  for (const ab of abilities(playerId).values()) {
    if (ab.rate_state === 'measured' && ab.rate != null && ab.rate >= aimFor(tr, player.school_year, ab.skill_code, floor)) return true;
  }
  return false;
}

// The child's demonstrated keystroke throughput: the fastest digit rate he has actually
// produced on any measured skill (rate × physical digits). A hard lower bound on his
// tapping ceiling, used to floor the aim's effective tap over the copy-probe's under-read
// (fluency.bestObservedDigitRate). Zero until he has a measured sprint.
export function bestObservedDigitRate(playerId: string): number {
  const measured: { code: string; rate: number }[] = [];
  for (const ab of abilities(playerId).values())
    if (ab.rate_state === 'measured' && ab.rate != null) measured.push({ code: ab.skill_code, rate: ab.rate });
  return bestObservedFrom(measured);
}

const SHADOW_MIN_N = 8; // clean first-try-correct attempts before a practice rate is credible

// WS III-a shadow detector (INVISIBLE). On a resolved practice attempt, notice whether a
// MASTERED skill's clean practice rate has first crossed the trigger (factor × its sprint-
// calibrated aim) — and if so, write ONE snapshotted row. It triggers nothing and awards
// nothing; the burst (WS III-b) does the awarding, judged on the burst against the un-
// factored aim. A pure downstream read of the attempt ledger + a write to its own log;
// never touches the selector or θ (the Öva-spec stop-flag). Inputs are snapshotted at fire
// time so aim drift can never rewrite the record (the stored-crossing invariant).
export function recordShadowFluency(playerId: string, skillCode: string, now: number): void {
  const skill = BY_CODE.get(skillCode);
  if (!skill || !skill.sprintable) return; // fluency targets only — recognition/written rungs never burst
  const db = getDb();
  if (db.prepare('SELECT 1 FROM shadow_fluency WHERE player_id = ? AND skill_code = ?').get(playerId, skillCode)) return; // first fire only
  // Mastered? — the existing accuracy gate over the post-demotion window.
  const since = lastSprintDemotionAt(playerId, skillCode);
  const { acc, count } = recentFirstTryAccuracySince(playerId, skillCode, SPRINT_ACCURACY_WINDOW, since);
  if (count < SPRINT_ACCURACY_WINDOW || acc < SPRINT_ACCURACY_GATE) return;
  // Clean practice rate: recent first-try-correct client intervals (interrupted ones excluded).
  const rows = db
    .prepare(
      "SELECT latency_ms FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL AND warmup = 0 AND dont_know = 0 AND tries = 1 AND correct = 1 AND latency_ms BETWEEN 300 AND 30000 ORDER BY at DESC LIMIT 20",
    )
    .all(playerId, skillCode) as { latency_ms: number }[];
  if (rows.length < SHADOW_MIN_N) return;
  const practiceRate = (rows.length * 60000) / rows.reduce((a, r) => a + r.latency_ms, 0);
  const player = playerById(playerId);
  if (!player) return;
  const floor = bestObservedDigitRate(playerId);
  const aim = aimFor(latestToolRate(playerId), seedGradeFor(player.school_year), skillCode, floor);
  if (practiceRate >= SHADOW_TRIGGER_FACTOR * aim) {
    db.prepare(
      'INSERT OR IGNORE INTO shadow_fluency (player_id, skill_code, at, practice_rate, aim, factor, floor, window_n) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(playerId, skillCode, now, practiceRate, aim, SHADOW_TRIGGER_FACTOR, floor, rows.length);
  }
}

// D1 internal-fluency SHADOW for RECOGNITION rungs (INVISIBLE, gates nothing). recordShadowFluency
// bails on non-sprintable rungs, so this is its choice-format sibling: the FIRST time a child is
// accurate on a recognition rung with enough clean samples, snapshot their practice rate against the
// (uncalibrated) recognition aim — so we can SEE real rates and calibrate the aim before D2 gates on
// it. Records regardless of whether the rate crosses the aim (the point is to observe rate vs aim).
export function recordRecogShadow(playerId: string, skillCode: string, now: number): void {
  const skill = BY_CODE.get(skillCode);
  if (!skill || skill.format !== 'choice') return; // recognition/choice rungs only (spelling t0…t1c + maths GROUND)
  const db = getDb();
  if (db.prepare('SELECT 1 FROM recog_shadow WHERE player_id = ? AND skill_code = ?').get(playerId, skillCode)) return; // first fire only
  const { acc, count } = recentFirstTryAccuracySince(playerId, skillCode, RECOG_ACCURACY_WINDOW, 0);
  if (count < RECOG_ACCURACY_WINDOW || acc < RECOG_ACCURACY_GATE) return;
  const rows = db
    .prepare(
      "SELECT latency_ms FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL AND warmup = 0 AND dont_know = 0 AND tries = 1 AND correct = 1 AND latency_ms BETWEEN 300 AND 30000 ORDER BY at DESC LIMIT 20",
    )
    .all(playerId, skillCode) as { latency_ms: number }[];
  if (rows.length < SHADOW_MIN_N) return;
  const practiceRate = (rows.length * 60000) / rows.reduce((a, r) => a + r.latency_ms, 0);
  const player = playerById(playerId);
  if (!player) return;
  const aim = aimForSkill(skill, latestToolRate(playerId), seedGradeFor(player.school_year), bestObservedDigitRate(playerId));
  db.prepare('INSERT OR IGNORE INTO recog_shadow (player_id, skill_code, at, practice_rate, aim, accuracy, window_n) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    playerId, skillCode, now, practiceRate, aim, acc, rows.length,
  );
}

// ── WS III burst, PHASE B0 (SHADOW) ─────────────────────────────────────────
// These reads/writes are ISOLATED from the award/replay/unlock engine: no replay path, no
// everMilestonedSkills, no ability rate, no selector reads any of them. They only serve a
// consecutive run and record its measurement, to be compared offline to the sprint ledger.

// B0 gate lives here so the family check is one place: the test family (fox+hotdog) only.
export function isTestFamilyPlayer(playerId: string): boolean {
  const row = getDb()
    .prepare('SELECT f.icon_pair AS ip FROM player p JOIN family f ON f.id = p.family_id WHERE p.id = ?')
    .get(playerId) as { ip: string } | undefined;
  return !!row && row.ip.includes('fox') && row.ip.includes('hotdog');
}

// The clean practice rate (correct/min) used as the burst READINESS signal — mirrors the
// recordShadowFluency read exactly (first-try-correct client intervals, outliers trimmed).
export function cleanPracticeRate(playerId: string, code: string): number | null {
  const rows = getDb()
    .prepare(
      "SELECT latency_ms FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL AND warmup = 0 AND dont_know = 0 AND tries = 1 AND correct = 1 AND latency_ms BETWEEN 300 AND 30000 ORDER BY at DESC LIMIT 20",
    )
    .all(playerId, code) as { latency_ms: number }[];
  if (rows.length < SHADOW_MIN_N) return null;
  return (rows.length * 60000) / rows.reduce((a, r) => a + r.latency_ms, 0);
}

export type BurstRunRow = { id: number; skill_code: string; started_at: number; done_n: number; target_n: number };

export function activeBurstRun(playerId: string, sessionRunId: number): BurstRunRow | null {
  return (
    (getDb()
      .prepare(
        'SELECT id, skill_code, started_at, done_n, target_n FROM burst_run WHERE player_id = ? AND session_run_id = ? AND ended_at IS NULL AND done_n < target_n ORDER BY id DESC LIMIT 1',
      )
      .get(playerId, sessionRunId) as BurstRunRow | undefined) ?? null
  );
}

export function createBurstRun(playerId: string, code: string, sessionRunId: number, startedAt: number, targetN: number): number {
  const info = getDb()
    .prepare('INSERT INTO burst_run (player_id, skill_code, session_run_id, started_at, target_n, done_n) VALUES (?, ?, ?, ?, ?, 0)')
    .run(playerId, code, sessionRunId, startedAt, targetN);
  return Number(info.lastInsertRowid);
}

export function bumpBurstRun(id: number): { done_n: number; target_n: number } {
  const db = getDb();
  db.prepare('UPDATE burst_run SET done_n = done_n + 1 WHERE id = ?').run(id);
  return db.prepare('SELECT done_n, target_n FROM burst_run WHERE id = ?').get(id) as { done_n: number; target_n: number };
}

export function endBurstRun(id: number, now: number): void {
  getDb().prepare('UPDATE burst_run SET ended_at = ? WHERE id = ?').run(now, id);
}

// Has a burst already COMPLETED (ended, result written) in this session? Throttles to ≤ 1 burst per
// session, so including fluent skills in the shadow window doesn't flood a session with re-served
// mastered content. (Abandoned runs stay open — ended_at NULL — so they don't count.)
export function sessionHasCompletedBurst(sessionRunId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM burst_run WHERE session_run_id = ? AND ended_at IS NOT NULL LIMIT 1').get(sessionRunId);
}

// The skills that earned a DIPLOMA via a burst crossing in this session (B1) — a milestone,
// credible burst run. Bursts fire only on not-yet-fluent (building) skills, so a milestone here is
// always a NEW crossing. The done-screen reveals these (batched, peak-end). Codes only; the caller
// maps to labels.
export function burstDiplomasInSession(sessionRunId: number): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT br.skill_code AS code FROM burst_run br JOIN burst_result r ON r.burst_run_id = br.id WHERE br.session_run_id = ? AND r.outcome = 'milestone' AND r.credible = 1",
      )
      .all(sessionRunId) as { code: string }[]
  ).map((x) => x.code);
}

// Cooldown key: the most recent time a burst on this skill STARTED (completed or not), so a
// near-miss re-measures only after the cooldown, never grinds.
export function lastBurstStartedAt(playerId: string, code: string): number | null {
  const row = getDb().prepare('SELECT MAX(started_at) m FROM burst_run WHERE player_id = ? AND skill_code = ?').get(playerId, code) as { m: number | null };
  return row?.m ?? null;
}

// The run's resolved attempts (the consecutive block since it started), for the rate computation.
export function burstRunAttempts(playerId: string, code: string, sessionRunId: number, sinceAt: number): { correct: number; latency_ms: number }[] {
  return getDb()
    .prepare(
      'SELECT correct, latency_ms FROM attempt WHERE player_id = ? AND skill_code = ? AND session_run_id = ? AND at >= ? AND voided_at IS NULL AND warmup = 0 AND dont_know = 0 ORDER BY at',
    )
    .all(playerId, code, sessionRunId, sinceAt) as { correct: number; latency_ms: number }[];
}

export function insertBurstResult(r: {
  playerId: string; code: string; burstRunId: number; correct: number; errors: number;
  intervalMs: number; rate: number; aim: number; floor: number; outcome: string; credible: boolean; at: number;
}): void {
  getDb()
    .prepare(
      'INSERT INTO burst_result (player_id, skill_code, burst_run_id, correct, errors, interval_ms, rate, aim, floor, outcome, credible, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(r.playerId, r.code, r.burstRunId, r.correct, r.errors, r.intervalMs, r.rate, r.aim, r.floor, r.outcome, r.credible ? 1 : 0, r.at);
}

// Skills the child has EARNED fluency on — a durable, monotonic decision reconstructed
// from the SPRINT ledger (not the motivational usage_event, which the model never
// reads). A skill is earned the first time a clean sprint crossed its aim, judged
// against the effective-tap floor AS IT WAS THEN (the running floor from strictly
// EARLIER sprints), so a later fast sprint that raises the floor can never un-earn an
// earlier crossing — the whole point. This is the stored DECISION that replaces
// re-litigating a frozen rate against a moving aim: once granted, access is not revoked.
// Recognition rungs the child has CROSSED (accuracy+volume), read from the recog_shadow log
// (recorded once, first-fire). D2a's monotonic ordering gate — the youngest unlocks the next
// recognition rung only after she's accurate on this one. Mirrors everMilestonedSkills.
export function recogCrossedSkills(playerId: string): Set<string> {
  return new Set(
    (getDb().prepare('SELECT skill_code FROM recog_shadow WHERE player_id = ?').all(playerId) as { skill_code: string }[]).map((r) => r.skill_code),
  );
}

export function everMilestonedSkills(playerId: string): Set<string> {
  const player = playerById(playerId);
  const out = new Set<string>();
  if (!player) return out;
  const seedGrade = seedGradeFor(player.school_year);
  const tr = latestToolRate(playerId);
  const sprints = getDb()
    .prepare('SELECT skill_code, correct, errors, duration_s, interval_ms, at FROM sprint WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id')
    .all(playerId) as { skill_code: string; correct: number; errors: number; duration_s: number; interval_ms: number | null; at: number }[];
  let floor = 0;
  for (const sp of sprints) {
    const graded = sp.correct + sp.errors;
    const rate = sp.interval_ms != null && sp.interval_ms > 0 ? (sp.correct * 60000) / sp.interval_ms : (sp.correct * 60) / sp.duration_s;
    const acc = graded > 0 ? sp.correct / graded : 0;
    // A milestone crossing: clean AND at/above the aim it faced at the time.
    if (acc >= SPRINT_ACC_FLOOR && rate >= aimFor(tr, seedGrade, sp.skill_code, floor)) out.add(sp.skill_code);
    floor = Math.max(floor, rate * expectedPhysicalDigits(sp.skill_code)); // this sprint joins the floor for LATER ones
  }
  return out;
}

// ── SCAFFOLDED ACQUISITION — the fade state + the ignition evidence ─────────
// docs/scaffolded-acquisition-spec.md. `acquisition_state` is a CACHE of the ledger (every
// acquisition-managed attempt stores the level it was served at in attempt.acq_level);
// replay() rebuilds it with the same pure fold the live path applies one row at a time.

export type AcquisitionRow = {
  player_id: string;
  skill_code: string;
  fade_level: number;
  strategy: string | null;
  clean: number;
  l0_misses: number;
  started_at: number;
  updated_at: number;
};

// Every acquisition row this child has, by skill code — one query for the whole selection pass.
export function acquisitionStates(playerId: string): Map<string, AcquisitionRow> {
  const rows = getDb().prepare('SELECT * FROM acquisition_state WHERE player_id = ?').all(playerId) as AcquisitionRow[];
  return new Map(rows.map((r) => [r.skill_code, r]));
}

// The level an item for this skill is being SERVED at right now, or null when the skill is not
// under acquisition (no row) or has GRADUATED. This is the server's own record — the client
// never tells us what it was shown.
export function acquisitionLevel(playerId: string, skillCode: string): number | null {
  const r = getDb()
    .prepare('SELECT fade_level FROM acquisition_state WHERE player_id = ? AND skill_code = ?')
    .get(playerId, skillCode) as { fade_level: number } | undefined;
  if (!r || r.fade_level >= ACQ_GRADUATED) return null;
  return r.fade_level;
}

// IGNITION: open the arc for (child, skill) at the fullest scaffold. Idempotent — an existing
// row (mid-arc or graduated) is never reset, so a graduated skill can never be re-ignited.
export function startAcquisition(playerId: string, skillCode: string, strategy: string, now: number): void {
  getDb()
    .prepare(
      `INSERT INTO acquisition_state (player_id, skill_code, fade_level, strategy, clean, l0_misses, started_at, updated_at)
       VALUES (?, ?, 0, ?, 0, 0, ?, ?)
       ON CONFLICT(player_id, skill_code) DO NOTHING`,
    )
    .run(playerId, skillCode, strategy, now, now);
}

// Apply ONE resolved outcome to the fade schedule (advance on CLEAN_TO_ADVANCE clean first-try
// successes, drop a level on any miss/idk, graduate off L3). Same pure transition replay folds.
export function settleAcquisition(playerId: string, skillCode: string, servedLevel: number, ok: boolean, now: number): FadeState | null {
  const db = getDb();
  const row = db
    .prepare('SELECT fade_level, clean, l0_misses FROM acquisition_state WHERE player_id = ? AND skill_code = ?')
    .get(playerId, skillCode) as { fade_level: number; clean: number; l0_misses: number } | undefined;
  if (!row) return null;
  const next = applyOutcome({ level: row.fade_level, clean: row.clean, l0Misses: row.l0_misses }, servedLevel, ok);
  db.prepare('UPDATE acquisition_state SET fade_level = ?, clean = ?, l0_misses = ?, updated_at = ? WHERE player_id = ? AND skill_code = ?')
    .run(next.level, next.clean, next.l0Misses, now, playerId, skillCode);
  return next;
}

// The grownup-alert FALLBACK query (spec §7): skills where even the fullest scaffold keeps
// failing — an input we believed fluent isn't really there. No surface reads this yet; the
// parent-language strategy copy is STRATEGY_COPY in acquisition-content.ts.
export function stalledAcquisitions(playerId: string): { skillCode: string; strategy: string | null }[] {
  return [...acquisitionStates(playerId).values()]
    .filter((r) => r.fade_level < ACQ_GRADUATED && isStalled({ level: r.fade_level, clean: r.clean, l0Misses: r.l0_misses }))
    .map((r) => ({ skillCode: r.skill_code, strategy: r.strategy }));
}

// The last `perSkill` ORDINARY (non-warmup, non-scaffolded) outcomes for each of `codes`,
// newest first — the evidence the ignition test reads (spec §2.3). One query for the whole
// candidate set; a skill with no history simply has no entry.
export function recentSkillOutcomes(playerId: string, codes: string[], perSkill: number): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  if (codes.length === 0) return out;
  const placeholders = codes.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT skill_code, correct, tries, dont_know FROM (
         SELECT skill_code, correct, tries, dont_know,
                ROW_NUMBER() OVER (PARTITION BY skill_code ORDER BY id DESC) rn
           FROM attempt
          WHERE player_id = ? AND voided_at IS NULL AND warmup = 0 AND acq_level IS NULL
            AND skill_code IN (${placeholders})
       ) WHERE rn <= ? ORDER BY skill_code, rn`,
    )
    .all(playerId, ...codes, perSkill) as { skill_code: string; correct: number; tries: number; dont_know: number }[];
  for (const r of rows) {
    const list = out.get(r.skill_code) ?? [];
    list.push(isClean(r.correct, r.tries, r.dont_know === 1));
    out.set(r.skill_code, list);
  }
  return out;
}

// ── ELECTRONICS build capabilities (durable, θ-INERT facts) ─────────────────
// docs/electronics-subject-plan.md §2b; boundary §1. Flat per-(child, capability) records granted
// on ADULT confirmation. THE HARD RULE: no replay / selector / θ / rate / gate path reads these —
// a capability is the making of a thing, never a measurement. These writes are the ONLY thing this
// subsystem persists; they touch none of the ledger tables above.

export type ElectronicsCapabilityRow = { capability: string; granted_at: number; source: string };

// Every capability this child owns, as a set of codes (for the readiness detector's equipment/tier
// clauses). One query per readiness pass.
export function electronicsCapabilities(playerId: string): Set<string> {
  const rows = getDb()
    .prepare('SELECT capability FROM electronics_capability WHERE player_id = ?')
    .all(playerId) as { capability: string }[];
  return new Set(rows.map((r) => r.capability));
}

export function electronicsCapabilityRows(playerId: string): ElectronicsCapabilityRow[] {
  return getDb()
    .prepare('SELECT capability, granted_at, source FROM electronics_capability WHERE player_id = ? ORDER BY granted_at')
    .all(playerId) as ElectronicsCapabilityRow[];
}

// Grant one capability (adult-confirmed). Idempotent — FIRST grant wins, so a re-confirm never
// rewrites the source/time of an existing durable fact. Returns true iff a new row was written.
export function grantElectronicsCapability(playerId: string, capability: string, source: string, now: number): boolean {
  const info = getDb()
    .prepare(
      `INSERT INTO electronics_capability (player_id, capability, granted_at, source)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(player_id, capability) DO NOTHING`,
    )
    .run(playerId, capability, now, source);
  return info.changes > 0;
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
export function applicationSignal(playerId: string, subject: Subject = 'maths'): SignalRow[] {
  const player = playerById(playerId);
  if (!player) return [];
  const tr = latestToolRate(playerId);
  const floor = bestObservedDigitRate(playerId);
  const db = getDb();
  const sprints = db
    .prepare('SELECT skill_code, correct, duration_s, at FROM sprint WHERE player_id = ? AND voided_at IS NULL ORDER BY at, id')
    .all(playerId) as { skill_code: string; correct: number; duration_s: number; at: number }[];
  const attempts = db
    .prepare('SELECT skill_code, latency_ms, at, dont_know FROM attempt WHERE player_id = ? AND voided_at IS NULL AND warmup = 0')
    .all(playerId) as { skill_code: string; latency_ms: number; at: number; dont_know: number }[];

  const out: SignalRow[] = [];
  for (const c of skillsForSubject(subject)) {
    if (c.mode !== 'component') continue;
    // earliest sprint on this component that met its aim (in the skill's own subject units)
    const aim = aimForSkill(c, tr, player.school_year, floor);
    let crossed: number | null = null;
    for (const sp of sprints) {
      if (sp.skill_code !== c.code) continue;
      if ((sp.correct * 60) / sp.duration_s >= aim) {
        crossed = sp.at;
        break;
      }
    }
    if (crossed == null) continue;
    // compounds of the SAME subject that (transitively) require this component. (requires
    // never cross subjects, so the ancestors check already keeps this in-subject; scoping the
    // pool makes it explicit and cheap.)
    const compounds = new Set(skillsForSubject(subject).filter((s) => s.mode === 'compound' && ancestors(s.code).has(c.code)).map((s) => s.code));
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

// Spelling seen-set (A13): the words a child has already been served for one spelling skill,
// each with its most-recent time — a pure read of the attempt ledger (item_json stores the
// seed, and a spelling seed decodes to its word). No new table. Drives nextSpellingWord's
// unseen-first pick and its least-recently-seen recycle on pool exhaustion (A14).
export function spellingSeenWords(playerId: string, code: string): Map<string, number> {
  const rows = getDb()
    .prepare('SELECT item_json, at FROM attempt WHERE player_id = ? AND skill_code = ? AND voided_at IS NULL')
    .all(playerId, code) as { item_json: string; at: number }[];
  const seen = new Map<string, number>();
  for (const r of rows) {
    try {
      const seed = JSON.parse(r.item_json).seed as number | undefined;
      if (seed == null) continue;
      const w = wordForSeed(code, seed);
      if (w && r.at > (seen.get(w) ?? 0)) seen.set(w, r.at);
    } catch {
      /* a malformed/legacy row: skip it */
    }
  }
  return seen;
}
