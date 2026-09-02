// server/schemas/subtask.schema.js (docs/10-conventions.md §5, docs/04-api.md §5,
// docs/05-business-rules.md §4). Route files import these and pass them to
// middleware/validate.js — no validation logic lives in the routes themselves.
import { z } from 'zod';
import { isoDateTimeSchema } from './common.schema.js';
import { splitTitles } from '../utils/subtask.js';

// POST /api/cards/:id/subtasks — the raw `titles` (array of lines, or a
// single multi-line string) is run through splitTitles() *inside* the schema
// (docs/05-business-rules.md §4.1: strip numbered/bulleted prefixes, drop
// blank lines) so middleware/validate.js's `req.body = result.data` already
// hands the service a clean array — the service never re-does this parsing.
export const bulkCreateSubtasksSchema = z
  .object({
    titles: z.preprocess(
      (v) => splitTitles(v),
      z.array(z.string().min(1).max(200)).min(1, 'ต้องระบุอย่างน้อย 1 ขั้นตอน'),
    ),
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();

export const updateSubtaskSchema = z
  .object({
    title: z.string().min(1, 'กรุณากรอกชื่อขั้นตอน').max(200).optional(),
    assigneeName: z.string().min(1).max(100).nullable().optional(),
    dueDate: isoDateTimeSchema,
    note: z.string().max(2000).nullable().optional(),
  })
  .strip();

export const toggleSubtaskSchema = z
  .object({
    actorName: z.string().min(1, 'ต้องระบุชื่อผู้ติ๊ก').max(100),
  })
  .strip();

export const reorderSubtasksSchema = z
  .object({
    orderedIds: z.array(z.number().int().positive()).min(1, 'ต้องระบุลำดับขั้นตอน'),
  })
  .strip();

export const applyTemplateSchema = z
  .object({
    templateSlug: z.string().min(1, 'ต้องระบุแม่แบบ'),
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();
