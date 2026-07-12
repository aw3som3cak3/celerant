// The schema, inlined as a string so it is bundled with the server and needs no
// filesystem read at runtime (works the same in dev, a Docker image, or a
// standalone build). See docs/ui-lifecycle.md §2.
//
// THE ONE RULE (§1): attempt, sprint, tool_rate are LEDGERS — append-only, with
// only two permitted mutations, a tombstone (voided_at) and a change of owner
// (player_id reassignment). `ability` is a CACHE, derivable by replaying the
// ledgers in `at` order; it may be dropped and rebuilt at any time.

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A family is an unordered PAIR of icons (§4.1). icon_pair is "a+b", two known
-- keys sorted and joined. Two PINs: entry (children know it) and parent.
CREATE TABLE IF NOT EXISTS family (
  id           TEXT PRIMARY KEY,
  icon_pair    TEXT NOT NULL UNIQUE,
  pin_hash     TEXT NOT NULL,
  parent_hash  TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);

-- A player is a single icon, unique within their family only.
CREATE TABLE IF NOT EXISTS player (
  id           TEXT PRIMARY KEY,
  family_id    TEXT NOT NULL REFERENCES family(id),
  icon         TEXT NOT NULL,
  school_year  INTEGER NOT NULL CHECK (school_year BETWEEN 0 AND 9),  -- 0 = förskoleklass
  stretch      INTEGER NOT NULL DEFAULT 0,   -- "svårare": shifts selector target 0.80 -> 0.65
  session_target INTEGER NOT NULL DEFAULT 20, -- items per session; shorter for young children
  created_at   INTEGER NOT NULL,
  archived_at  INTEGER,
  UNIQUE (family_id, icon)
);

-- LEDGER. skill_code is a string, NOT a foreign key: skills live in code
-- (src/skills.ts). replay() skips codes it no longer knows.
CREATE TABLE IF NOT EXISTS attempt (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES player(id),
  skill_code   TEXT NOT NULL,
  item_json    TEXT NOT NULL,
  given        TEXT,
  correct      INTEGER NOT NULL,
  tries        INTEGER NOT NULL,
  dont_know    INTEGER NOT NULL DEFAULT 0,
  latency_ms   INTEGER NOT NULL,
  at           INTEGER NOT NULL,
  voided_at    INTEGER,
  void_reason  TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempt_player ON attempt(player_id, at);
CREATE INDEX IF NOT EXISTS idx_attempt_player_skill ON attempt(player_id, skill_code, at);

-- LEDGER
CREATE TABLE IF NOT EXISTS sprint (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  skill_code  TEXT NOT NULL,
  duration_s  INTEGER NOT NULL,
  correct     INTEGER NOT NULL,
  errors      INTEGER NOT NULL,
  at          INTEGER NOT NULL,
  voided_at   INTEGER,
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_sprint_player_skill ON sprint(player_id, skill_code, at);

-- LEDGER
CREATE TABLE IF NOT EXISTS tool_rate (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      TEXT NOT NULL REFERENCES player(id),
  digits_per_min REAL NOT NULL,
  at             INTEGER NOT NULL,
  voided_at      INTEGER
);

-- CACHE. Droppable. Rebuilt by replay(). rate is NULL iff rate_state='unknown'.
CREATE TABLE IF NOT EXISTS ability (
  player_id    TEXT NOT NULL REFERENCES player(id),
  skill_code   TEXT NOT NULL,
  theta        REAL NOT NULL,
  n_obs        INTEGER NOT NULL,
  last_seen_at INTEGER,
  rate         REAL,
  rate_state   TEXT NOT NULL CHECK (rate_state IN ('unknown','provisional','measured')),
  PRIMARY KEY (player_id, skill_code)
);

-- A session authorises a FAMILY, never a player (§6.6).
CREATE TABLE IF NOT EXISTS session (
  token_hash TEXT PRIMARY KEY,
  family_id  TEXT NOT NULL REFERENCES family(id),
  parent     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Ephemeral scratch, NOT a ledger: the served item's answer key, held
-- server-side so the client never sees it (§6.7). PERSISTED rather than in
-- memory so a machine suspend/restart can't orphan an in-flight answer (which
-- would drop the answer and stall the session counter). Dropping every row here
-- loses only in-flight items, which the client simply re-fetches. replay() never
-- reads it. No FK: an item may outlive a brief player edit, and it self-expires.
CREATE TABLE IF NOT EXISTS pending_item (
  item_id     TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  skill_code  TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  answer      TEXT NOT NULL,
  steps_json  TEXT NOT NULL,
  seed        INTEGER NOT NULL,
  scores_json TEXT NOT NULL,
  served_at   INTEGER NOT NULL,
  tries       INTEGER NOT NULL DEFAULT 0,
  first_wrong TEXT
);

-- ── The motivational layer (docs/motivation.md) ────────────────────────────
-- STRICTLY DOWNSTREAM OF THE MODEL. replay() never reads these tables; dropping
-- every row here changes no θ, no rate, no unlock. No points/xp/coin/streak.

CREATE TABLE IF NOT EXISTS session_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  target      INTEGER NOT NULL DEFAULT 20,
  completed   INTEGER NOT NULL DEFAULT 0,
  ended_at    INTEGER,
  ended_early INTEGER NOT NULL DEFAULT 0,
  started_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_run_player ON session_run(player_id, started_at);

CREATE TABLE IF NOT EXISTS card (
  player_id   TEXT NOT NULL REFERENCES player(id),
  skill_code  TEXT NOT NULL,
  attempt_id  INTEGER NOT NULL REFERENCES attempt(id),
  earned_at   INTEGER NOT NULL,
  PRIMARY KEY (player_id, skill_code)
);

CREATE TABLE IF NOT EXISTS family_goal (
  family_id   TEXT PRIMARY KEY REFERENCES family(id),
  label       TEXT NOT NULL,
  target      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  reached_at  INTEGER
);
`;
