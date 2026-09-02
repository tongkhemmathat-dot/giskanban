// api/index.js — Vercel serverless entrypoint (demo deploy ONLY).
//
// Vercel Functions have no persistent disk outside /tmp, and /tmp itself is
// wiped on every cold start and NOT shared across concurrent instances — so
// this re-seeds a fresh SQLite file into /tmp on each cold start instead of
// trying to persist real data. Good enough to click around the UI live; not
// a substitute for docs/09-deployment.md's Docker Compose setup, which is
// what actually persists data for real use.
//
// DB_PATH must be set *before* server/db/connection.js is first imported —
// connection.js reads process.env.DB_PATH once, at module load, and opens
// the connection right there. Static `import` statements are hoisted above
// any of this file's own top-level code, so connection.js (and anything that
// imports it) must be brought in with dynamic `import()` here instead, after
// DB_PATH is set.
import { existsSync } from 'node:fs';

process.env.DB_PATH = process.env.DB_PATH || '/tmp/jobcard-demo.db';

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
