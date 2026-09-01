# 10 — มาตรฐานการเขียนโค้ด

## 1. การตั้งชื่อ

| สิ่งที่ตั้งชื่อ | รูปแบบ | ตัวอย่าง |
|---|---|---|
| ไฟล์ route | `*.routes.js` | `cards.routes.js` |
| ไฟล์ service | `*.service.js` | `subtask.service.js` |
| ไฟล์ schema | `*.schema.js` | `card.schema.js` |
| ไฟล์ view | `*.view.js` | `board.view.js` |
| ตาราง DB | `snake_case` พหูพจน์ | `card_assignees` |
| คอลัมน์ DB | `snake_case` | `sla_due_at` |
| JSON API | `camelCase` | `slaDueAt` |
| ตัวแปร JS | `camelCase` | `cardProgress` |
| ค่าคงที่ | `UPPER_SNAKE` | `SLA_HOURS` |

> **สำคัญ:** แปลง `snake_case` ↔ `camelCase` ที่ชั้น service เสมอ ห้ามให้ชื่อคอลัมน์ดิบหลุดออก API

## 2. โครงไฟล์ Route

```js
// server/routes/subtasks.routes.js
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { toggleSchema } from '../schemas/subtask.schema.js';
import * as svc from '../services/subtask.service.js';

const r = Router();

r.patch('/:sid/toggle', validate(toggleSchema), (req, res) => {
  const result = svc.toggle(Number(req.params.sid), req.body.actorName);
  res.json(result);
});

export default r;
```

**ห้าม:** SQL, `if` ที่เป็น business logic, การคำนวณ SLA ในไฟล์นี้

## 3. โครงไฟล์ Service

```js
// server/services/subtask.service.js
import db from '../db/connection.js';
import { logActivity } from './activity.service.js';

export const toggle = db.transaction((sid, actorName) => {
  const st = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sid);
  if (!st) throw new AppError('NOT_FOUND', 'ไม่พบขั้นตอนนี้', 404);
  // ... logic
});
```

## 4. Error Handling

```js
// server/utils/AppError.js
export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code; this.status = status; this.details = details;
  }
}
```

```js
// server/middleware/error.js — ต้องเป็น middleware ตัวสุดท้ายเสมอ
export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message: err.message ?? 'เกิดข้อผิดพลาดภายในระบบ',
      ...(err.details && { details: err.details }),
    },
  });
}
```

## 5. zod Schema

```js
// server/schemas/card.schema.js
import { z } from 'zod';

export const createCardSchema = z.object({
  listId: z.number().int().positive(),
  title: z.string().min(1, 'กรุณากรอกชื่องาน').max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(['incident','service_request','change','maintenance']).default('service_request'),
  priority: z.enum(['critical','high','medium','low']).default('medium'),
  creatorName: z.string().min(1, 'ต้องระบุผู้สร้างใบงาน').max(100),   // ★
  assigneeNames: z.array(z.string()).optional(),
  subtaskTitles: z.array(z.string()).max(100).optional(),
  templateSlug: z.string().optional(),
}).strip();   // ตัดฟิลด์แปลกปลอมทิ้ง เช่น slaDueAt ที่ client แอบส่งมา
```

## 6. ฝั่ง Frontend

1. **ห้ามใส่ string จาก user ลง `innerHTML` โดยไม่ escape**
   ```js
   const esc = s => String(s ?? '').replace(/[&<>"]/g,
     m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
   ```
2. เรียก API ผ่าน `api.js` เท่านั้น ห้ามใช้ `fetch` ตรงในไฟล์ view
3. state อยู่ที่ `store.js` แหล่งเดียว — view อ่านอย่างเดียว
4. Optimistic update ต้องมี rollback เมื่อ API fail
5. ทุก `render*()` ต้อง idempotent — เรียกซ้ำแล้วผลเหมือนเดิม

## 7. Git

**Conventional Commits**

```text
feat(subtasks): เพิ่ม bulk insert รับหลายบรรทัดพร้อมกัน
fix(sla): คำนวณจาก created_at แทนเวลาปัจจุบันตอนเปลี่ยน priority
docs(api): อัปเดต response ของ toggle ให้มี movedTo
refactor(card): ย้าย logic สร้างรหัสไป utils/code.js
test(subtasks): เพิ่มเคส auto-move เมื่อติ๊กขั้นแรก
chore(deps): อัปเดต better-sqlite3
```

**สาขา**

```text
main           # พร้อม deploy เสมอ
feat/subtasks-bulk-insert
fix/sla-recalc
```

## 8. คอมเมนต์

- เขียนเมื่ออธิบาย **"ทำไม"** ไม่ใช่ **"ทำอะไร"**
- ภาษาอังกฤษสำหรับโค้ด · ภาษาไทยได้สำหรับ business rule ที่ซับซ้อน

```js
// ใช้ created_at เดิมเพราะ SLA นับจากเวลาที่แจ้งงาน ไม่ใช่เวลาที่เปลี่ยน priority
const slaDueAt = calcSlaDueAt(newPriority, card.created_at);
```

## 9. Checklist ก่อน commit

- [ ] `npm run lint` ผ่าน
- [ ] `npm test` ผ่านทั้งหมด
- [ ] ไม่มี `console.log` ค้าง
- [ ] ไม่มีไฟล์ใน `data/` หรือ `.env` ติดไปด้วย
- [ ] อัปเดต `docs/04-api.md` ถ้าแก้ API
- [ ] ติ๊ก checkbox ใน `docs/07-roadmap.md`