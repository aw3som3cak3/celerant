import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';

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

  return db;
}

const MIGRATIONS = [
  'ALTER TABLE player ADD COLUMN session_target INTEGER NOT NULL DEFAULT 20',
];

export function getDb(): Database.Database {
  if (!globalForDb.__db) {
    globalForDb.__db = open();
  }
  return globalForDb.__db;
}
