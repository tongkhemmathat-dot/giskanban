// server/schemas/label.schema.js (docs/10-conventions.md §5, docs/04-api.md).
import { z } from 'zod';

// Same #RRGGBB format as member.schema.js's updateMemberSchema.color.
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color ต้องเป็นรูปแบบ #RRGGBB');

export const createLabelSchema = z
  .object({
    name: z.string().min(1, 'กรุณากรอกชื่อป้ายกำกับ').max(50),
    color: colorSchema.optional(),
  })
  .strip();

export const updateLabelSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    color: colorSchema.optional(),
  })
  .strip();

export const attachLabelSchema = z
  .object({
    labelId: z.number().int().positive('ต้องระบุ labelId'),
  })
  .strip();
