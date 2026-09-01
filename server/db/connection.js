// better-sqlite3 singleton connection.
// DB_PATH env var controls the file location (defaults to ./data/jobcard.db).
// Use DB_PATH=:memory: for tests.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/jobcard.db';

function openConnection(path) {
  // Make sure the parent folder for the db file exists (skip for in-memory db).
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const conn = new Database(path);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  return conn;
}

let current = openConnection(DB_PATH);

// TEST-ONLY escape hatch. Services import the default export once, at module
// load time (`import db from '../db/connection.js'`), and hold onto that
// reference for the lifetime of the process — so pointing tests at a fresh,
// isolated per-test database (see tests/setup.js's createTestDb()) can't work
// by just re-importing this module. Instead the default export below is a
// Proxy that forwards every call/property access to whatever `current`
// points at *right now*, and __setTestDb swaps `current`. This keeps
// production code (which never calls __setTestDb) a plain singleton, while
// letting tests/helpers/testDb.js swap the underlying connection before each
// test with zero changes to any service. See that file for the usage
// pattern — Agent 3 and Agent 6's API tests should reuse it as-is.
export function __setTestDb(newDb) {
  current = newDb;
}

const db = new Proxy(
  {},
  {
    get(_target, prop, _receiver) {
      const value = current[prop];
      return typeof value === 'function' ? value.bind(current) : value;
    },
    set(_target, prop, value) {
      current[prop] = value;
      return true;
    },
  },
);

export default db;
