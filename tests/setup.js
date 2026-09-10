// Shared test-db factory. createTestDb({ seed }) returns a brand-new
// in-memory sqlite-backed connection (server/db/connection.js's
// createSqliteBackend(':memory:')) with migrations applied, and seed data
// applied unless `seed: false` is passed. Every call is fully isolated
// (fresh :memory: db) — this exact interface is relied on by API tests in
// tests/api/*.test.js. Always in-memory better-sqlite3 regardless of whether
// TURSO_DATABASE_URL is set in the environment — tests want fast, isolated,
// no-network runs, not a shared connection to a real Turso database.
import { createSqliteBackend } from '../server/db/connection.js';
import { runMigrations } from '../server/db/migrate.js';
import { seedDatabase } from '../server/db/seed.js';

export async function createTestDb({ seed = true } = {}) {
  const db = createSqliteBackend(':memory:');
  await runMigrations(db);
  if (seed) {
    await seedDatabase(db);
  }
  return db;
}
