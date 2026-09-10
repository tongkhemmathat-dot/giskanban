// server/services/card.service.js — all card business logic + SQL
// (docs/04-api.md §4, docs/05-business-rules.md). Routes only parse
// request/response; every decision and every query lives here.
//
// IMPORTANT for testability: every exported function that needs a
// transaction calls `db.transaction(fn)(...)` *inside* the function body,
// never once at module-load time (i.e. never `export const x = db.transaction(...)`
// at top level). server/db/connection.js's default export is a Proxy that
// forwards to a swappable underlying connection (see its comment + tests
// use it to point at a fresh per-test db) — `db.transaction(fn)` resolves
// "the current connection" at the moment it's called, so calling it once at
// import time would permanently bind to whatever db existed first and never
// see a later test-db swap.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nextCardCode } from '../utils/code.js';
import { calcSlaDueAt, computeSlaStatus, shiftSlaDueAt, parseAsUtc } from '../utils/sla.js';
import { midPosition } from '../utils/position.js';
import { splitTitles } from '../utils/subtask.js';
import { toApiDateTime, nowSqlite } from '../utils/date.js';
import { findOrCreateMemberByName } from './member.service.js';
import { logActivity, listActivities } from './activity.service.js';
import { getCardProgress, listSubtasksForCard } from './subtask.service.js';
import { listComments } from './comment.service.js';
import { listAttachments } from './attachment.service.js';
import { listTimeLogs } from './timelog.service.js';
import { listLabelsForCard } from './label.service.js';
import { buildCsv } from '../utils/csv.js';

const GAP = 65536;
const CARD_FIELD_COLUMNS = {
  title: 'title',
  description: 'description',
  type: 'type',
  priority: 'priority',
  site: 'site',
  customer: 'customer',
  deviceRef: 'device_ref',
  projectCode: 'project_code',
  dueDate: 'due_date',
  estimatedHours: 'estimated_hours',
};

// ---- read helpers ---------------------------------------------------------

async function getCardAssignees(cardId) {
  return db.all(
    `SELECT m.id, m.name, m.color FROM card_assignees ca
     JOIN members m ON m.id = ca.member_id
     WHERE ca.card_id = ? ORDER BY m.name`,
    [cardId],
  );
}

async function getCardCounts(cardId) {
  const comments = (await db.get('SELECT COUNT(*) AS n FROM comments WHERE card_id = ?', [cardId])).n;
  const attachments = (await db.get('SELECT COUNT(*) AS n FROM attachments WHERE card_id = ?', [cardId])).n;
  return { comments, attachments };
}

// row must come from a query joined with `lists AS l` (for l.is_done) and
// `members AS m` (for creator_name/creator_color) — see the two callers below.
async function mapCardRow(row) {
  const isDone = !!row.list_is_done;
  const isPaused = !!row.list_pauses_sla;
  const [assignees, labels, progress, counts] = await Promise.all([
    getCardAssignees(row.id),
    listLabelsForCard(row.id),
    getCardProgress(row.id),
    getCardCounts(row.id),
  ]);
  return {
    id: row.id,
    code: row.code,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    position: row.position,
    type: row.type,
    priority: row.priority,
    site: row.site,
    customer: row.customer,
    deviceRef: row.device_ref,
    projectCode: row.project_code,
    dueDate: toApiDateTime(row.due_date),
    slaDueAt: toApiDateTime(row.sla_due_at),
    slaStatus: computeSlaStatus({ priority: row.priority, slaDueAt: row.sla_due_at, isDone, isPaused }),
    estimatedHours: row.estimated_hours,
    creator: { id: row.creator_id, name: row.creator_name, color: row.creator_color },
    assignees,
    labels,
    progress,
    counts,
    startedAt: toApiDateTime(row.started_at),
    completedAt: toApiDateTime(row.completed_at),
    createdAt: toApiDateTime(row.created_at),
    updatedAt: toApiDateTime(row.updated_at),
    // Backlog idea: "stale card" badge. updated_at alone misses activity that
    // doesn't touch the cards row (subtask toggles, comments, time logs), so
    // this takes whichever is newer — the true last-touched time.
    lastActivityAt: toApiDateTime(row.last_activity_at > row.updated_at ? row.last_activity_at : row.updated_at),
  };
}

const BASE_SELECT = `
  SELECT c.*, l.is_done AS list_is_done, l.pauses_sla AS list_pauses_sla, m.name AS creator_name, m.color AS creator_color,
         (SELECT MAX(created_at) FROM activities WHERE card_id = c.id) AS last_activity_at
  FROM cards c
  JOIN lists l ON l.id = c.list_id
  JOIN members m ON m.id = c.creator_id
`;

async function nextPositionForList(listId) {
  const row = await db.get('SELECT MAX(position) AS maxPos FROM cards WHERE list_id = ?', [listId]);
  return midPosition(row?.maxPos ?? null, null);
}

// ---- queries ---------------------------------------------------------------

export async function listCards(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.q) {
    clauses.push('(c.title LIKE ? OR m.name LIKE ? OR c.code LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  if (filters.listId) {
    clauses.push('c.list_id = ?');
    params.push(filters.listId);
  }
  if (filters.priority) {
    clauses.push('c.priority = ?');
    params.push(filters.priority);
  }
  if (filters.type) {
    clauses.push('c.type = ?');
    params.push(filters.type);
  }
  if (filters.site) {
    clauses.push('c.site = ?');
    params.push(filters.site);
  }
  if (filters.creatorId) {
    clauses.push('c.creator_id = ?');
    params.push(filters.creatorId);
  }
  if (filters.assigneeId) {
    clauses.push('EXISTS (SELECT 1 FROM card_assignees ca WHERE ca.card_id = c.id AND ca.member_id = ?)');
    params.push(filters.assigneeId);
  }

  const sql = `${BASE_SELECT}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY c.list_id, c.position`;
  const rows = await db.all(sql, params);
  let cards = await Promise.all(rows.map(mapCardRow));

  // slaStatus depends on wall-clock "now" (at_risk especially), so it's
  // simplest and most correct to filter after mapping rather than trying to
  // express the 25%-remaining rule in SQL.
  if (filters.slaStatus) {
    cards = cards.filter((c) => c.slaStatus === filters.slaStatus);
  }

  return cards;
}

const CSV_HEADERS = [
  'code',
  'title',
  'type',
  'priority',
  'list',
  'slaStatus',
  'creator',
  'assignees',
  'site',
  'customer',
  'deviceRef',
  'projectCode',
  'dueDate',
  'slaDueAt',
  'progress',
  'labels',
  'createdAt',
  'completedAt',
];

// Export CSV (backlog: docs/07-roadmap.md) — reuses listCards() so the export
// respects the exact same filters as GET /api/cards, and reflects the exact
// same slaStatus/progress every other view already shows. UTF-8 BOM prefix
// is required for Excel (the realistic consumer here, given every field is
// Thai text) to auto-detect the encoding instead of rendering mojibake.
export async function exportCardsCsv(filters = {}) {
  const cards = await listCards(filters);
  const listRows = await db.all('SELECT id, name FROM lists', []);
  const listNames = new Map(listRows.map((l) => [l.id, l.name]));

  const rows = cards.map((c) => [
    c.code,
    c.title,
    c.type,
    c.priority,
    listNames.get(c.listId) ?? '',
    c.slaStatus,
    c.creator?.name ?? '',
    (c.assignees ?? []).map((a) => a.name).join('; '),
    c.site ?? '',
    c.customer ?? '',
    c.deviceRef ?? '',
    c.projectCode ?? '',
    c.dueDate ?? '',
    c.slaDueAt ?? '',
    `${c.progress?.done ?? 0}/${c.progress?.total ?? 0}`,
    (c.labels ?? []).map((l) => l.name).join('; '),
    c.createdAt ?? '',
    c.completedAt ?? '',
  ]);

  return '﻿' + buildCsv(CSV_HEADERS, rows);
}

export async function getCardById(id) {
  const row = await db.get(`${BASE_SELECT} WHERE c.id = ?`, [id]);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const card = await mapCardRow(row);
  const [subtasks, comments, attachments, timeLogs, activities] = await Promise.all([
    listSubtasksForCard(id),
    listComments(id),
    listAttachments(id),
    listTimeLogs(id),
    listActivities(id),
  ]);
  card.subtasks = subtasks;
  card.comments = comments;
  card.attachments = attachments;
  card.timeLogs = timeLogs;
  card.activities = activities;
  return card;
}

// ---- mutations ---------------------------------------------------------------

async function createCardTxn(input) {
  const creator = await findOrCreateMemberByName(input.creatorName);

  let assigneeIds =
    input.assigneeNames && input.assigneeNames.length > 0
      ? await Promise.all(input.assigneeNames.map(async (n) => (await findOrCreateMemberByName(n)).id))
      : [creator.id]; // docs/05-business-rules.md §3.3
  assigneeIds = [...new Set(assigneeIds)];

  const list = await db.get('SELECT * FROM lists WHERE id = ?', [input.listId]);
  if (!list) throw new AppError('VALIDATION_ERROR', 'ไม่พบคอลัมน์ที่ระบุ', 400, [{ path: 'listId', message: 'ไม่พบคอลัมน์ที่ระบุ' }]);

  const code = await nextCardCode(db); // docs/05-business-rules.md §1 — server generates, client value ignored
  const createdAt = nowSqlite();
  const slaDueAt = calcSlaDueAt(input.priority, createdAt); // docs/05-business-rules.md §2
  const position = await nextPositionForList(input.listId);

  const info = await db.run(
    `INSERT INTO cards (
      list_id, code, title, description, position, type, priority,
      due_date, sla_due_at, sla_paused_at, estimated_hours, site, customer, device_ref,
      project_code, creator_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.listId,
      code,
      input.title,
      input.description ?? null,
      position,
      input.type,
      input.priority,
      input.dueDate ?? null,
      slaDueAt,
      list.pauses_sla ? createdAt : null, // e.g. created straight into Waiting Vendor
      input.estimatedHours ?? null,
      input.site ?? null,
      input.customer ?? null,
      input.deviceRef ?? null,
      input.projectCode ?? null,
      creator.id,
      createdAt,
      createdAt,
    ],
  );
  const cardId = Number(info.lastInsertRowid);

  for (const memberId of assigneeIds) {
    await db.run('INSERT INTO card_assignees (card_id, member_id) VALUES (?, ?)', [cardId, memberId]);
  }

  if (input.labelIds?.length) {
    for (const labelId of input.labelIds) {
      await db.run('INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)', [cardId, labelId]);
    }
  }

  // subtaskTitles first, template items appended after (docs/04-api.md §4 rule 6).
  let titles = splitTitles(input.subtaskTitles ?? []);
  if (input.templateSlug) {
    const template = await db.get('SELECT * FROM templates WHERE slug = ?', [input.templateSlug]);
    if (!template) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);
    titles = [...titles, ...JSON.parse(template.items)];
  }
  titles = titles.slice(0, 100); // docs/05-business-rules.md §4.4
  for (let i = 0; i < titles.length; i++) {
    await db.run('INSERT INTO subtasks (card_id, title, position) VALUES (?, ?, ?)', [cardId, titles[i], (i + 1) * GAP]);
  }

  await logActivity({ cardId, actorName: input.creatorName, action: 'card_created', meta: { code, listName: list.name } });

  return getCardById(cardId);
}

export function createCard(input) {
  return db.transaction(createCardTxn)(input);
}

async function updateCardTxn(id, fields, actorName) {
  const existing = await db.get('SELECT * FROM cards WHERE id = ?', [id]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const changedFields = [];
  const before = {};
  const after = {};
  const nextCols = {};

  for (const [key, col] of Object.entries(CARD_FIELD_COLUMNS)) {
    if (fields[key] === undefined) continue;
    const value = fields[key];
    if (existing[col] !== value) {
      before[key] = existing[col];
      after[key] = value;
      changedFields.push(key);
    }
    nextCols[col] = value;
  }

  if (changedFields.length === 0) {
    return getCardById(id); // nothing actually changed — no-op, no activity noise
  }

  // docs/05-business-rules.md §2 rule 2: recalc from the ORIGINAL created_at, never "now".
  const priority = nextCols.priority ?? existing.priority;
  const slaDueAt = changedFields.includes('priority') ? calcSlaDueAt(priority, existing.created_at) : existing.sla_due_at;

  const merged = {
    title: nextCols.title ?? existing.title,
    description: nextCols.description !== undefined ? nextCols.description : existing.description,
    type: nextCols.type ?? existing.type,
    priority,
    site: nextCols.site !== undefined ? nextCols.site : existing.site,
    customer: nextCols.customer !== undefined ? nextCols.customer : existing.customer,
    device_ref: nextCols.device_ref !== undefined ? nextCols.device_ref : existing.device_ref,
    project_code: nextCols.project_code !== undefined ? nextCols.project_code : existing.project_code,
    due_date: nextCols.due_date !== undefined ? nextCols.due_date : existing.due_date,
    estimated_hours: nextCols.estimated_hours !== undefined ? nextCols.estimated_hours : existing.estimated_hours,
    sla_due_at: slaDueAt,
    updated_at: nowSqlite(),
  };

  await db.run(
    `UPDATE cards SET
       title=?, description=?, type=?, priority=?,
       site=?, customer=?, device_ref=?, project_code=?,
       due_date=?, estimated_hours=?, sla_due_at=?, updated_at=?
     WHERE id=?`,
    [
      merged.title,
      merged.description,
      merged.type,
      merged.priority,
      merged.site,
      merged.customer,
      merged.device_ref,
      merged.project_code,
      merged.due_date,
      merged.estimated_hours,
      merged.sla_due_at,
      merged.updated_at,
      id,
    ],
  );

  await logActivity({ cardId: id, actorName: actorName ?? null, action: 'card_updated', meta: { fields: changedFields, before, after } });

  return getCardById(id);
}

export function updateCard(id, fields, actorName) {
  return db.transaction(updateCardTxn)(id, fields, actorName);
}

async function moveCardTxn(id, { listId, position }, actorName) {
  const existing = await db.get('SELECT * FROM cards WHERE id = ?', [id]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const targetList = await db.get('SELECT * FROM lists WHERE id = ?', [listId]);
  if (!targetList) throw new AppError('VALIDATION_ERROR', 'ไม่พบคอลัมน์ปลายทาง', 400, [{ path: 'listId', message: 'ไม่พบคอลัมน์ปลายทาง' }]);
  const fromList = await db.get('SELECT * FROM lists WHERE id = ?', [existing.list_id]);

  // docs/05-business-rules.md §4.3: entering/leaving an is_done column sets/clears completed_at.
  let completedAt = existing.completed_at;
  if (targetList.is_done && !fromList.is_done) {
    completedAt = nowSqlite();
  } else if (!targetList.is_done && fromList.is_done) {
    completedAt = null;
  }

  // Same idea for pauses_sla columns (e.g. Waiting Vendor): entering pauses
  // the clock, leaving gives back exactly the time spent parked there by
  // pushing sla_due_at forward (docs/05-business-rules.md §2).
  let slaPausedAt = existing.sla_paused_at;
  let slaDueAt = existing.sla_due_at;
  if (targetList.pauses_sla && !fromList.pauses_sla) {
    slaPausedAt = nowSqlite();
  } else if (!targetList.pauses_sla && fromList.pauses_sla) {
    if (slaPausedAt && slaDueAt) {
      slaDueAt = shiftSlaDueAt(slaDueAt, Date.now() - parseAsUtc(slaPausedAt).getTime());
    }
    slaPausedAt = null;
  }

  await db.run('UPDATE cards SET list_id = ?, position = ?, completed_at = ?, sla_due_at = ?, sla_paused_at = ?, updated_at = ? WHERE id = ?', [
    listId,
    position,
    completedAt,
    slaDueAt,
    slaPausedAt,
    nowSqlite(),
    id,
  ]);

  if (existing.list_id !== listId) {
    await logActivity({ cardId: id, actorName: actorName ?? null, action: 'card_moved', meta: { from: fromList.name, to: targetList.name } });
  }

  return getCardById(id);
}

export function moveCard(id, move, actorName) {
  return db.transaction(moveCardTxn)(id, move, actorName);
}

async function deleteCardTxn(id, actorName) {
  const existing = await db.get('SELECT * FROM cards WHERE id = ?', [id]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  // cardId: null (not `id`) — activities.card_id has ON DELETE CASCADE, so a
  // row pointing at the card we're about to delete would vanish with it.
  // meta already carries {code, title} so the record stands on its own.
  await logActivity({ cardId: null, actorName: actorName ?? null, action: 'card_deleted', meta: { code: existing.code, title: existing.title } });

  await db.run('DELETE FROM cards WHERE id = ?', [id]); // ON DELETE CASCADE handles subtasks/comments/attachments/etc.
}

export function deleteCard(id, actorName) {
  return db.transaction(deleteCardTxn)(id, actorName);
}

async function addAssigneeTxn(cardId, memberName, actorName) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const member = await findOrCreateMemberByName(memberName);
  await db.run('INSERT OR IGNORE INTO card_assignees (card_id, member_id) VALUES (?, ?)', [cardId, member.id]);

  // docs/04-api.md's POST body only documents { memberName }, no actorName —
  // this endpoint models "รับงาน" (claiming the task), so absent an explicit
  // actor we log the member being added as the actor themself.
  await logActivity({ cardId, actorName: actorName ?? member.name, action: 'assignee_added', meta: { memberName: member.name } });

  return getCardAssignees(cardId);
}

export function addAssignee(cardId, memberName, actorName) {
  return db.transaction(addAssigneeTxn)(cardId, memberName, actorName);
}

async function removeAssigneeTxn(cardId, memberId, actorName) {
  const card = await db.get('SELECT id FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);

  const member = await db.get('SELECT * FROM members WHERE id = ?', [memberId]);
  await db.run('DELETE FROM card_assignees WHERE card_id = ? AND member_id = ?', [cardId, memberId]);

  await logActivity({ cardId, actorName: actorName ?? member?.name ?? null, action: 'assignee_removed', meta: { memberName: member?.name ?? null } });

  return getCardAssignees(cardId);
}

export function removeAssignee(cardId, memberId, actorName) {
  return db.transaction(removeAssigneeTxn)(cardId, memberId, actorName);
}
