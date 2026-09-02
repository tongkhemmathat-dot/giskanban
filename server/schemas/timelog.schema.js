// server/schemas/timelog.schema.js (docs/10-conventions.md §5, docs/04-api.md §7,
// docs/05-business-rules.md §7: "hours (time log) > 0 และ ≤ 24").
import { z } from 'zod';

export const createTimeLogSchema = z
  .object({
    memberName: z.string().min(1, 'ต้องระบุชื่อผู้บันทึกเวลา').max(100),
    hours: z.number().positive('hours ต้องมากกว่า 0').max(24, 'hours ต้องไม่เกิน 24'),
    note: z.string().max(500).optional(),
  })
  .strip();
