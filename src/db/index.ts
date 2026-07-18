import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';
import { seedPrereg } from './prereg-seed';
import { runStartupMigration, runOneOffPlacements } from './replay';

// A single connection, reused across hot reloads in dev via a global.
const globalForDb = globalThis as unknown as { __db?: Database.Database };

function open(): Database.Database {
  // On a host with a mounted volume (e.g. Fly), point DATABASE_PATH at it, e.g.
  // /data/celerant.db. Locally it defaults to ./data/celerant.db.
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'celerant.db');
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA); // bundled, not read from disk

  // Idempotent migrations for pre-existing DBs. SCHEMA is all CREATE ... IF NOT
  // EXISTS, so a new column on an existing table must be added explicitly. On a
  // fresh DB the column already exists and the ALTER throws "duplicate column
  // name", which is expected and ignored.
  for (const stmt of MIGRATIONS) {
    try {
      db.exec(stmt);
    } catch {
      /* column already present */
    }
  }

  // Tail of the migration: canonicalise legacy families and heal every ability
  // cache under the current model. Uses this db handle directly (not getDb), so
  // it can't recurse through open(). Idempotent — guarded by a meta flag.
  runStartupMigration(db);
  runOneOffPlacements(db);

  return db;
}

const MIGRATIONS = [
  'ALTER TABLE player ADD COLUMN session_target INTEGER NOT NULL DEFAULT 20',
  // instrumentation.md §3. Existing ability rows keep their θ and take default
  // rd/volatility; the cache self-heals to true Glicko values on the next replay
  // (any void / årskurs change / "bygg om cache"). A fresh DB gets them from CREATE.
  'ALTER TABLE ability ADD COLUMN rd REAL NOT NULL DEFAULT 1.0',
  'ALTER TABLE ability ADD COLUMN volatility REAL NOT NULL DEFAULT 0.06',
  // Canonical-pair fix: entered order moves to icon_display; icon_pair becomes the
  // canonical (sorted) unique key. The startup migration backfills legacy rows.
  "ALTER TABLE family ADD COLUMN icon_display TEXT NOT NULL DEFAULT ''",
  // Warm-up ramp (onboarding-ramp §4): mark warm-up attempts so replay reproduces
  // the reduced-weight update and the clean analyses can exclude them.
  'ALTER TABLE attempt ADD COLUMN warmup INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pending_item ADD COLUMN warmup INTEGER NOT NULL DEFAULT 0',
  // Two children in a family can never share an icon. The CREATE TABLE carries a
  // UNIQUE (family_id, icon), but a player table that predates that clause wouldn't
  // have it — this index guarantees it at the DB layer regardless, as a backstop to
  // the app-level checks in /api/player and /api/player/icon. Idempotent; a no-op
  // where the constraint already holds. (Throws only if a duplicate already exists,
  // which the try/catch swallows — there are none today.)
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_player_family_icon ON player(family_id, icon)',
];

export function getDb(): Database.Database {
  if (!globalForDb.__db) {
    globalForDb.__db = open();
    // Register the theses once, now — before any probe data (evidence §3). Runs
    // after __db is assigned, so it does not recurse through open().
    seedPrereg(globalForDb.__db, Date.now());
  }
  return globalForDb.__db;
}
