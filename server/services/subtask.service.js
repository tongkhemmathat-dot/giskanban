// server/services/subtask.service.js — all subtask business logic + SQL
// (docs/04-api.md §5, docs/05-business-rules.md §4). Routes only parse
// request/response; every decision and every query lives here.
//
// Also owns the subtask read-shape (`listSubtasksForCard`) and the
// `card_progress` view read (`getCardProgress`) — card.service.js imports
// both of these rather than duplicating the mapping, so GET /api/cards/:id
// and every subtask endpoint always agree on what a subtask/progress object
// looks like. See card.service.js's comment for the same transaction-timing
// rule this file follows: every function that writes calls
// `db.transaction(fn)(...)` inside its own body, never at module-load time.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { midPosition } from '../utils/position.js';
import { toApiDateTime, nowSqlite } from '../utils/date.js';
import { parseAsUtc } from '../utils/sla.js';
import { findOrCreateMemberByName } from './member.service.js';
import { logActivity } from './activity.service.js';

const GAP = 65536;
const MAX_SUBTASKS_PER_CARD = 100; // docs/05-business-rules.md §4.4 rule 5

// ---- read helpers (also used by card.service.js) --------------------------

const SUBTASK_SELECT = `
  SELECT s.*, m.id AS assignee_member_id, m.name AS assignee_name, m.color AS assignee_color
  FROM subtasks s LEFT JOIN members m ON m.id = s.assignee_id
`;

async function fetchSubtaskRow(sid) {
  return db.get(`${SUBTASK_SELECT} WHERE s.id = ?`, [sid]);
}

// isOverdue (backlog: per-subtask due dates + warning) — past its due_date
// and not yet done. Computed from the raw row's due_date, not the already
// toApiDateTime()-truncated one, since that's only a display reformat and
// parseAsUtc() (server/utils/sla.js) needs the original string to correctly
// handle both the ' '-separated (SQLite) and 'T'-separated (client-sent ISO)
// shapes this codebase mixes.
function mapSubtaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    isDone: !!row.is_done,
    position: row.position,
    assignee: row.assignee_member_id
      ? { id: row.assignee_member_id, name: row.assignee_name, color: row.assignee_color }
      : null,
    dueDate: toApiDateTime(row.due_date),
    isOverdue: !!row.due_date && !row.is_done && parseAsUtc(row.due_date).getTime() < Date.now(),
    note: row.note,
    doneBy: row.done_by,
    doneAt: toApiDateTime(row.done_at),
  };
}

export async function listSubtasksForCard(cardId) {
  const rows = await db.all(`${SUBTASK_SELECT} WHERE s.card_id = ? ORDER BY s.position`, [cardId]);
  return rows.map(mapSubtaskRow);
}

export async function getCardProgress(cardId) {
  const row = await db.get('SELECT total, done, pct FROM card_progress WHERE card_id = ?', [cardId]);
  return row ? { done: row.done, total: row.total, pct: row.pct } : { done: 0, total: 0, pct: 0 };
}

async function requireCard(cardId) {
  const card = await db.get('SELECT * FROM cards WHERE id = ?', [cardId]);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);
  return card;
}

// ---- bulk insert (3.1) ------------------------------------------------------

// Shared by createSubtasks (3.1) and applyTemplate (3.7): both just append a
// batch of titles to a card, capped so the card never exceeds
// MAX_SUBTASKS_PER_CARD total (docs/05-business-rules.md §4.4 rule 5).
async function insertTitles(cardId, titles) {
  const existingCount = (await db.get('SELECT COUNT(*) AS n FROM subtasks WHERE card_id = ?', [cardId])).n;
  const room = Math.max(0, MAX_SUBTASKS_PER_CARD - existingCount);
  const toInsert = titles.slice(0, room);

  // Positions must be strictly increasing even within this one batch, so
  // compute them off a running base rather than re-querying MAX() per row.
  const base = (await db.get('SELECT MAX(position) AS maxPos FROM subtasks WHERE card_id = ?', [cardId])).maxPos ?? 0;
  const insertedIds = [];
  for (let i = 0; i < toInsert.length; i++) {
    const info = await db.run('INSERT INTO subtasks (card_id, title, position) VALUES (?, ?, ?)', [cardId, toInsert[i], base + (i + 1) * GAP]);
    insertedIds.push(Number(info.lastInsertRowid));
  }
  return insertedIds;
}

async function createSubtasksTxn(cardId, titles, actorName) {
  await requireCard(cardId);
  const insertedIds = await insertTitles(cardId, titles);

  if (insertedIds.length) {
    const insertedRows = await Promise.all(insertedIds.map((id) => fetchSubtaskRow(id)));
    await logActivity({
      cardId,
      actorName: actorName ?? null,
      action: 'subtask_added',
      meta: { count: insertedIds.length, titles: insertedRows.map((row) => row.title) },
    });
  }

  const items = await Promise.all(insertedIds.map((id) => fetchSubtaskRow(id)));
  return {
    items: items.map(mapSubtaskRow),
    progress: await getCardProgress(cardId),
  };
}

export function createSubtasks(cardId, titles, actorName) {
  return db.transaction(createSubtasksTxn)(cardId, titles, actorName);
}

// ---- update (3.2) -----------------------------------------------------------

async function updateSubtaskTxn(sid, fields) {
  const existing = await db.get('SELECT * FROM subtasks WHERE id = ?', [sid]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  const next = {
    title: fields.title ?? existing.title,
    assignee_id:
      fields.assigneeName === undefined
        ? existing.assignee_id
        : fields.assigneeName === null
          ? null
          : (await findOrCreateMemberByName(fields.assigneeName)).id,
    due_date: fields.dueDate !== undefined ? fields.dueDate : existing.due_date,
    note: fields.note !== undefined ? fields.note : existing.note,
  };

  await db.run('UPDATE subtasks SET title = ?, assignee_id = ?, due_date = ?, note = ? WHERE id = ?', [
    next.title,
    next.assignee_id,
    next.due_date,
    next.note,
    sid,
  ]);

  return mapSubtaskRow(await fetchSubtaskRow(sid));
}

export function updateSubtask(sid, fields) {
  return db.transaction(updateSubtaskTxn)(sid, fields);
}

// ---- toggle + auto-move (3.3, 3.4) ------------------------------------------

// docs/05-business-rules.md §4.3 — only the "marking done" direction can
// trigger a move; un-checking never moves anything.
async function toggleSubtaskTxn(sid, actorName) {
  const existing = await db.get('SELECT * FROM subtasks WHERE id = ?', [sid]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  const nowDone = !existing.is_done;
  const doneBy = nowDone ? actorName : null;
  const doneAt = nowDone ? nowSqlite() : null;
  await db.run('UPDATE subtasks SET is_done = ?, done_by = ?, done_at = ? WHERE id = ?', [nowDone ? 1 : 0, doneBy, doneAt, sid]);
  await logActivity({
    cardId: existing.card_id,
    actorName: actorName ?? null,
    action: nowDone ? 'subtask_done' : 'subtask_undone',
    meta: { title: existing.title },
  });

  const progress = await getCardProgress(existing.card_id);
  const card = await db.get('SELECT * FROM cards WHERE id = ?', [existing.card_id]);
  let movedTo = null;

  if (nowDone) {
    const currentList = await db.get('SELECT * FROM lists WHERE id = ?', [card.list_id]);
    if (progress.done >= 1 && ['backlog', 'todo'].includes(currentList.slug)) {
      // "ติ๊กขั้นแรกสำเร็จ" -> auto-move to In Progress + set started_at (docs/05 §4.3).
      const target = await db.get('SELECT * FROM lists WHERE slug = ?', ['doing']);
      const maxPos = (await db.get('SELECT MAX(position) AS maxPos FROM cards WHERE list_id = ?', [target.id])).maxPos ?? null;
      const position = midPosition(maxPos, null);
      await db.run('UPDATE cards SET list_id = ?, position = ?, started_at = ?, updated_at = ? WHERE id = ?', [
        target.id,
        position,
        card.started_at ?? nowSqlite(),
        nowSqlite(),
        card.id,
      ]);
      await logActivity({
        cardId: card.id,
        actorName: actorName ?? null,
        action: 'card_moved',
        meta: { from: currentList.name, to: target.name },
      });
      movedTo = { listId: target.id, listName: target.name, reason: 'first_subtask_done' };
    } else if (progress.done === progress.total && progress.total > 0 && !['review', 'done'].includes(currentList.slug)) {
      // "ติ๊กครบทุกขั้น" -> only *suggest* Review, never move automatically (docs/05 §4.3).
      movedTo = { listId: currentList.id, listName: currentList.name, reason: 'all_done_suggest_review' };
    }
  }

  const updatedCard = await db.get('SELECT id, list_id FROM cards WHERE id = ?', [existing.card_id]);

  return {
    subtask: mapSubtaskRow(await fetchSubtaskRow(sid)),
    progress,
    card: { id: updatedCard.id, listId: updatedCard.list_id },
    ...(movedTo ? { movedTo } : {}),
  };
}

export function toggleSubtask(sid, actorName) {
  return db.transaction(toggleSubtaskTxn)(sid, actorName);
}

// ---- delete (3.5) ------------------------------------------------------------

async function deleteSubtaskTxn(sid) {
  const existing = await db.get('SELECT * FROM subtasks WHERE id = ?', [sid]);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  await db.run('DELETE FROM subtasks WHERE id = ?', [sid]);

  return { progress: await getCardProgress(existing.card_id) };
}

export function deleteSubtask(sid) {
  return db.transaction(deleteSubtaskTxn)(sid);
}

// ---- reorder (3.6) ------------------------------------------------------------

async function reorderSubtasksTxn(cardId, orderedIds) {
  await requireCard(cardId);

  const existingRows = await db.all('SELECT id FROM subtasks WHERE card_id = ?', [cardId]);
  const existingIds = existingRows.map((r) => r.id);
  const sameSet = existingIds.length === orderedIds.length && existingIds.every((id) => orderedIds.includes(id));
  if (!sameSet) {
    throw new AppError('VALIDATION_ERROR', 'orderedIds ต้องตรงกับขั้นตอนทั้งหมดของใบงานนี้', 400);
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await db.run('UPDATE subtasks SET position = ? WHERE id = ?', [(i + 1) * GAP, orderedIds[i]]);
  }

  return { items: await listSubtasksForCard(cardId) };
}

export function reorderSubtasks(cardId, orderedIds) {
  return db.transaction(reorderSubtasksTxn)(cardId, orderedIds);
}

// ---- apply template (3.7) ------------------------------------------------------

async function applyTemplateTxn(cardId, templateSlug, actorName) {
  await requireCard(cardId);
  const template = await db.get('SELECT * FROM templates WHERE slug = ?', [templateSlug]);
  if (!template) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);

  // Template items always append after whatever's already there — never replace (docs/05 §4.4 rule 1).
  const insertedIds = await insertTitles(cardId, JSON.parse(template.items));

  if (insertedIds.length) {
    await logActivity({
      cardId,
      actorName: actorName ?? null,
      action: 'template_applied',
      meta: { templateName: template.name, count: insertedIds.length },
    });
  }

  return {
    items: await listSubtasksForCard(cardId),
    progress: await getCardProgress(cardId),
    added: insertedIds.length,
  };
}

export function applyTemplate(cardId, templateSlug, actorName) {
  return db.transaction(applyTemplateTxn)(cardId, templateSlug, actorName);
}
