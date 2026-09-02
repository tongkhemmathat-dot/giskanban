// server/services/timelog.service.js — time log read/write (docs/04-api.md §7,
// docs/05-business-rules.md §7/§8). card.service.js imports listTimeLogs from
// here (one-directional, same pattern as comment.service.js / subtask.service.js).
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { toApiDateTime } from '../utils/date.js';
import { findOrCreateMemberByName } from './member.service.js';
import { logActivity } from './activity.service.js';

const TIME_LOG_SELECT = `
  SELECT t.*, m.name AS member_name, m.color AS member_color
  FROM time_logs t JOIN members m ON m.id = t.member_id
`;

function mapTimeLogRow(row) {
  return {
    id: row.id,
    member: { id: row.member_id, name: row.member_name, color: row.member_color },
    hours: row.hours,
    note: row.note,
    loggedAt: toApiDateTime(row.logged_at),
  };
}

export function listTimeLogs(cardId) {
  return db
    .prepare(`${TIME_LOG_SELECT} WHERE t.card_id = ? ORDER BY t.logged_at`)
    .all(cardId)
    .map(mapTimeLogRow);
}

function createTimeLogTxn(cardId, { memberName, hours, note }) {
  const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const member = findOrCreateMemberByName(memberName);
  const info = db
    .prepare('INSERT INTO time_logs (card_id, member_id, hours, note) VALUES (?, ?, ?, ?)')
    .run(cardId, member.id, hours, note ?? null);

  logActivity({ cardId, actorName: memberName, action: 'time_logged', meta: { hours } });

  return mapTimeLogRow(db.prepare(`${TIME_LOG_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid));
}

export function createTimeLog(cardId, fields) {
  return db.transaction(createTimeLogTxn)(cardId, fields);
}

export function deleteTimeLog(tid) {
  const existing = db.prepare('SELECT id FROM time_logs WHERE id = ?').get(tid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบรายการบันทึกเวลานี้', 404);
  db.prepare('DELETE FROM time_logs WHERE id = ?').run(tid);
}
