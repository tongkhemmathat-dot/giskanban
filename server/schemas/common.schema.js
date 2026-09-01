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
