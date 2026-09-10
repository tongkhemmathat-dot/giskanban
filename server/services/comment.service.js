// server/services/comment.service.js — comments read/write (docs/04-api.md §7,
// docs/05-business-rules.md §8). card.service.js imports listComments from
// here (one-directional, same pattern subtask.service.js established) rather
// than keeping its own copy, so GET /api/cards/:id and POST here always agree
// on shape.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { toApiDateTime } from '../utils/date.js';
import { findOrCreateMemberByName } from './member.service.js';
import { logActivity } from './activity.service.js';

const COMMENT_SELECT = `
  SELECT c.*, m.name AS author_name, m.color AS author_color
  FROM comments c JOIN members m ON m.id = c.author_id
`;

function mapCommentRow(row) {
  return {
    id: row.id,
    author: { id: row.author_id, name: row.author_name, color: row.author_color },
    body: row.body,
    createdAt: toApiDateTime(row.created_at),
  };
}

export async function listComments(cardId) {
  const rows = await db.all(`${COMMENT_SELECT} WHERE c.card_id = ? ORDER BY c.created_at`, [cardId]);
  return rows.map(mapCommentRow);
}

async function createCommentTxn(cardId, authorName, body) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const author = await findOrCreateMemberByName(authorName);
  const info = await db.run('INSERT INTO comments (card_id, author_id, body) VALUES (?, ?, ?)', [cardId, author.id, body]);

  await logActivity({ cardId, actorName: authorName, action: 'comment_added', meta: { excerpt: body.slice(0, 80) } });

  return mapCommentRow(await db.get(`${COMMENT_SELECT} WHERE c.id = ?`, [info.lastInsertRowid]));
}

export function createComment(cardId, authorName, body) {
  return db.transaction(createCommentTxn)(cardId, authorName, body);
}

export async function deleteComment(cid) {
  const existing = await db.get('SELECT id FROM comments WHERE id = ?', [cid]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบความคิดเห็นนี้', 404);
  await db.run('DELETE FROM comments WHERE id = ?', [cid]);
}
