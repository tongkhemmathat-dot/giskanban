// api/index.js — Vercel serverless entrypoint.
//
// The DB itself is Turso (server/db/connection.js picks it automatically
// when TURSO_DATABASE_URL is set — see that file's top comment) — a real
// shared, concurrency-safe database every function instance talks to
// directly, so there's no per-instance local state to lose across cold
// starts or diverge across concurrent warm instances. (An earlier version of
// this file worked around the lack of one by snapshotting a local SQLite
// file to Vercel Blob; that only fixed the cold-start case, not concurrent
// warm instances answering with different local state, so it's gone now
// that Turso is the actual source of truth.)
//
// UPLOAD_DIR must be set *before* attachment.service.js is first imported —
// it reads the env var once at module load and mkdirSync's it immediately.
// Without this it defaults to the relative './data/uploads', which tries to
// mkdirSync against the function's read-only bundle directory (not /tmp) —
// that throws synchronously on import and crashes the whole function before
// it can handle any request. Uploaded files still live only in /tmp here
// (wiped every cold start, not shared across instances) — attachments are
// not part of the Turso migration; that's a separate, still-open gap.
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/jobcard-uploads';

const { default: db } = await import('../server/db/connection.js');
const { runMigrations } = await import('../server/db/migrate.js');
await runMigrations(db); // idempotent (docs/07 rule #5) — safe to run on every cold start

const { default: app } = await import('../server/index.js');

export default app;
