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

function fetchSubtaskRow(sid) {
  return db.prepare(`${SUBTASK_SELECT} WHERE s.id = ?`).get(sid);
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

export function listSubtasksForCard(cardId) {
  return db
    .prepare(`${SUBTASK_SELECT} WHERE s.card_id = ? ORDER BY s.position`)
    .all(cardId)
    .map(mapSubtaskRow);
}

export function getCardProgress(cardId) {
  const row = db.prepare('SELECT total, done, pct FROM card_progress WHERE card_id = ?').get(cardId);
  return row ? { done: row.done, total: row.total, pct: row.pct } : { done: 0, total: 0, pct: 0 };
}

function requireCard(cardId) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new AppError('NOT_FOUND', 'ไม่พบใบงานนี้', 404);
  return card;
}

// ---- bulk insert (3.1) ------------------------------------------------------

// Shared by createSubtasks (3.1) and applyTemplate (3.7): both just append a
// batch of titles to a card, capped so the card never exceeds
// MAX_SUBTASKS_PER_CARD total (docs/05-business-rules.md §4.4 rule 5).
function insertTitles(cardId, titles) {
  const existingCount = db.prepare('SELECT COUNT(*) AS n FROM subtasks WHERE card_id = ?').get(cardId).n;
  const room = Math.max(0, MAX_SUBTASKS_PER_CARD - existingCount);
  const toInsert = titles.slice(0, room);

  // Positions must be strictly increasing even within this one batch, so
  // compute them off a running base rather than re-querying MAX() per row.
  const base = db.prepare('SELECT MAX(position) AS maxPos FROM subtasks WHERE card_id = ?').get(cardId).maxPos ?? 0;
  const stmt = db.prepare('INSERT INTO subtasks (card_id, title, position) VALUES (?, ?, ?)');
  return toInsert.map((title, i) => Number(stmt.run(cardId, title, base + (i + 1) * GAP).lastInsertRowid));
}

function createSubtasksTxn(cardId, titles, actorName) {
  requireCard(cardId);
  const insertedIds = insertTitles(cardId, titles);

  if (insertedIds.length) {
    logActivity({
      cardId,
      actorName: actorName ?? null,
      action: 'subtask_added',
      meta: { count: insertedIds.length, titles: insertedIds.map((id) => fetchSubtaskRow(id).title) },
    });
  }

  return {
    items: insertedIds.map((id) => mapSubtaskRow(fetchSubtaskRow(id))),
    progress: getCardProgress(cardId),
  };
}

export function createSubtasks(cardId, titles, actorName) {
  return db.transaction(createSubtasksTxn)(cardId, titles, actorName);
}

// ---- update (3.2) -----------------------------------------------------------

function updateSubtaskTxn(sid, fields) {
  const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  const next = {
    title: fields.title ?? existing.title,
    assignee_id:
      fields.assigneeName === undefined
        ? existing.assignee_id
        : fields.assigneeName === null
          ? null
          : findOrCreateMemberByName(fields.assigneeName).id,
    due_date: fields.dueDate !== undefined ? fields.dueDate : existing.due_date,
    note: fields.note !== undefined ? fields.note : existing.note,
  };

  db.prepare('UPDATE subtasks SET title = ?, assignee_id = ?, due_date = ?, note = ? WHERE id = ?').run(
    next.title,
    next.assignee_id,
    next.due_date,
    next.note,
    sid,
  );

  return mapSubtaskRow(fetchSubtaskRow(sid));
}

export function updateSubtask(sid, fields) {
  return db.transaction(updateSubtaskTxn)(sid, fields);
}

// ---- toggle + auto-move (3.3, 3.4) ------------------------------------------

// docs/05-business-rules.md §4.3 — only the "marking done" direction can
// trigger a move; un-checking never moves anything.
function toggleSubtaskTxn(sid, actorName) {
  const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  const nowDone = !existing.is_done;
  const doneBy = nowDone ? actorName : null;
  const doneAt = nowDone ? nowSqlite() : null;
  db.prepare('UPDATE subtasks SET is_done = ?, done_by = ?, done_at = ? WHERE id = ?').run(
    nowDone ? 1 : 0,
    doneBy,
    doneAt,
    sid,
  );
  logActivity({
    cardId: existing.card_id,
    actorName: actorName ?? null,
    action: nowDone ? 'subtask_done' : 'subtask_undone',
    meta: { title: existing.title },
  });

  const progress = getCardProgress(existing.card_id);
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(existing.card_id);
  let movedTo = null;

  if (nowDone) {
    const currentList = db.prepare('SELECT * FROM lists WHERE id = ?').get(card.list_id);
    if (progress.done >= 1 && ['backlog', 'todo'].includes(currentList.slug)) {
      // "ติ๊กขั้นแรกสำเร็จ" -> auto-move to In Progress + set started_at (docs/05 §4.3).
      const target = db.prepare('SELECT * FROM lists WHERE slug = ?').get('doing');
      const position = midPosition(
        db.prepare('SELECT MAX(position) AS maxPos FROM cards WHERE list_id = ?').get(target.id).maxPos ?? null,
        null,
      );
      db.prepare('UPDATE cards SET list_id = ?, position = ?, started_at = ?, updated_at = ? WHERE id = ?').run(
        target.id,
        position,
        card.started_at ?? nowSqlite(),
        nowSqlite(),
        card.id,
      );
      logActivity({
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

  const updatedCard = db.prepare('SELECT id, list_id FROM cards WHERE id = ?').get(existing.card_id);

  return {
    subtask: mapSubtaskRow(fetchSubtaskRow(sid)),
    progress,
    card: { id: updatedCard.id, listId: updatedCard.list_id },
    ...(movedTo ? { movedTo } : {}),
  };
}

export function toggleSubtask(sid, actorName) {
  return db.transaction(toggleSubtaskTxn)(sid, actorName);
}

// ---- delete (3.5) ------------------------------------------------------------

function deleteSubtaskTxn(sid) {
  const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sid);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);

  db.prepare('DELETE FROM subtasks WHERE id = ?').run(sid);

  return { progress: getCardProgress(existing.card_id) };
}

export function deleteSubtask(sid) {
  return db.transaction(deleteSubtaskTxn)(sid);
}

// ---- reorder (3.6) ------------------------------------------------------------

function reorderSubtasksTxn(cardId, orderedIds) {
  requireCard(cardId);

  const existingIds = db.prepare('SELECT id FROM subtasks WHERE card_id = ?').all(cardId).map((r) => r.id);
  const sameSet = existingIds.length === orderedIds.length && existingIds.every((id) => orderedIds.includes(id));
  if (!sameSet) {
    throw new AppError('VALIDATION_ERROR', 'orderedIds ต้องตรงกับขั้นตอนทั้งหมดของใบงานนี้', 400);
  }

  const stmt = db.prepare('UPDATE subtasks SET position = ? WHERE id = ?');
  orderedIds.forEach((id, i) => stmt.run((i + 1) * GAP, id));

  return { items: listSubtasksForCard(cardId) };
}

export function reorderSubtasks(cardId, orderedIds) {
  return db.transaction(reorderSubtasksTxn)(cardId, orderedIds);
}

// ---- apply template (3.7) ------------------------------------------------------

function applyTemplateTxn(cardId, templateSlug, actorName) {
  requireCard(cardId);
  const template = db.prepare('SELECT * FROM templates WHERE slug = ?').get(templateSlug);
  if (!template) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);

  // Template items always append after whatever's already there — never replace (docs/05 §4.4 rule 1).
  const insertedIds = insertTitles(cardId, JSON.parse(template.items));

  if (insertedIds.length) {
    logActivity({
      cardId,
      actorName: actorName ?? null,
      action: 'template_applied',
      meta: { templateName: template.name, count: insertedIds.length },
    });
  }

  return {
    items: listSubtasksForCard(cardId),
    progress: getCardProgress(cardId),
    added: insertedIds.length,
  };
}

export function applyTemplate(cardId, templateSlug, actorName) {
  return db.transaction(applyTemplateTxn)(cardId, templateSlug, actorName);
}
