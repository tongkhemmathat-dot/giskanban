// server/db/connection.js — unified async DB access, two backends behind one
// interface: TURSO_DATABASE_URL set -> @libsql/client against Turso (a real
// shared, concurrency-safe database — used by the Vercel demo, api/index.js,
// which previously had no working cross-instance persistence at all); no
// TURSO_DATABASE_URL -> better-sqlite3 against a local file (the documented
// Docker Compose / local dev path — unchanged "one file, easy backup"
// property, no new network dependency for real production use).
//
// better-sqlite3 is fully synchronous; @libsql/client is fully async (it's a
// network client). To keep exactly one service-layer code path for both,
// every call here returns a Promise even on the sqlite backend (an
// already-resolved one) — `await db.get(...)` works identically regardless
// of backend.
//
// Call shape: db.get(sql, args) / db.all(sql, args) / db.run(sql, args) —
// args is a plain array of positional `?` values (both drivers accept this).
// db.run() resolves to { changes, lastInsertRowid } (better-sqlite3's
// field names — the turso backend maps rowsAffected/lastInsertRowid onto
// them so callers don't care which backend is live).
//
// Transactions: db.transaction(asyncFn) runs asyncFn() wrapped in a real
// transaction and returns its result. Call sites keep using the same
// `db.get/all/run` *inside* asyncFn (no separate `tx` handle to thread
// through) — AsyncLocalStorage carries the active transaction through
// whatever async call chain runs inside the callback, per JS execution
// context, so concurrent requests never cross-talk.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';

const txStore = new AsyncLocalStorage();

function toRunResult(rowsAffected, lastInsertRowid) {
  return {
    changes: rowsAffected,
    lastInsertRowid: lastInsertRowid === undefined || lastInsertRowid === null ? undefined : Number(lastInsertRowid),
  };
}

// --- Turso (@libsql/client) backend -----------------------------------------
export function createTursoBackend(url, authToken) {
  const client = createClient({ url, authToken });

  async function withExecutor(fn) {
    const active = txStore.getStore();
    return fn(active ?? client);
  }

  async function get(sql, args = []) {
    const rs = await withExecutor((exec) => exec.execute({ sql, args }));
    return rs.rows[0];
  }
  async function all(sql, args = []) {
    const rs = await withExecutor((exec) => exec.execute({ sql, args }));
    return rs.rows;
  }
  async function run(sql, args = []) {
    const rs = await withExecutor((exec) => exec.execute({ sql, args }));
    return toRunResult(rs.rowsAffected, rs.lastInsertRowid);
  }
  async function exec(sql) {
    return withExecutor((exec_) => exec_.executeMultiple(sql));
  }
  // no-op: PRAGMAs like journal_mode don't apply to a remote connection.
  // foreign_keys is confirmed ON by default on Turso (verified empirically,
  // including inside a fresh interactive transaction) — set explicitly here
  // too as cheap insurance since this schema leans hard on ON DELETE CASCADE.
  async function pragma(stmt) {
    if (/foreign_keys/i.test(stmt)) await client.execute(`PRAGMA ${stmt}`);
  }
  // Returns a callable wrapper, same shape as better-sqlite3's
  // db.transaction(fn) — call sites keep writing db.transaction(fn)(...args).
  // Nesting-aware: recurring.service.js's runRowTxn calls createCard(), which
  // is itself db.transaction(...)-wrapped — a call made while already inside
  // an active transaction just runs inline against that same transaction
  // (flat nesting: the whole outer unit commits or rolls back together;
  // nothing here needs the independent-partial-rollback semantics a real
  // SAVEPOINT gives, and nothing catches a nested transaction's error to
  // keep the outer one going).
  function transaction(fn) {
    return async (...args) => {
      const active = txStore.getStore();
      if (active) return fn(...args);
      const tx = await client.transaction('write');
      try {
        const result = await txStore.run(tx, fn, ...args);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback().catch(() => {});
        throw err;
      } finally {
        tx.close();
      }
    };
  }
  function close() {
    client.close();
  }

  return { get, all, run, exec, pragma, transaction, close, kind: 'turso' };
}

// --- better-sqlite3 backend --------------------------------------------------
// Single shared synchronous connection, same as before this file existed in
// its async form. A transaction still needs BEGIN/COMMIT/ROLLBACK to not
// interleave with another concurrent request's transaction on this one
// connection — `await` here does yield to the event loop between statements
// (unlike the old fully-synchronous db.transaction()), so a mutex serializes
// transactions rather than relying on better-sqlite3's native (sync-only,
// can't take an async callback) .transaction() helper.
export function createSqliteBackend(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  let lock = Promise.resolve();
  function withLock(fn) {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  async function get(sql, args = []) {
    return database.prepare(sql).get(...args);
  }
  async function all(sql, args = []) {
    return database.prepare(sql).all(...args);
  }
  async function run(sql, args = []) {
    const info = database.prepare(sql).run(...args);
    return toRunResult(info.changes, info.lastInsertRowid);
  }
  async function exec(sql) {
    database.exec(sql);
  }
  async function pragma(stmt) {
    database.pragma(stmt);
  }
  // Same callable-wrapper shape as the turso backend, including nesting
  // (see its transaction() comment) — a nested call runs inline under the
  // same BEGIN/COMMIT, no new lock acquisition (which would otherwise
  // deadlock against itself).
  function transaction(fn) {
    return (...args) => {
      const active = txStore.getStore();
      if (active) return fn(...args);
      return withLock(async () => {
        database.exec('BEGIN IMMEDIATE');
        try {
          const result = await txStore.run(database, fn, ...args);
          database.exec('COMMIT');
          return result;
        } catch (err) {
          database.exec('ROLLBACK');
          throw err;
        }
      });
    };
  }
  function close() {
    database.close();
  }

  return { get, all, run, exec, pragma, transaction, close, kind: 'sqlite', raw: database };
}

const DB_PATH = process.env.DB_PATH || './data/jobcard.db';

let current = process.env.TURSO_DATABASE_URL
  ? createTursoBackend(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN)
  : createSqliteBackend(DB_PATH);

// TEST-ONLY escape hatch, same pattern as before this file's async rewrite:
// services import the default export once, at module load time, and hold
// that reference for the process lifetime — so per-test isolation swaps what
// `current` points at rather than re-importing. See tests/helpers/testDb.js.
export function __setTestDb(newBackend) {
  current = newBackend;
}

const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const value = current[prop];
      return typeof value === 'function' ? value.bind(current) : value;
    },
  },
);

export default db;
