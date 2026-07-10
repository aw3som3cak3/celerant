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

  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__db) {
    globalForDb.__db = open();
  }
  return globalForDb.__db;
}
