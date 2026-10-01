import { describe, it, expect } from 'vitest';
import { createTestDb } from '../setup.js';
import { seedBase } from '../../server/db/seed.js';

const count = async (db, table) => (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;

describe('seedBase', () => {
  it('creates board, lists and templates but no members or cards', async () => {
    const db = await createTestDb({ seed: false });
    const result = await seedBase(db);

    expect(result.skipped).toBe(false);
    expect(await count(db, 'boards')).toBe(1);
    expect(await count(db, 'lists')).toBeGreaterThan(0);
    expect(await count(db, 'templates')).toBeGreaterThan(0);
    expect(await count(db, 'members')).toBe(0);
    expect(await count(db, 'cards')).toBe(0);
  });

  it('is a no-op when a board already exists (no duplicate board)', async () => {
    const db = await createTestDb({ seed: false });
    await seedBase(db);
    const second = await seedBase(db);

    expect(second.skipped).toBe(true);
    expect(await count(db, 'boards')).toBe(1);
  });
});
