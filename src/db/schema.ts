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

-- A family is an unordered PAIR of icons (§4.1). icon_pair is the CANONICAL key
-- ("a+b", the two keys sorted then joined), and the UNIQUE lives on it — so the
-- database itself, not an app-layer convention, guarantees "a+b" and "b+a" are
-- the same family and cannot both exist. icon_display keeps the ENTERED order,
-- for showing the family as it was made. Two PINs: entry (children know it) and
-- parent.
CREATE TABLE IF NOT EXISTS family (
  id           TEXT PRIMARY KEY,
  icon_pair    TEXT NOT NULL UNIQUE,        -- canonical (sorted): the uniqueness key
  icon_display TEXT NOT NULL DEFAULT '',    -- entered order, for display only
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
  session_target INTEGER NOT NULL DEFAULT 10, -- items per session (10 globally); a parent can shorten further for young children
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
  warmup       INTEGER NOT NULL DEFAULT 0,  -- onboarding-ramp §4: warm-up item; θ updates weakly on success
  latency_ms   INTEGER NOT NULL,            -- CLIENT-measured per-item interval (input-timing Phase A)
  at           INTEGER NOT NULL,
  idem_key     TEXT,                        -- client idempotency key; NULL on legacy/server-generated rows
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
  interval_ms INTEGER,                       -- summed valid client intervals (input-timing Phase A); NULL = legacy wall-clock row
  sprint_key  TEXT,                          -- client idempotency key for the run; NULL on legacy rows
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
  rd           REAL NOT NULL DEFAULT 1.0,   -- rating deviation (Glicko-2), one-sided
  volatility   REAL NOT NULL DEFAULT 0.06,  -- Glicko-2 sigma
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
  warmup      INTEGER NOT NULL DEFAULT 0,
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

-- LEDGER (instrumentation.md §4.1). Append-only event stream for family goals, so
-- the PATH a goal took is recoverable, not just its final state. goal_label and
-- target are denormalised: goals get cleared and replaced, but the history under
-- each must survive independently — never join this to a live family_goal row.
-- NEVER records per-child contribution (motivation §4.1): 'progressed' is the
-- family-wide count crossing a threshold, never who triggered it.
CREATE TABLE IF NOT EXISTS goal_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id   TEXT NOT NULL REFERENCES family(id),
  goal_label  TEXT NOT NULL,
  target      INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('created','progressed','reached','cleared','retargeted')),
  value       INTEGER,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_event_family ON goal_event(family_id, at);

-- Cat collection reward layer (celerant-cat-collection-spec.md). MOTIVATIONAL
-- LAYER: strictly downstream, replay() never reads these; dropping every row
-- changes no θ. A completed session is DIRECTED to one target (a cat, or left for
-- the family goal). Cats unlock at their cost (20 sessions). One allocation row
-- per completed session (upserted while the kid is on the done screen, then
-- fixed); the reward state is a pure count over these rows, so it is idempotent.
-- Session-contingent and flat: never per-answer, never streak-based. The family
-- goal is the RESIDUAL (completed sessions minus those directed to a cat/prop),
-- so directing a session to a cat is genuinely not spent on the goal.
CREATE TABLE IF NOT EXISTS session_allocation (
  session_run_id INTEGER PRIMARY KEY REFERENCES session_run(id),
  player_id      TEXT NOT NULL REFERENCES player(id),
  family_id      TEXT NOT NULL REFERENCES family(id),
  target_kind    TEXT NOT NULL CHECK (target_kind IN ('cat','family','prop')),
  target_id      TEXT NOT NULL,
  at             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_allocation_family ON session_allocation(family_id, target_kind, target_id);

-- Sprint milestone BONUS units (celerant sprint-reward). A one-time reward for a
-- child crossing a skill's fluency aim on a sprint, paid into the SAME cat/family/
-- prop economy as sessions but in raw UNITS that are NOT sessions — so it advances
-- a cat or the goal but NEVER touches the weekly "pass"/displacement wellbeing
-- counter (which reads session_run only). Keyed on the crossing sprint (one per
-- skill, since crossing makes the skill fluent → ineligible), so the bonus is
-- one-time by construction; the child may REDIRECT it (upsert), never farm it.
-- MOTIVATIONAL LAYER: replay() never reads this; dropping every row changes no θ.
CREATE TABLE IF NOT EXISTS bonus_allocation (
  sprint_id   INTEGER PRIMARY KEY REFERENCES sprint(id),
  player_id   TEXT NOT NULL REFERENCES player(id),
  family_id   TEXT NOT NULL REFERENCES family(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('cat','family','prop')),
  target_id   TEXT NOT NULL,
  units       INTEGER NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bonus_allocation_family ON bonus_allocation(family_id, target_kind, target_id);

-- The family's current shared DEFAULT target ("let's all collect for Pythagoras").
-- Latest-wins settings row (SHARED_TARGET_SET), not a ledger. A completed session
-- auto-directs here unless the kid redirects it. Cooperative, family-wide.
CREATE TABLE IF NOT EXISTS family_shared_target (
  family_id   TEXT PRIMARY KEY REFERENCES family(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('cat','family','prop')),
  target_id   TEXT NOT NULL,
  at          INTEGER NOT NULL
);

-- LEDGER (instrumentation.md §4.3). Append-only stream of motivational-layer
-- events (not attempts/sprints/goals) to correlate against usage. Invisible to
-- the child; changes no behaviour; in the export. NOT engagement instrumentation
-- (§6): no dwell time, no funnels — only the discrete events the map and shelf
-- raise questions about.
CREATE TABLE IF NOT EXISTS usage_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  kind        TEXT NOT NULL,
  detail      TEXT,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_event_player ON usage_event(player_id, at);

-- LEDGER (evidence-and-theses.md §2). A clean ruler: a fixed instrument that
-- NEVER counts toward θ, never appears in practice, never enters any adaptive
-- decision. THE HARD RULE: nothing in replay(), the selector, the θ update, or
-- the unlock gate ever reads this table. Write-only from the system's side,
-- read-only from the analyst's. If any model path can see it, the evidence is
-- void. Append-only.
CREATE TABLE IF NOT EXISTS probe (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id       TEXT NOT NULL REFERENCES player(id),
  probe_set       TEXT NOT NULL,       -- 'arith_v1' | 'transfer_v1'
  item_ref        TEXT NOT NULL,       -- stable id of the fixed item within the set
  features_json   TEXT NOT NULL,       -- same feature schema as instrumentation §2
  given           TEXT,
  correct         INTEGER NOT NULL,
  latency_ms      INTEGER NOT NULL,
  administered_at INTEGER NOT NULL,
  is_baseline     INTEGER NOT NULL DEFAULT 0,  -- §6: baseline rows are marked
  probe_version   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_probe_player ON probe(player_id, administered_at);

-- Pre-registration (evidence-and-theses.md §3). Append-only, written BEFORE data
-- collection: a thesis whose registered_at predates its supporting data is
-- credible; one written after is a story. outcome is filled in only LATER.
CREATE TABLE IF NOT EXISTS prereg (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id     TEXT NOT NULL UNIQUE,
  statement     TEXT NOT NULL,
  measure       TEXT NOT NULL,
  threshold     TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  outcome       TEXT,                  -- 'confirmed' | 'refuted' | 'inconclusive'
  resolved_at   INTEGER
);

-- GROUND / acquisition phase (GROUND-phase spec, SHADOW mode). A child interprets a
-- concrete pictorial situation as combine vs separate — the MEANING behind add/sub,
-- before drilling the symbol. Append-only, additive, REVERSIBLE: never folded into
-- computeAbility, and the ground->drill criterion derived from it is computed but not
-- enforced (the drill loop reads it through an always-satisfied seam). If GROUND
-- proves unnecessary these rows sit inert and the derived state is simply never read.
CREATE TABLE IF NOT EXISTS ground_event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   TEXT NOT NULL REFERENCES player(id),
  structure   TEXT NOT NULL,       -- the CORRECT concept key: 'combine'|'separate'|'count'|'numeral'|'sum'
  scene_json  TEXT NOT NULL,       -- the item shown
  chosen      TEXT NOT NULL,       -- what the child picked
  correct     INTEGER NOT NULL,    -- chosen matched
  interval_ms INTEGER,             -- client-measured time to answer (fluency); NULL on untimed/legacy rows
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ground_event_player ON ground_event(player_id, structure, at);
`;
