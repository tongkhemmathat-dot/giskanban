// Small zod pieces shared by more than one *.schema.js (docs/10-conventions.md §5).
import { z } from 'zod';

// `:id`-style route params — coerces the string param to a positive int.
export const idParamSchema = z.object({ id: z.coerce.number().int().positive('id ไม่ถูกต้อง') }).strip();

// `/api/cards/:id/assignees/:memberId`
export const cardMemberParamsSchema = z
  .object({
    id: z.coerce.number().int().positive('id ไม่ถูกต้อง'),
    memberId: z.coerce.number().int().positive('memberId ไม่ถูกต้อง'),
  })
  .strip();

// Optional `?actorName=` query string used by DELETE endpoints, which have no body.
export const actorQuerySchema = z
  .object({
    actorName: z.string().min(1).max(100).optional(),
  })
  .strip();

// `/api/subtasks/:sid`-style route params.
export const sidParamSchema = z.object({ sid: z.coerce.number().int().positive('sid ไม่ถูกต้อง') }).strip();

// `/api/comments/:cid`, `/api/attachments/:aid`, `/api/time-logs/:tid`.
export const cidParamSchema = z.object({ cid: z.coerce.number().int().positive('cid ไม่ถูกต้อง') }).strip();
export const aidParamSchema = z.object({ aid: z.coerce.number().int().positive('aid ไม่ถูกต้อง') }).strip();
export const tidParamSchema = z.object({ tid: z.coerce.number().int().positive('tid ไม่ถูกต้อง') }).strip();

// ISO 8601-ish datetime, or explicit null to clear (docs/05-business-rules.md §7:
// "ISO 8601 หรือ null"). Shared by card.schema.js (dueDate) and
// subtask.schema.js (dueDate) — matches the datetime-local shape used in
// docs/04-api.md's examples ("2026-09-06T22:00").
export const isoDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, 'ต้องเป็นรูปแบบ ISO 8601')
  .nullable()
  .optional();
