// Migration runner: reads server/db/migrations/*.sql in filename order,
// applies any not yet recorded in `_migrations`, and records them.
// Idempotent — safe to run repeatedly.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import db from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function runMigrations(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name   TEXT PRIMARY KEY,
      ran_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const already = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = [];
  for (const file of files) {
    if (already.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const applyOne = database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    });
    applyOne();
    applied.push(file);
  }

  return applied;
}

// Run directly via `npm run migrate`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const applied = runMigrations();
  if (applied.length === 0) {
    console.warn('No new migrations to apply.');
  } else {
    console.warn(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }
}
