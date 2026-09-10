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

export async function listLabels() {
  const rows = await db.all('SELECT * FROM labels ORDER BY id', []);
  return rows.map(toApiLabel);
}

export async function listLabelsForCard(cardId) {
  return db.all(
    `SELECT l.id, l.name, l.color FROM card_labels cl
     JOIN labels l ON l.id = cl.label_id
     WHERE cl.card_id = ? ORDER BY l.id`,
    [cardId],
  );
}

export async function createLabel({ name, color }) {
  const board = await db.get('SELECT id FROM boards LIMIT 1', []);
  const info = await db.run('INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)', [board.id, name, color ?? randomColor()]);
  return toApiLabel(await db.get('SELECT * FROM labels WHERE id = ?', [info.lastInsertRowid]));
}

export async function updateLabel(id, fields) {
  const existing = await db.get('SELECT * FROM labels WHERE id = ?', [id]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);

  const next = { name: fields.name ?? existing.name, color: fields.color ?? existing.color };
  await db.run('UPDATE labels SET name = ?, color = ? WHERE id = ?', [next.name, next.color, id]);

  return toApiLabel(await db.get('SELECT * FROM labels WHERE id = ?', [id]));
}

export async function deleteLabel(id) {
  const existing = await db.get('SELECT id FROM labels WHERE id = ?', [id]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);
  await db.run('DELETE FROM labels WHERE id = ?', [id]); // ON DELETE CASCADE clears card_labels rows too
}

export async function attachLabel(cardId, labelId) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);
  const label = await db.get('SELECT id FROM labels WHERE id = ?', [labelId]);
  if (!label) throw new AppError('NOT_FOUND', 'ไม่พบป้ายกำกับนี้', 404);

  await db.run('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)', [cardId, labelId]);
  return listLabelsForCard(cardId);
}

export async function detachLabel(cardId, labelId) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  await db.run('DELETE FROM card_labels WHERE card_id = ? AND label_id = ?', [cardId, labelId]);
  return listLabelsForCard(cardId);
}
