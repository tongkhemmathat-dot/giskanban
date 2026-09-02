// server/schemas/comment.schema.js (docs/10-conventions.md §5, docs/04-api.md §7).
import { z } from 'zod';

export const createCommentSchema = z
  .object({
    authorName: z.string().min(1, 'ต้องระบุชื่อผู้แสดงความคิดเห็น').max(100),
    body: z.string().min(1, 'กรุณากรอกข้อความ').max(5000),
  })
  .strip();
