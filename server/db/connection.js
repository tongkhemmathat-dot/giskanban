// better-sqlite3 singleton connection.
// DB_PATH env var controls the file location (defaults to ./data/jobcard.db).
// Use DB_PATH=:memory: for tests.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/jobcard.db';

// Make sure the parent folder for the db file exists (skip for in-memory db).
if (DB_PATH !== ':memory:') {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
