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

export function listComments(cardId) {
  return db
    .prepare(`${COMMENT_SELECT} WHERE c.card_id = ? ORDER BY c.created_at`)
    .all(cardId)
    .map(mapCommentRow);
}

function createCommentTxn(cardId, authorName, body) {
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const author = findOrCreateMemberByName(authorName);
  const info = db.prepare('INSERT INTO comments (card_id, author_id, body) VALUES (?, ?, ?)').run(cardId, author.id, body);

  logActivity({ cardId, actorName: authorName, action: 'comment_added', meta: { excerpt: body.slice(0, 80) } });

  return mapCommentRow(db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid));
}

export function createComment(cardId, authorName, body) {
  return db.transaction(createCommentTxn)(cardId, authorName, body);
}

export function deleteComment(cid) {
  const existing = db.prepare('SELECT id FROM comments WHERE id = ?').get(cid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบความคิดเห็นนี้', 404);
  db.prepare('DELETE FROM comments WHERE id = ?').run(cid);
}
