// server/services/member.service.js (docs/05-business-rules.md §3, docs/04-api.md §3).
// `findOrCreateMemberByName` is imported by card.service.js (creator/assignee
// resolution) and will also be imported by later agents (comments,
// time-logs, subtasks assignee) — keep its signature/return shape stable:
// it always returns the raw `members` row (snake_case columns), since it's
// meant for internal service-to-service use, not direct API exposure.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';

// Small fixed palette so auto-created members get a legible, varied color
// without pulling in a new dependency (docs/05-business-rules.md §3.2: "สีสุ่ม").
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

function toApiMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    short: row.short,
    color: row.color,
    isActive: !!row.is_active,
  };
}

/**
 * findOrCreateMemberByName(name) -> raw members row
 * Upsert-by-name (docs/05-business-rules.md §3.2): existing name returns the
 * existing row untouched; a new name auto-creates one with `short` = first 2
 * characters and a random color.
 */
export function findOrCreateMemberByName(name) {
  const trimmed = String(name).trim();
  const existing = db.prepare('SELECT * FROM members WHERE name = ?').get(trimmed);
  if (existing) return existing;
  const short = trimmed.slice(0, 2);
  const color = randomColor();
  const info = db
    .prepare('INSERT INTO members (name, short, color) VALUES (?, ?, ?)')
    .run(trimmed, short, color);
  return db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid);
}

export function listMembers({ active } = {}) {
  let sql = 'SELECT * FROM members';
  if (active === '1') sql += ' WHERE is_active = 1';
  else if (active === '0') sql += ' WHERE is_active = 0';
  sql += ' ORDER BY name';
  return db.prepare(sql).all().map(toApiMember);
}

/**
 * upsertMember(name) -> { member, created }
 * POST /api/members: `created: true` (-> 201) for a brand-new name,
 * `created: false` (-> 200, same row) when the name already exists — never
 * creates a duplicate (docs/07-roadmap.md 2.3 AC).
 */
export function upsertMember(name) {
  const trimmed = String(name).trim();
  const existing = db.prepare('SELECT * FROM members WHERE name = ?').get(trimmed);
  if (existing) {
    return { member: toApiMember(existing), created: false };
  }
  const row = findOrCreateMemberByName(trimmed);
  return { member: toApiMember(row), created: true };
}

export function updateMember(id, fields) {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  const next = {
    name: fields.name ?? existing.name,
    short: fields.short ?? existing.short,
    color: fields.color ?? existing.color,
    is_active: fields.isActive === undefined ? existing.is_active : fields.isActive ? 1 : 0,
  };

  db.prepare('UPDATE members SET name = ?, short = ?, color = ?, is_active = ? WHERE id = ?').run(
    next.name,
    next.short,
    next.color,
    next.is_active,
    id,
  );

  return toApiMember(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
}

/**
 * deleteMember(id) — docs/05-business-rules.md §3.5: a member who is still
 * the creator of any card can never be deleted (409 CONFLICT); the caller
 * (UI) is expected to deactivate them instead via PATCH { isActive: false }.
 */
function deleteMemberTxn(id) {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE creator_id = ?').get(id);
  if (n > 0) {
    throw new AppError('CONFLICT', 'ไม่สามารถลบสมาชิกที่เป็นผู้สร้างใบงานอยู่ได้ — ปิดใช้งานแทน', 409);
  }

  db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

export function deleteMember(id) {
  return db.transaction(deleteMemberTxn)(id);
}
