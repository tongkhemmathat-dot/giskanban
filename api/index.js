// api/index.js — Vercel serverless entrypoint (demo deploy ONLY).
//
// Vercel Functions have no persistent disk outside /tmp, and /tmp itself is
// wiped on every cold start and NOT shared across concurrent instances — so
// this re-seeds a fresh SQLite file into /tmp on each cold start instead of
// trying to persist real data. Good enough to click around the UI live; not
// a substitute for docs/09-deployment.md's Docker Compose setup, which is
// what actually persists data for real use.
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

process.env.DB_PATH = process.env.DB_PATH || '/tmp/jobcard-demo.db';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/jobcard-uploads';

const isFirstBootThisInstance = !existsSync(process.env.DB_PATH);

const { default: db } = await import('../server/db/connection.js');

if (isFirstBootThisInstance) {
  const { runMigrations } = await import('../server/db/migrate.js');
  const { seedDatabase } = await import('../server/db/seed.js');
  runMigrations(db);
  seedDatabase(db);
}

const { default: app } = await import('../server/index.js');

export default app;
