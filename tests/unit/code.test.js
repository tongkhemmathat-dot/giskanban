import { describe, it, expect } from 'vitest';
import { createTestDb } from '../setup.js';
import { nextCardCode } from '../../server/utils/code.js';

describe('nextCardCode', () => {
  it('U3: JC-000001 when the cards table is empty', async () => {
    const db = await createTestDb({ seed: false });
    expect(await nextCardCode(db)).toBe('JC-000001');
  });

  it('U4: continues from the max existing code (JC-000130 -> JC-000131)', async () => {
    const db = await createTestDb({ seed: false });
    const boardInfo = await db.run('INSERT INTO boards (name) VALUES (?)', ['B']);
    const listInfo = await db.run('INSERT INTO lists (board_id, name, slug) VALUES (?, ?, ?)', [boardInfo.lastInsertRowid, 'Todo', 'todo']);
    const memberInfo = await db.run('INSERT INTO members (name) VALUES (?)', ['Tester']);
    await db.run(`INSERT INTO cards (list_id, code, title, creator_id) VALUES (?, 'JC-000130', 'x', ?)`, [listInfo.lastInsertRowid, memberInfo.lastInsertRowid]);

    expect(await nextCardCode(db)).toBe('JC-000131');
  });
});
