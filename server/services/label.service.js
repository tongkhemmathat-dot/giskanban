// server/services/label.service.js — labels read/write + card attach/detach
// (docs/04-api.md, docs/03-database.md §2 `labels`/`card_labels`).
// bootstrap.service.js and card.service.js both import from here
// (one-directional, same pattern every other resource in this codebase
// follows — subtask/comment/attachment/timelog.service.js) rather than each
// keeping its own copy, so every place a label/card.labels shows up agrees
// on shape.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';

// Same fixed palette + reasoning as member.service.js's AUTO_COLORS: legible,
// varied auto-colors without pulling in a new dependency.
const AUTO_COLORS = [
  '#6366f1',
  '#10b981',
  '#f43f5e',
  '#f59e0b',
  '#0ea5e9',
  '#8b5cf6',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#22c55e',
];

function randomColor() {
  return AUTO_COLORS[Math.floor(Math.random() * AUTO_COLORS.length)];
}

function toApiLabel(row) {
  return { id: row.id, name: row.name, color: row.color };
}

export function listLabels() {
  return db.prepare('SELECT * FROM labels ORDER BY id').all().map(toApiLabel);
}

export function listLabelsForCard(cardId) {
  return db
    .prepare(
      `SELECT l.id, l.name, l.color FROM card_labels cl
       JOIN labels l ON l.id = cl.label_id
       WHERE cl.card_id = ? ORDER BY l.id`,
    )
    .all(cardId);
}

export function createLabel({ name, color }) {
  const board = db.prepare('SELECT id FROM boards LIMIT 1').get();
  const info = db
    .prepare('INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)')
    .run(board.id, name, color ?? randomColor());
  return toApiLabel(db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid));
}

export function updateLabel(id, fields) {
  const existing = db.prepare('SELECT * FROM labels WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);

  const next = { name: fields.name ?? existing.name, color: fields.color ?? existing.color };
  db.prepare('UPDATE labels SET name = ?, color = ? WHERE id = ?').run(next.name, next.color, id);

  return toApiLabel(db.prepare('SELECT * FROM labels WHERE id = ?').get(id));
}

export function deleteLabel(id) {
  const existing = db.prepare('SELECT id FROM labels WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);
  db.prepare('DELETE FROM labels WHERE id = ?').run(id); // ON DELETE CASCADE clears card_labels rows too
}

export function attachLabel(cardId, labelId) {
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);
  const label = db.prepare('SELECT id FROM labels WHERE id = ?').get(labelId);
  if (!label) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);

  db.prepare('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)').run(cardId, labelId);
  return listLabelsForCard(cardId);
}

export function detachLabel(cardId, labelId) {
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  db.prepare('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?').run(cardId, labelId);
  return listLabelsForCard(cardId);
}
