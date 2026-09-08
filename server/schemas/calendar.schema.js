// server/schemas/calendar.schema.js (docs/10-conventions.md §5, docs/04-api.md §12)
import { z } from 'zod';

export const memberIdParamSchema = z.object({ memberId: z.coerce.number().int().positive('memberId ไม่ถูกต้อง') }).strip();

// POST /api/calendar/connections — เชื่อมต่อปฏิทิน .ics ของสมาชิกคนหนึ่ง.
// บังคับ https เท่านั้น (ลิงก์ publish ของ Outlook เป็น https เสมออยู่แล้ว —
// ปิดโอกาสให้ใครเผลอ/ตั้งใจใส่ scheme อื่นที่ทำให้ server ไป fetch อะไรแปลกๆ
// แทนปฏิทินจริง เนื่องจากแอปนี้ไม่มีระบบ auth ป้องกันว่าใครกรอกได้บ้าง)
export const createConnectionSchema = z
  .object({
    memberId: z.coerce.number().int().positive('memberId ไม่ถูกต้อง'),
    icsUrl: z
      .string()
      .url('ต้องเป็น URL ที่ถูกต้อง')
      .refine((u) => u.startsWith('https://'), 'ลิงก์ปฏิทินต้องเป็น https:// เท่านั้น'),
  })
  .strip();

// GET /api/calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
export const eventsRangeQuerySchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start ต้องเป็นรูปแบบ YYYY-MM-DD'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end ต้องเป็นรูปแบบ YYYY-MM-DD'),
  })
  .strip();
