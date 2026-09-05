// server/services/recurring.service.js — ใบงานประจำ (recurring cards for PM
// work, docs/07-roadmap.md backlog). Each row is a schedule; running it
// creates a real card through card.service.js's createCard() (same code
// path a human filling create-modal.js goes through, so SLA calc/activity
// log/template subtasks all behave identically), then reschedules itself.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { computeNextRun } from '../utils/recurrence.js';
import { nowSqlite, toApiDateTime } from '../utils/date.js';
import { findOrCreateMemberByName } from './member.service.js';
import { createCard } from './card.service.js';

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    site: row.site,
    customer: row.customer,
    deviceRef: row.device_ref,
    projectCode: row.project_code,
    templateSlug: row.template_slug,
    creatorName: row.creator_name,
    assigneeName: row.assignee_name,
    frequency: row.frequency,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    isActive: !!row.is_active,
    nextRunAt: toApiDateTime(row.next_run_at),
    lastRunAt: toApiDateTime(row.last_run_at),
    createdAt: toApiDateTime(row.created_at),
  };
}

const BASE_SELECT = `
  SELECT rc.*, cm.name AS creator_name, am.name AS assignee_name
  FROM recurring_cards rc
  JOIN members cm ON cm.id = rc.creator_id
  LEFT JOIN members am ON am.id = rc.assignee_id
`;

export function listRecurring() {
  return db.prepare(`${BASE_SELECT} ORDER BY rc.id`).all().map(mapRow);
}

export function getRecurringById(id) {
  const row = db.prepare(`${BASE_SELECT} WHERE rc.id = ?`).get(id);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบกฎใบงานประจำนี้', 404);
  return mapRow(row);
}

function assertListAndTemplateExist(listId, templateSlug) {
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(listId);
  if (!list) throw new AppError('VALIDATION_ERROR', 'ไม่พบคอลัมน์ที่ระบุ', 400, [{ path: 'listId', message: 'ไม่พบคอลัมน์ที่ระบุ' }]);

  if (templateSlug) {
    const template = db.prepare('SELECT slug FROM templates WHERE slug = ?').get(templateSlug);
    if (!template) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);
  }
}

function createRecurringTxn(input) {
  assertListAndTemplateExist(input.listId, input.templateSlug);
  const creator = findOrCreateMemberByName(input.creatorName);
  const assignee = input.assigneeName ? findOrCreateMemberByName(input.assigneeName) : null;
  const nextRunAt = computeNextRun(input.frequency, { dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth });

  const info = db
    .prepare(
      `INSERT INTO recurring_cards (
        name, list_id, title, description, type, priority, site, customer,
        device_ref, project_code, template_slug, creator_id, assignee_id,
        frequency, day_of_week, day_of_month, is_active, next_run_at
      ) VALUES (
        @name, @list_id, @title, @description, @type, @priority, @site, @customer,
        @device_ref, @project_code, @template_slug, @creator_id, @assignee_id,
        @frequency, @day_of_week, @day_of_month, 1, @next_run_at
      )`,
    )
    .run({
      name: input.name,
      list_id: input.listId,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      priority: input.priority,
      site: input.site ?? null,
      customer: input.customer ?? null,
      device_ref: input.deviceRef ?? null,
      project_code: input.projectCode ?? null,
      template_slug: input.templateSlug ?? null,
      creator_id: creator.id,
      assignee_id: assignee?.id ?? null,
      frequency: input.frequency,
      day_of_week: input.frequency === 'weekly' ? input.dayOfWeek : null,
      day_of_month: input.frequency === 'monthly' ? input.dayOfMonth : null,
      next_run_at: nextRunAt,
    });

  return getRecurringById(Number(info.lastInsertRowid));
}

export function createRecurring(input) {
  return db.transaction(createRecurringTxn)(input);
}

function updateRecurringTxn(id, fields) {
  const existing = db.prepare('SELECT * FROM recurring_cards WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบกฎใบงานประจำนี้', 404);

  const listId = fields.listId ?? existing.list_id;
  const templateSlug = fields.templateSlug !== undefined ? fields.templateSlug : existing.template_slug;
  assertListAndTemplateExist(listId, templateSlug);

  const frequency = fields.frequency ?? existing.frequency;
  const dayOfWeek = fields.dayOfWeek !== undefined ? fields.dayOfWeek : existing.day_of_week;
  const dayOfMonth = fields.dayOfMonth !== undefined ? fields.dayOfMonth : existing.day_of_month;

  // Recompute next_run_at only when the schedule itself changed — editing
  // e.g. just the title shouldn't push a rule's next occurrence back to now.
  const scheduleChanged = fields.frequency !== undefined || fields.dayOfWeek !== undefined || fields.dayOfMonth !== undefined;
  const nextRunAt = scheduleChanged ? computeNextRun(frequency, { dayOfWeek, dayOfMonth }) : existing.next_run_at;

  let assigneeId = existing.assignee_id;
  if (fields.assigneeName !== undefined) {
    assigneeId = fields.assigneeName ? findOrCreateMemberByName(fields.assigneeName).id : null;
  }

  const merged = {
    name: fields.name ?? existing.name,
    list_id: listId,
    title: fields.title ?? existing.title,
    description: fields.description !== undefined ? fields.description : existing.description,
    type: fields.type ?? existing.type,
    priority: fields.priority ?? existing.priority,
    site: fields.site !== undefined ? fields.site : existing.site,
    customer: fields.customer !== undefined ? fields.customer : existing.customer,
    device_ref: fields.deviceRef !== undefined ? fields.deviceRef : existing.device_ref,
    project_code: fields.projectCode !== undefined ? fields.projectCode : existing.project_code,
    template_slug: templateSlug,
    assignee_id: assigneeId,
    frequency,
    day_of_week: frequency === 'weekly' ? dayOfWeek : null,
    day_of_month: frequency === 'monthly' ? dayOfMonth : null,
    is_active: fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : existing.is_active,
    next_run_at: nextRunAt,
  };

  db.prepare(
    `UPDATE recurring_cards SET
       name=@name, list_id=@list_id, title=@title, description=@description, type=@type, priority=@priority,
       site=@site, customer=@customer, device_ref=@device_ref, project_code=@project_code, template_slug=@template_slug,
       assignee_id=@assignee_id, frequency=@frequency, day_of_week=@day_of_week, day_of_month=@day_of_month,
       is_active=@is_active, next_run_at=@next_run_at
     WHERE id=@id`,
  ).run({ ...merged, id });

  return getRecurringById(id);
}

export function updateRecurring(id, fields) {
  return db.transaction(updateRecurringTxn)(id, fields);
}

export function deleteRecurring(id) {
  const existing = db.prepare('SELECT id FROM recurring_cards WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบกฎใบงานประจำนี้', 404);
  db.prepare('DELETE FROM recurring_cards WHERE id = ?').run(id);
}

// Creates one card from `row` (a BASE_SELECT-joined row, not the mapped API
// shape) and reschedules it, as a single transaction so a crash between the
// two never leaves a rule pointing at a next_run_at that's already passed.
// better-sqlite3 nests this fine (SAVEPOINT) since createCard() is itself
// `db.transaction(...)`-wrapped.
function runRowTxn(row) {
  const card = createCard({
    listId: row.list_id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    priority: row.priority,
    site: row.site ?? undefined,
    customer: row.customer ?? undefined,
    deviceRef: row.device_ref ?? undefined,
    projectCode: row.project_code ?? undefined,
    creatorName: row.creator_name,
    assigneeNames: row.assignee_name ? [row.assignee_name] : undefined,
    templateSlug: row.template_slug ?? undefined,
  });

  const nextRunAt = computeNextRun(row.frequency, { dayOfWeek: row.day_of_week, dayOfMonth: row.day_of_month }, new Date());
  db.prepare('UPDATE recurring_cards SET last_run_at = ?, next_run_at = ? WHERE id = ?').run(nowSqlite(), nextRunAt, row.id);

  return card;
}

function runRow(row) {
  return db.transaction(runRowTxn)(row);
}

// Called once/tick by the scheduler in server/index.js (same shape as
// notify.service.js's sendSlaDigest). Creates one card per active rule
// whose next_run_at has passed, in whatever order SQLite returns them.
export function runDueRecurring() {
  const due = db.prepare(`${BASE_SELECT} WHERE rc.is_active = 1 AND rc.next_run_at <= ?`).all(nowSqlite());
  return due.map((row) => ({ ruleId: row.id, card: runRow(row) }));
}

// POST /:id/run-now — lets a NOC lead create this cycle's card immediately
// instead of waiting for the scheduled time, without touching the schedule.
export function runRecurringNow(id) {
  const row = db.prepare(`${BASE_SELECT} WHERE rc.id = ?`).get(id);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบกฎใบงานประจำนี้', 404);
  return runRow(row);
}
