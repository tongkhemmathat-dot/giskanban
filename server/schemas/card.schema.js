// server/schemas/card.schema.js (docs/10-conventions.md §5, docs/04-api.md §4,
// docs/05-business-rules.md §7). Route files import these and pass them to
// middleware/validate.js — no validation logic lives in the routes themselves.
import { z } from 'zod';
import { isoDateTimeSchema } from './common.schema.js';

const TYPES = ['incident', 'service_request', 'change', 'maintenance'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const SLA_STATUSES = ['ok', 'at_risk', 'overdue', 'done'];

// 'E' + 2-digit year + '-' + 4 digits, e.g. E26-1234 (docs/05-business-rules.md §7).
const PROJECT_CODE_RE = /^E\d{2}-\d{4}$/;

const dueDateSchema = isoDateTimeSchema;

// POST /api/cards: projectCode is optional; '' / null / undefined all mean
// "not provided" (-> undefined, field left out entirely). Anything else is
// upper-cased first (C14: 'e26-1234' -> 'E26-1234') and then must match the
// format, or the whole request is a VALIDATION_ERROR (C15).
const createProjectCodeSchema = z.preprocess((v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.toUpperCase();
}, z.string().regex(PROJECT_CODE_RE, 'projectCode ต้องอยู่ในรูปแบบ E##-#### เช่น E26-1234').optional());

// PATCH /api/cards/:id: unlike create, we need to tell "field not sent"
// (undefined -> leave untouched) apart from "clear it" (null/'' -> null).
const updateProjectCodeSchema = z
  .preprocess((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    return String(v).trim().toUpperCase();
  }, z.union([z.string().regex(PROJECT_CODE_RE, 'projectCode ต้องอยู่ในรูปแบบ E##-#### เช่น E26-1234'), z.null()]))
  .optional();

export const createCardSchema = z
  .object({
    listId: z.number().int().positive('ต้องระบุคอลัมน์'),
    title: z.string().min(1, 'กรุณากรอกชื่องาน').max(200),
    description: z.string().max(5000).optional(),
    type: z.enum(TYPES).default('service_request'),
    priority: z.enum(PRIORITIES).default('medium'),
    site: z.string().max(200).optional(),
    customer: z.string().max(200).optional(),
    deviceRef: z.string().max(200).optional(),
    projectCode: createProjectCodeSchema,
    dueDate: dueDateSchema,
    estimatedHours: z.number().positive().optional(),
    creatorName: z.string().min(1, 'ต้องระบุผู้สร้างใบงาน').max(100), // ★
    assigneeNames: z.array(z.string().min(1).max(100)).optional(),
    labelIds: z.array(z.number().int().positive()).optional(),
    subtaskTitles: z.array(z.string()).max(100).optional(),
    templateSlug: z.string().min(1).optional().nullable(),
  })
  .strip(); // drops client-sent code/slaDueAt/etc — server always computes those (C7)

export const updateCardSchema = z
  .object({
    title: z.string().min(1, 'กรุณากรอกชื่องาน').max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    type: z.enum(TYPES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    site: z.string().max(200).nullable().optional(),
    customer: z.string().max(200).nullable().optional(),
    deviceRef: z.string().max(200).nullable().optional(),
    projectCode: updateProjectCodeSchema,
    dueDate: dueDateSchema,
    estimatedHours: z.number().positive().nullable().optional(),
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();

export const moveCardSchema = z
  .object({
    listId: z.number().int().positive('ต้องระบุคอลัมน์ปลายทาง'),
    position: z.number(),
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();

export const addAssigneeSchema = z
  .object({
    memberName: z.string().min(1, 'ต้องระบุชื่อผู้รับผิดชอบ').max(100),
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();

export const listCardsQuerySchema = z
  .object({
    q: z.string().min(1).optional(),
    listId: z.coerce.number().int().positive().optional(),
    priority: z.enum(PRIORITIES).optional(),
    type: z.enum(TYPES).optional(),
    site: z.string().min(1).optional(),
    creatorId: z.coerce.number().int().positive().optional(),
    assigneeId: z.coerce.number().int().positive().optional(),
    slaStatus: z.enum(SLA_STATUSES).optional(),
  })
  .strip();
