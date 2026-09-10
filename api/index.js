// api/index.js — Vercel serverless entrypoint (demo deploy ONLY).
//
// Vercel Functions have no persistent disk outside /tmp, and /tmp itself is
// wiped on every cold start and NOT shared across concurrent instances. To
// survive that, every mutating request snapshots the whole SQLite file to a
// private Vercel Blob (jobcard-demo.db) before responding, and each cold
// start restores from that snapshot before opening the DB. This is still not
// safe under truly concurrent writes across simultaneously-warm instances
// (last snapshot written wins) — fine for a low-traffic demo, not a
// substitute for docs/09-deployment.md's Docker Compose setup, which is what
// actually persists data for real use. Uploaded attachments are NOT snapshotted
// (only the DB file) and will still vanish across cold starts.
//
// DB_PATH and UPLOAD_DIR must both be set *before* the modules that read them
// are first imported — connection.js (DB_PATH) and attachment.service.js
// (UPLOAD_DIR) each read their env var once at module load and act on it
// immediately (open the DB connection / mkdirSync the upload dir). Without
// this, UPLOAD_DIR defaults to the relative './data/uploads', which
// attachment.service.js tries to mkdirSync against the function's read-only
// bundle directory (not /tmp) — that throws synchronously on import and
// crashes the whole function before it can handle any request. Static
// `import` statements are hoisted above any of this file's own top-level
// code, so both of these (and anything that imports them) must be brought in
// with dynamic `import()` here instead, after the env vars are set.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { get, put } from '@vercel/blob';

process.env.DB_PATH = process.env.DB_PATH || '/tmp/jobcard-demo.db';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/jobcard-uploads';

const DB_SNAPSHOT_PATHNAME = 'jobcard-demo.db';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Best-effort restore: any failure (network blip, no store configured yet)
// just falls back to a fresh seeded DB instead of crashing the cold start.
async function restoreDbSnapshot() {
  try {
    const result = await get(DB_SNAPSHOT_PATHNAME, { access: 'private' });
    if (!result) return false;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    await writeFile(process.env.DB_PATH, Buffer.concat(chunks));
    return true;
  } catch (err) {
    console.error('กู้คืน snapshot ฐานข้อมูลจาก Blob ไม่สำเร็จ:', err.message);
    return false;
  }
}

const restoredFromSnapshot = existsSync(process.env.DB_PATH) || (await restoreDbSnapshot());

const { default: db } = await import('../server/db/connection.js');
const { runMigrations } = await import('../server/db/migrate.js');
runMigrations(db); // idempotent (docs/07 rule #5) — safe to re-run against a restored snapshot too

if (!restoredFromSnapshot) {
  const { seedDatabase } = await import('../server/db/seed.js');
  seedDatabase(db);
}

const { default: app } = await import('../server/index.js');

// Delay the response to any mutating request until the DB file is
// snapshotted to Blob, so the instance is never allowed to freeze/recycle
// before the write is durable. Patched on `app.response` (Express's
// per-app response prototype — every `res` is `Object.create(app.response)`)
// rather than added as `app.use(...)` middleware: this file only gets `app`
// back already fully built with all its routes attached, and an `app.use()`
// registered this late in server/index.js's already-built middleware stack
// never runs for any request a route handler already answered without
// calling next(). Patching the prototype runs for every response regardless
// of route order.
const originalResEnd = app.response.end;
app.response.end = function patchedEnd(...args) {
  if (!MUTATING_METHODS.has(this.req.method) || this.statusCode >= 400) {
    return originalResEnd.apply(this, args);
  }
  // connection.js opens the DB with `journal_mode = WAL` — recent writes sit
  // in a separate `-wal` file and never reach the main .db file until a
  // checkpoint runs, so snapshotting the main file alone would silently
  // upload stale (often near-empty) data. TRUNCATE checkpoints everything
  // into the main file and empties the -wal file, so one file is enough.
  db.pragma('wal_checkpoint(TRUNCATE)');
  readFile(process.env.DB_PATH)
    .then((buf) => put(DB_SNAPSHOT_PATHNAME, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true }))
    .catch((err) => console.error('บันทึก snapshot ฐานข้อมูลไป Blob ไม่สำเร็จ:', err.message))
    .finally(() => originalResEnd.apply(this, args));
};

export default app;
