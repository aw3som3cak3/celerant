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
  session_run_id INTEGER,                   -- the session this item belonged to; NULL outside a session (position-in-session analysis)
  env_json     TEXT,                         -- model-INVISIBLE device fingerprint (JSON); de-confounds a motor rate from the device. NO model path reads it (see deviceEnv.ts)
  acq_level    INTEGER,                     -- SCAFFOLDED ACQUISITION: the fade level this item was SERVED at (0 full … 3 bare), NULL = an ordinary item. Levels 0-2 are scaffolded and also carry warmup=1 (warmup-class: weak-up θ, NEVER a rate). The ledger truth acquisition_state is folded from.
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
  void_reason TEXT,
  source      TEXT                            -- 'sprint' (or NULL, legacy) | 'burst' (WS III, awarded from an invisible run)
);
CREATE INDEX IF NOT EXISTS idx_sprint_player_skill ON sprint(player_id, skill_code, at);

-- LEDGER
CREATE TABLE IF NOT EXISTS tool_rate (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      TEXT NOT NULL REFERENCES player(id),
  digits_per_min REAL NOT NULL,
  at             INTEGER NOT NULL,
  env_json       TEXT,                        -- model-INVISIBLE device fingerprint of the probe run (JSON); the writing speed's confound control (see deviceEnv.ts)
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

-- Per-child READ token (fluency-signal-contract v0.2). Authorises reading exactly ONE
-- child's flytsignal — least privilege vs a family session (which could read every
-- sibling). Minted once by the guardian (parent-PIN gated) at account creation; the raw
-- token is shown once and only its SHA-256 is stored. Non-expiring (a term-long
-- credential), revocable when consent is withdrawn. player.id (a stable uuid) is the
-- identifier the consumer stores; this token is the separate, rotatable secret.
CREATE TABLE IF NOT EXISTS player_read_token (
  token_hash TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES player(id),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
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
  started_at  INTEGER NOT NULL,
  subject     TEXT NOT NULL DEFAULT 'maths',  -- primary subject (= subjects[0]; spelling scoping)
  subjects    TEXT                            -- JSON array of ACTIVE subjects for a MIXED Ova; NULL = single-subject (falls back to subject)
);
CREATE INDEX IF NOT EXISTS idx_session_run_player ON session_run(player_id, started_at);

CREATE TABLE IF NOT EXISTS card (
  player_id   TEXT NOT NULL REFERENCES player(id),
  skill_code  TEXT NOT NULL,
  attempt_id  INTEGER NOT NULL REFERENCES attempt(id),
  earned_at   INTEGER NOT NULL,
  PRIMARY KEY (player_id, skill_code)
);

-- MULTI-ROW (id PK, not family_id): a family has one ACTIVE goal (reached_at NULL, acknowledged_at
-- NULL) plus any number of CELEBRATED goals (reached_at set, acknowledged_at NULL) that linger until
-- the parent presses "Klar" (sets acknowledged_at → archived, hidden). carry_offset seeds a new
-- goal with points carried over from a replaced unfinished goal. Cooperative + aggregate-only as
-- ever — no per-child column anywhere here.
CREATE TABLE IF NOT EXISTS family_goal (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id       TEXT NOT NULL REFERENCES family(id),
  label           TEXT NOT NULL,
  target          INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  reached_at      INTEGER,
  acknowledged_at INTEGER,
  carry_offset    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_family_goal_family ON family_goal(family_id, created_at);

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

-- Per-child DEFAULT target ("what I'm collecting for"). Latest-wins, not a ledger.
-- Each kid steers their own sessions; the cats stay family-shared and progress stays
-- pooled (targetAllocationCounts by family), so "personal steering, shared cats". A kid
-- with no row falls back to the family_shared_target, then the next uncollected cat.
CREATE TABLE IF NOT EXISTS player_target (
  player_id   TEXT PRIMARY KEY REFERENCES player(id),
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

-- shadow_fluency (one-ova-track WS III-a). The PASSIVE crossing detector's log — invisible,
-- read by no user-facing path. When a mastered skill's clean practice rate first crosses the
-- trigger (factor × the sprint-calibrated aim), one row is written with its inputs SNAPSHOTTED
-- at fire time (the stored-crossing invariant — never a recomputation against a moving aim).
-- PRIMARY KEY (player,skill) ⇒ only the FIRST fire is kept: "did it look ready, and WHEN".
-- This is a SHADOW: it triggers nothing, awards nothing, is compared offline to known fluency.
CREATE TABLE IF NOT EXISTS shadow_fluency (
  player_id     TEXT NOT NULL REFERENCES player(id),
  skill_code    TEXT NOT NULL,
  at            INTEGER NOT NULL,   -- when it first crossed the trigger
  practice_rate REAL NOT NULL,      -- the measured practice rate at fire (correct/min)
  aim           REAL NOT NULL,      -- the sprint-calibrated aim it was judged against
  factor        REAL NOT NULL,      -- the trigger factor applied (0.5 to start)
  floor         REAL NOT NULL,      -- the demonstrated-throughput tap floor at fire
  window_n      INTEGER NOT NULL,   -- clean first-try-correct attempts in the window
  PRIMARY KEY (player_id, skill_code)
);

-- recog_shadow (internal-fluency lane for choice rungs, spelling_t0…t1c). Records — the FIRST time a
-- child is accurate on a recognition rung with enough clean samples — their practice rate vs the
-- (uncalibrated placeholder) aim. TWO roles: (D2a) the ACCURACY+VOLUME crossing is the monotonic
-- ORDERING gate — recogCrossedSkills → recogFluent unlocks the next rung, so the youngest climbs
-- t0→t0b→… in order (an åk≥1 child seed-passes and skips it). (D2b, later) the stored RATE stays
-- data to calibrate the aim before adding a rate threshold. Snapshotted at fire time (stored-crossing
-- invariant); one row per (player, skill).
CREATE TABLE IF NOT EXISTS recog_shadow (
  player_id     TEXT NOT NULL REFERENCES player(id),
  skill_code    TEXT NOT NULL,
  at            INTEGER NOT NULL,
  practice_rate REAL NOT NULL,   -- clean first-try-correct recognitions/min at fire
  aim           REAL NOT NULL,   -- the (placeholder) recognition aim it was judged against
  accuracy      REAL NOT NULL,   -- first-try accuracy over the window at fire
  window_n      INTEGER NOT NULL,
  PRIMARY KEY (player_id, skill_code)
);

-- audio_review: Erik's ear-vet verdict for one pre-generated spelling clip (tier + word). Global,
-- not per-family — it records which Sofie clips sound right vs wrong (e.g. "hämta" was misheard).
-- The granska tool writes it; the carrier-sentence regeneration reads the 'bad' rows. One per clip.
CREATE TABLE IF NOT EXISTS audio_review (
  tier    TEXT NOT NULL,   -- 'recog' | 't2' | 't3'
  word    TEXT NOT NULL,
  verdict TEXT NOT NULL,   -- 'ok' | 'bad'
  note    TEXT,
  at      INTEGER NOT NULL,
  PRIMARY KEY (tier, word)
);

-- question_log: every RESOLVED wrong answer or "vet inte" (idk), with the QUESTION rebuilt from its
-- seed (prompt, correct answer, and for a spelling clip the WORD) — so a generated/randomised item
-- that is itself broken (misheard audio, ambiguous prompt, wrong key) can be spotted, not hidden
-- behind an opaque seed. Warm-up probes excluded. Written at grade time; read by the granska review.
CREATE TABLE IF NOT EXISTS question_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL,
  skill_code TEXT NOT NULL,
  subject    TEXT,
  seed       INTEGER,
  prompt     TEXT,          -- rendered prompt string ("" for audio-only)
  answer     TEXT,          -- the CORRECT answer as text — for spelling, the word
  given      TEXT,          -- what the child gave (NULL for idk)
  dont_know  INTEGER NOT NULL DEFAULT 0,
  detail     TEXT,          -- full item JSON (choice spec / steps) to reproduce
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_question_log_at ON question_log(at);
CREATE INDEX IF NOT EXISTS ix_question_log_skill ON question_log(skill_code, at);

-- burst_run / burst_result (WS III burst — PHASE B0, SHADOW). A burst is a short CONSECUTIVE run of
-- ONE mastered sprintable skill, served inline in ordinary practice and SILENTLY timed, to read
-- capability under sprint-like conditions (a warmed-up same-shape batch) WITHOUT the stopwatch. B0 is
-- a SHADOW: it serves the run and records the measurement but AWARDS NOTHING — burst_result is read
-- OFFLINE (vs sprint ground-truth) and by NO award/replay/unlock path. The award (done-screen diploma,
-- fluent-drop) is B1, gated on B0 agreement. burst_run is the ephemeral in-flight run state.
CREATE TABLE IF NOT EXISTS burst_run (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      TEXT NOT NULL REFERENCES player(id),
  skill_code     TEXT NOT NULL,
  session_run_id INTEGER,             -- the session this run lives in (a run stays within one session)
  started_at     INTEGER NOT NULL,
  target_n       INTEGER NOT NULL,    -- resolved items the run needs (BURST_ITEMS)
  done_n         INTEGER NOT NULL DEFAULT 0,
  ended_at       INTEGER              -- set on completion (result written) or abandonment
);
CREATE INDEX IF NOT EXISTS ix_burst_run_active ON burst_run(player_id, session_run_id, ended_at);

-- One COMPLETED burst's measurement, snapshotted at fire time (aim/rate/floor) — the stored-crossing
-- invariant, so a B1 award reads a stored value, never a recomputation against a moving aim. SHADOW in
-- B0: no award path reads this; it is compared offline to the sprint ledger to decide the cutover.
CREATE TABLE IF NOT EXISTS burst_result (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES player(id),
  skill_code   TEXT NOT NULL,
  burst_run_id INTEGER,
  correct      INTEGER NOT NULL,
  errors       INTEGER NOT NULL,
  interval_ms  INTEGER NOT NULL,   -- summed VALID client intervals over the run
  rate         REAL NOT NULL,      -- correct/min = correct*60000 / interval_ms
  aim          REAL NOT NULL,      -- the sprint-calibrated aim at fire (snapshot)
  floor        REAL NOT NULL,      -- demonstrated-throughput tap floor at fire (snapshot)
  outcome      TEXT NOT NULL,      -- classifySprint kind: 'milestone' | 'near_miss' | 'collapse'
  credible     INTEGER NOT NULL,   -- accuracy held (sprintRateIsCredible)
  at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_burst_result_skill ON burst_result(player_id, skill_code, at);

-- image_review: Erik's EYE-vet verdict for one English on-ramp picture asset — a verb pictogram
-- (SVG), a colour swatch, or a noun emoji. Sibling of audio_review (granska for the eye instead of
-- the ear). Global, not per-family; the granska-bilder tool writes it, the picto rework reads the
-- 'bad' rows. kind = 'picto' | 'swatch' | 'noun'; word = the English word. One row per (kind, word).
CREATE TABLE IF NOT EXISTS image_review (
  kind    TEXT NOT NULL,
  word    TEXT NOT NULL,
  verdict TEXT NOT NULL,   -- 'ok' | 'bad'
  note    TEXT,
  at      INTEGER NOT NULL,
  PRIMARY KEY (kind, word)
);

-- acquisition_state (SCAFFOLDED ACQUISITION — docs/scaffolded-acquisition-spec.md §5). The
-- per-(child, skill) fade level of the self-teaching derived-fact scaffold. This is a CACHE, like
-- the ability cache: the truth is the attempt ledger (attempt.acq_level on every acquisition-managed
-- attempt), and replay() rebuilds this table by folding those rows (foldFade). Model-invisible to
-- fluency: nothing here is read by the rate/aim/sprint path, and the selector reads it only through
-- the narrow acquisition-eligibility touch (a ready-but-unlearned skill stays selectable).
CREATE TABLE IF NOT EXISTS acquisition_state (
  player_id  TEXT NOT NULL REFERENCES player(id),
  skill_code TEXT NOT NULL,
  fade_level INTEGER NOT NULL,          -- 0 full | 1 partial | 2 cued | 3 bare | 4 GRADUATED (monotonic)
  strategy   TEXT,                      -- the derivation chosen at ignition (StrategyId), kept stable across the arc
  clean      INTEGER NOT NULL DEFAULT 0, -- consecutive first-try successes at the current level
  l0_misses  INTEGER NOT NULL DEFAULT 0, -- consecutive misses at L0 — the grownup-alert fallback seam (§7)
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, skill_code)
);

-- electronics_capability (docs/electronics-subject-plan.md §2b; boundary §1). A flat, DURABLE,
-- θ-INERT fact per (child, capability): the equipment/safety capabilities a child has acquired
-- (elec_cap_owns_breadboard, elec_cap_tier_3v, elec_cap_tier_5v, elec_cap_soldering) and one
-- build_<id>_done per completed build. Granted on ADULT confirmation (an adult is already in the
-- loop via the build alert). THE HARD RULE (same class as the motivational layer above): replay()
-- never reads this table, and no selector / θ / rate / gate / ledger path ever reads it — a build
-- capability is the making of a thing, never a measurement. Unlike the ability/acquisition_state
-- CACHES it is NOT rebuilt by replay: it is a source-of-truth durable fact (an adult said so), so
-- dropping a row LOSES data (it changes no θ, but it un-grants a real capability). First grant wins
-- (idempotent); a completed build is permanent.
CREATE TABLE IF NOT EXISTS electronics_capability (
  player_id  TEXT NOT NULL REFERENCES player(id),
  capability TEXT NOT NULL,          -- 'elec_cap_*' | 'build_<id>_done'
  granted_at INTEGER NOT NULL,
  source     TEXT NOT NULL,          -- 'adult_confirm' | 'build:<build_id>'
  PRIMARY KEY (player_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_electronics_capability_player ON electronics_capability(player_id, granted_at);

`;
