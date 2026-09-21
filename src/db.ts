import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadDotenv } from './server/env.ts'

export type Db = DatabaseSync

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS ci (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS relation (
  from_ci TEXT NOT NULL REFERENCES ci(id) ON DELETE CASCADE,
  to_ci   TEXT NOT NULL REFERENCES ci(id) ON DELETE CASCADE,
  label   TEXT NOT NULL DEFAULT 'depends_on',
  PRIMARY KEY (from_ci, to_ci, label));
CREATE TABLE IF NOT EXISTS service (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS service_ci (
  service_id TEXT NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  ci_id TEXT NOT NULL REFERENCES ci(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, ci_id));
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY, ci_id TEXT NOT NULL REFERENCES ci(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','error','critical')),
  message TEXT NOT NULL, source TEXT);
CREATE INDEX IF NOT EXISTS event_occurred ON event(occurred_at);
CREATE TABLE IF NOT EXISTS analysis (
  id INTEGER PRIMARY KEY, target_event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  window_minutes INTEGER NOT NULL, created_at TEXT NOT NULL, model TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analysis_candidate (
  analysis_id INTEGER NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  p_root_cause REAL NOT NULL, p_co_symptom REAL NOT NULL, p_unrelated REAL NOT NULL,
  confidence REAL NOT NULL, verdict TEXT NOT NULL,
  hops INTEGER, path TEXT, delta_seconds INTEGER NOT NULL, p_origin REAL,
  PRIMARY KEY (analysis_id, event_id));
`

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; ${SCHEMA}`)
  // ponytail: no migrations; guarded ALTER for a column added after DBs existed. Drop once every DB has it.
  if (!(db.prepare('PRAGMA table_info(analysis_candidate)').all() as { name: string }[]).some((c) => c.name === 'p_origin'))
    db.exec('ALTER TABLE analysis_candidate ADD COLUMN p_origin REAL')
  return db
}

let singleton: Db | undefined
export function getDb(): Db {
  if (!singleton) {
    loadDotenv()
    singleton = openDb(process.env.DB_PATH ?? './data/jev-rca.db')
  }
  return singleton
}

/** Wrap in a transaction; rolls back on throw. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
