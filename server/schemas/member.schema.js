// server/schemas/member.schema.js (docs/10-conventions.md §5, docs/04-api.md §3)
import { z } from 'zod';

export const listMembersQuerySchema = z
  .object({
    active: z.enum(['0', '1']).optional(),
  })
  .strip();

// POST /api/members — upsert by name (docs/05-business-rules.md §3.2).
export const upsertMemberSchema = z
  .object({
    name: z.string().min(1, 'ต้องระบุชื่อสมาชิก').max(100),
  })
  .strip();

// PATCH /api/members/:id
export const updateMemberSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    short: z.string().min(1).max(10).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color ต้องเป็นรูปแบบ #RRGGBB').optional(),
    isActive: z.boolean().optional(),
  })
  .strip();
