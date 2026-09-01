// Shared test-db factory. createTestDb({ seed }) returns a brand-new
// in-memory better-sqlite3 instance with migrations applied, and seed data
// applied unless `seed: false` is passed. Every call is fully isolated
// (fresh :memory: db) — this exact interface is relied on by API tests in
// tests/api/*.test.js (Agents 2, 3, 6), so its shape should not change.
import Database from 'better-sqlite3';
import { runMigrations } from '../server/db/migrate.js';
import { seedDatabase } from '../server/db/seed.js';

export function createTestDb({ seed = true } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  if (seed) {
    seedDatabase(db);
  }
  return db;
}
