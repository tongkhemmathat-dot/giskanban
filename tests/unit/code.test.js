import { describe, it, expect } from 'vitest';
import { createTestDb } from '../setup.js';
import { nextCardCode } from '../../server/utils/code.js';

describe('nextCardCode', () => {
  it('U3: JC-000001 when the cards table is empty', () => {
    const db = createTestDb({ seed: false });
    expect(nextCardCode(db)).toBe('JC-000001');
  });

  it('U4: continues from the max existing code (JC-000130 -> JC-000131)', () => {
    const db = createTestDb({ seed: false });
    const boardId = db.prepare('INSERT INTO boards (name) VALUES (?)').run('B').lastInsertRowid;
    const listId = db
      .prepare('INSERT INTO lists (board_id, name, slug) VALUES (?, ?, ?)')
      .run(boardId, 'Todo', 'todo').lastInsertRowid;
    const memberId = db
      .prepare('INSERT INTO members (name) VALUES (?)')
      .run('Tester').lastInsertRowid;
    db.prepare(
      `INSERT INTO cards (list_id, code, title, creator_id) VALUES (?, 'JC-000130', 'x', ?)`,
    ).run(listId, memberId);

    expect(nextCardCode(db)).toBe('JC-000131');
  });
});
