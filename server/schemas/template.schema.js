// server/schemas/template.schema.js (docs/10-conventions.md §5, docs/04-api.md §6).
import { z } from 'zod';

const itemsSchema = z.array(z.string().min(1).max(200)).min(1, 'ต้องมีอย่างน้อย 1 ขั้นตอน').max(100);

export const createTemplateSchema = z
  .object({
    name: z.string().min(1, 'กรุณากรอกชื่อแม่แบบ').max(100),
    items: itemsSchema,
  })
  .strip();

export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    items: itemsSchema.optional(),
  })
  .strip();
