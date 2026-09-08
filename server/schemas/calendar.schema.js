// server/schemas/calendar.schema.js (docs/10-conventions.md §5, docs/04-api.md §12)
import { z } from 'zod';

// GET/DELETE /api/calendar/connect(ions)/:memberId
export const memberIdParamSchema = z.object({ memberId: z.coerce.number().int().positive('memberId ไม่ถูกต้อง') }).strip();

// GET /api/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
export const eventsRangeQuerySchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start ต้องเป็นรูปแบบ YYYY-MM-DD'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end ต้องเป็นรูปแบบ YYYY-MM-DD'),
  })
  .strip();
