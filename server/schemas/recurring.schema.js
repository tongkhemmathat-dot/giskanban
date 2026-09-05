// server/schemas/recurring.schema.js (docs/10-conventions.md §5, docs/04-api.md §7).
import { z } from 'zod';

const TYPES = ['incident', 'service_request', 'change', 'maintenance'];
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const FREQUENCIES = ['weekly', 'monthly'];

// Both refines are shared by create/update: a rule scheduled 'weekly' needs
// dayOfWeek, one scheduled 'monthly' needs dayOfMonth. On update, `frequency`
// may be absent (no change), in which case both checks pass trivially.
function withScheduleRefine(schema) {
  return schema
    .refine((v) => v.frequency !== 'weekly' || v.dayOfWeek !== undefined, {
      message: 'ต้องระบุวันในสัปดาห์เมื่อความถี่เป็นรายสัปดาห์',
      path: ['dayOfWeek'],
    })
    .refine((v) => v.frequency !== 'monthly' || v.dayOfMonth !== undefined, {
      message: 'ต้องระบุวันที่ในเดือน (1-28) เมื่อความถี่เป็นรายเดือน',
      path: ['dayOfMonth'],
    });
}

export const createRecurringSchema = withScheduleRefine(
  z.object({
    name: z.string().min(1, 'กรุณากรอกชื่อกฎ').max(200),
    listId: z.number().int().positive('ต้องระบุคอลัมน์ปลายทาง'),
    title: z.string().min(1, 'กรุณากรอกชื่อใบงาน').max(200),
    description: z.string().max(5000).optional(),
    type: z.enum(TYPES).default('maintenance'),
    priority: z.enum(PRIORITIES).default('medium'),
    site: z.string().max(200).optional(),
    customer: z.string().max(200).optional(),
    deviceRef: z.string().max(200).optional(),
    projectCode: z.string().max(20).optional(),
    templateSlug: z.string().min(1).optional(),
    creatorName: z.string().min(1, 'ต้องระบุผู้สร้างกฎ').max(100),
    assigneeName: z.string().min(1).max(100).optional(),
    frequency: z.enum(FREQUENCIES),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  }).strip(),
);

export const updateRecurringSchema = withScheduleRefine(
  z.object({
    name: z.string().min(1).max(200).optional(),
    listId: z.number().int().positive().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    type: z.enum(TYPES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    site: z.string().max(200).nullable().optional(),
    customer: z.string().max(200).nullable().optional(),
    deviceRef: z.string().max(200).nullable().optional(),
    projectCode: z.string().max(20).nullable().optional(),
    templateSlug: z.string().min(1).nullable().optional(),
    assigneeName: z.string().max(100).nullable().optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    isActive: z.boolean().optional(),
  }).strip(),
);
