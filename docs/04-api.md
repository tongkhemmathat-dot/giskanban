# 04 — API Contract

Base URL: `/api` · Content-Type: `application/json` · ไม่มี auth header

## 1. รูปแบบมาตรฐาน

**สำเร็จ** → คืน object ตรง ๆ หรือ `{ items: [...] }`

**ผิดพลาด** → HTTP 4xx/5xx + body:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "ต้องระบุผู้สร้างใบงาน", "details": [] } }
```

| code | HTTP | เมื่อไหร่ |
|---|---|---|
| `VALIDATION_ERROR` | 400 | zod ไม่ผ่าน |
| `NOT_FOUND` | 404 | ไม่พบ resource |
| `CONFLICT` | 409 | ชื่อซ้ำ / สถานะไม่ถูกต้อง |
| `PAYLOAD_TOO_LARGE` | 413 | ไฟล์ > 10MB |
| `INTERNAL_ERROR` | 500 | ที่เหลือทั้งหมด |

---

## 2. Bootstrap

### `GET /api/bootstrap`

ดึงทุกอย่างที่หน้าเว็บต้องใช้ในครั้งเดียว

```json
{
  "board": { "id": 1, "name": "NOC Operations" },
  "lists": [{ "id": 1, "name": "Backlog", "slug": "backlog", "wipLimit": null, "isDone": 0 }],
  "members": [{ "id": 1, "name": "สมชาย ก.", "short": "สช", "color": "#6366f1" }],
  "labels": [{ "id": 1, "name": "Network", "color": "#0ea5e9" }],
  "templates": [{ "id": 1, "name": "อัปเกรดซอฟต์แวร์", "slug": "upgrade", "itemCount": 11 }],
  "cards": [
    {
      "id": 130, "code": "JC-000130", "listId": 2,
      "title": "Upgrade ArcGIS Enterprise 12.1",
      "type": "change", "priority": "high",
      "site": "DC-Rama9", "customer": "ฝ่าย GIS", "deviceRef": "GIS-APP-01",
      "projectCode": "E26-0512",
      "dueDate": "2026-09-06T22:00", "slaDueAt": "2026-09-02T10:00",
      "slaStatus": "ok",
      "creator": { "id": 1, "name": "สมชาย ก.", "color": "#6366f1" },
      "assignees": [{ "id": 2, "name": "ณัฐพล ว.", "color": "#10b981" }],
      "labels": [], "progress": { "done": 3, "total": 11, "pct": 27 },
      "counts": { "comments": 2, "attachments": 1 },
      "lastActivityAt": "2026-09-01T09:30"
    }
  ]
}
```

`lastActivityAt` (backlog idea: "ป้ายเตือนการ์ดค้าง") = newer of `updated_at` and the card's latest `activities` row — so it reflects subtask ticks/comments/time logs too, not just field edits/moves. Client shows a "🕸 ไม่มีความเคลื่อนไหว N วัน" badge when this is ≥3 days old and the card isn't done (`public/js/components/card.js`).

---

## 3. Members

| Method | Path | Body | หมายเหตุ |
|---|---|---|---|
| GET | `/api/members` | – | `?active=1` กรองเฉพาะที่ใช้งาน |
| POST | `/api/members` | `{ "name": "วีระ ท." }` | **upsert by name** — มีอยู่แล้วคืนตัวเดิม 200 |
| PATCH | `/api/members/:id` | `{ name?, short?, color?, isActive? }` | |
| DELETE | `/api/members/:id` | – | ลบไม่ได้ถ้ายังเป็นผู้สร้างใบงานใด → `409 CONFLICT` (docs/05-business-rules.md §3.5) |

---

## 4. Cards

### `POST /api/cards` — สร้างใบงาน

```json
{
  "listId": 2,
  "title": "Upgrade ArcGIS Enterprise 12.1",
  "description": "อัปเกรดจาก 11.3 → 12.1 นอกเวลาทำการ",
  "type": "change",
  "priority": "high",
  "site": "DC-Rama9",
  "customer": "ฝ่าย GIS",
  "deviceRef": "GIS-APP-01",
  "projectCode": "E26-1234",
  "dueDate": "2026-09-06T22:00",
  "creatorName": "สมชาย ก.",
  "assigneeNames": ["ณัฐพล ว."],
  "labelIds": [1],
  "subtaskTitles": ["1. ทำ backup", "2. ติดตั้งเวอร์ชันใหม่", "3. ทดสอบ"],
  "templateSlug": null
}
```

**กติกา**
1. `creatorName` **บังคับ** — ว่าง → `VALIDATION_ERROR`
2. ชื่อที่ยังไม่มีใน `members` → สร้างใหม่อัตโนมัติ (upsert by name)
3. ไม่ส่ง `assigneeNames` → ตั้ง assignee = creator
4. `code` และ `slaDueAt` server สร้างเอง — ส่งมาจะถูกละเว้น
5. `subtaskTitles` ถูก strip เลข/ขีดนำหน้า และข้ามบรรทัดว่าง
6. ส่ง `templateSlug` ด้วย → ขั้นตอนจากแม่แบบ **ต่อท้าย** `subtaskTitles`
7. `projectCode` **ไม่บังคับ** — ถ้าส่งมาต้องตรงรูปแบบ `E` + ปี 2 หลัก + `-` + เลข 4 หลัก (เช่น `E26-1234`) มิฉะนั้น `VALIDATION_ERROR`

**201 Created** → คืน card object เต็ม (โครงเดียวกับใน bootstrap)

### endpoint อื่น ๆ ของ Card

| Method | Path | Body |
|---|---|---|
| GET | `/api/cards/:id` | – (คืนพร้อม subtasks, comments, activities, timeLogs) |
| GET | `/api/cards` | query: `q, listId, priority, type, site, creatorId, assigneeId, slaStatus` |
| PATCH | `/api/cards/:id` | field ใด ๆ ที่แก้ได้ + `actorName` |
| PATCH | `/api/cards/:id/move` | `{ listId, position, actorName }` |
| POST | `/api/cards/:id/assignees` | `{ memberName }` |
| DELETE | `/api/cards/:id/assignees/:memberId` | – |
| DELETE | `/api/cards/:id` | `?actorName=...` |

> **หมายเหตุ:** เปลี่ยน `priority` → คำนวณ `slaDueAt` ใหม่ทันที

---

## 5. Subtasks ★

### `POST /api/cards/:id/subtasks` — เพิ่มหลายขั้นพร้อมกัน

```json
{ "titles": ["1. ทำ backup", "- ทดสอบ restore", "", "3) แจ้งผลให้ผู้ใช้"], "actorName": "ณัฐพล ว." }
```

→ **201** สร้าง 3 แถว: `ทำ backup`, `ทดสอบ restore`, `แจ้งผลให้ผู้ใช้`

```json
{
  "items": [
    { "id": 51, "title": "ทำ backup", "isDone": false, "position": 65536, "assignee": null, "dueDate": null, "isOverdue": false, "note": null, "doneBy": null, "doneAt": null }
  ],
  "progress": { "done": 0, "total": 3, "pct": 0 }
}
```

> `items` ใช้โครงเดียวกับ `subtasks[]` ใน `GET /api/cards/:id` เสมอ (id, title, isDone, position, assignee, dueDate, isOverdue, note, doneBy, doneAt) — endpoint อื่นของ subtask (toggle/reorder/apply-template) ก็คืนโครงนี้เช่นกัน
>
> `isOverdue` คำนวณที่ server ทุกครั้งที่อ่าน (`dueDate` เลยเวลาปัจจุบัน และ `isDone` = false) — ติ๊กเสร็จหรือลบ `dueDate` ออก ค่าจะกลับเป็น `false` ทันที

### endpoint อื่น ๆ ของ Subtask

| Method | Path | Body | ผลลัพธ์ |
|---|---|---|---|
| PATCH | `/api/subtasks/:sid` | `{ title?, assigneeName?, dueDate?, note? }` | subtask |
| PATCH | `/api/subtasks/:sid/toggle` | `{ actorName }` | `{ subtask, progress, card, movedTo? }` |
| DELETE | `/api/subtasks/:sid` | – | `{ progress }` |
| PATCH | `/api/cards/:id/subtasks/reorder` | `{ orderedIds: [3,1,2] }` | `{ items }` |
| POST | `/api/cards/:id/subtasks/apply-template` | `{ templateSlug, actorName }` | `{ items, progress, added: 11 }` |

**Response ของ toggle เมื่อเกิด auto-move:**

```json
{
  "subtask": { "id": 51, "isDone": 1, "isOverdue": false, "doneBy": "ณัฐพล ว.", "doneAt": "2026-09-01T10:22:00" },
  "progress": { "done": 1, "total": 11, "pct": 9 },
  "card": { "id": 130, "listId": 3 },
  "movedTo": { "listId": 3, "listName": "In Progress", "reason": "first_subtask_done" }
}
```

`reason` เป็นได้: `first_subtask_done` | `all_done_suggest_review`
(กรณีหลัง **ไม่ย้ายเอง** — ส่งมาให้ UI ถามผู้ใช้ก่อน)

---

## 6. Templates

| Method | Path | Body |
|---|---|---|
| GET | `/api/templates` | – คืน `{ items: [...] }`, แต่ละ template มี `items` เป็น array แล้ว (ไม่ใช่ JSON string) |
| POST | `/api/templates` | `{ name, items: string[] }` → 201 `{ id, name, slug, items, itemCount }` — `slug` สร้างอัตโนมัติ (`tpl-xxxxxxxx`) |
| PATCH | `/api/templates/:id` | `{ name?, items? }` |
| DELETE | `/api/templates/:id` | – 204 |

---

## 7. Comments / Attachments / Time Logs

| Method | Path | Body |
|---|---|---|
| POST | `/api/cards/:id/comments` | `{ authorName, body }` → 201 |
| DELETE | `/api/comments/:cid` | – 204 |
| POST | `/api/cards/:id/attachments` | `multipart/form-data`: `file`, `uploaderName` → 201 |
| GET | `/api/attachments/:aid/download` | – streams the file |
| DELETE | `/api/attachments/:aid` | – 204 |
| POST | `/api/cards/:id/time-logs` | `{ memberName, hours, note? }` → 201 |
| DELETE | `/api/time-logs/:tid` | – 204 |

ข้อจำกัดไฟล์: สูงสุด **10 MB** (`MAX_UPLOAD_MB`) · อนุญาต `image/*`, `application/pdf`, `text/plain`, `.log`, `.csv`, `.zip` — เกินขนาด → `413 PAYLOAD_TOO_LARGE`, ชนิดไฟล์ไม่รองรับ → `400 VALIDATION_ERROR`

**Response shapes** (201 ของแต่ละ POST — โครงเดียวกับที่อยู่ใน `comments`/`attachments`/`timeLogs` ของ `GET /api/cards/:id`):

```json
// POST /api/cards/:id/comments
{ "id": 5, "author": { "id": 2, "name": "ณัฐพล ว.", "color": "#10b981" }, "body": "กำลังดำเนินการอยู่", "createdAt": "2026-09-02T10:42" }

// POST /api/cards/:id/attachments
{ "id": 3, "filename": "note.txt", "mimeType": "text/plain", "size": 41, "uploader": { "id": 2, "name": "ณัฐพล ว.", "color": "#10b981" }, "createdAt": "2026-09-02T10:43" }

// POST /api/cards/:id/time-logs
{ "id": 7, "member": { "id": 2, "name": "ณัฐพล ว.", "color": "#10b981" }, "hours": 1.5, "note": null, "loggedAt": "2026-09-02T10:44" }
```

---

## 8. Labels

| Method | Path | Body |
|---|---|---|
| GET | `/api/labels` | – คืน `{ items: [...] }` |
| POST | `/api/labels` | `{ name, color? }` → 201 — `color` ไม่ส่งมา = สุ่มจาก palette คงที่ (เหมือน member auto-color) |
| PATCH | `/api/labels/:id` | `{ name?, color? }` |
| DELETE | `/api/labels/:id` | – 204 — ลบออกจากทุกการ์ดที่ติดอยู่ด้วย (`ON DELETE CASCADE`) |
| POST | `/api/cards/:id/labels` | `{ labelId }` → 201 `{ labels }` — ติดป้ายกำกับให้การ์ด |
| DELETE | `/api/cards/:id/labels/:labelId` | – 200 `{ labels }` — ถอดป้ายกำกับออกจากการ์ด |

```json
// GET /api/labels, POST /api/labels response
{ "id": 1, "name": "Network", "color": "#0ea5e9" }
```

---

## 9. Reports

| Method | Path | คืนอะไร |
|---|---|---|
| GET | `/api/reports/summary` | `{ open, doing, overdue, atRisk, doneThisWeek, avgCloseHours }` |
| GET | `/api/reports/workload` | `[{ memberId, name, active, created, overdue }]` |
| GET | `/api/reports/overdue` | รายการการ์ดเกินกำหนด + ใกล้ครบ |
| GET | `/api/reports/throughput?weeks=8` | `[{ week: "W35", opened: 12, closed: 8 }]` |
| GET | `/api/reports/by-creator` | `[{ name, count }]` |

## 10. Recurring Cards (ใบงานประจำ สำหรับงาน PM)

แต่ละ rule = ตารางเดินซ้ำ (รายสัปดาห์/รายเดือน) ที่สร้างใบงานจริงให้อัตโนมัติผ่าน `POST /api/cards`
เดียวกับที่ create-modal.js ใช้ (SLA/activity/แม่แบบขั้นตอนทำงานเหมือนกันทุกอย่าง)

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/recurring-cards` | `{ items: [...] }` |
| POST | `/api/recurring-cards` | สร้าง rule ใหม่ |
| PATCH | `/api/recurring-cards/:id` | แก้ไข rule (เปลี่ยนตารางเวลาจะคำนวณ `nextRunAt` ใหม่) |
| DELETE | `/api/recurring-cards/:id` | ลบ rule |
| POST | `/api/recurring-cards/:id/run-now` | สร้างใบงานรอบนี้ทันที (ไม่รอถึงเวลา) แล้วเลื่อน `nextRunAt` ต่อ |

Body ตอนสร้าง (`POST /api/recurring-cards`):

```json
{
  "name": "PM เราท์เตอร์ชั้น 5 รายสัปดาห์",
  "listId": 2,
  "title": "ตรวจเช็คเราท์เตอร์ชั้น 5",
  "type": "maintenance",
  "priority": "medium",
  "templateSlug": "pm",
  "creatorName": "ณัฐพล ว.",
  "assigneeName": "สมชาย ก.",
  "frequency": "weekly",
  "dayOfWeek": 1
}
```

- `frequency`: `"weekly"` (ต้องมี `dayOfWeek` 0-6, 0=อาทิตย์) หรือ `"monthly"` (ต้องมี `dayOfMonth` 1-28 — จำกัดไว้ไม่เกิน 28 เพื่อให้มีวันนั้นในทุกเดือน ไม่ต้องจัดการกรณีเดือนสั้น)
- server คำนวณ `nextRunAt` เองเสมอ (06:00 น. เวลาไทย ICT/UTC+7 ของวันที่ตรงเงื่อนไขถัดไป เก็บลง DB เป็น UTC) — client ไม่ส่งมาได้
- `isActive` (PATCH เท่านั้น): `false` = หยุดสร้างใบงานอัตโนมัติชั่วคราวโดยไม่ต้องลบ rule
- Scheduler ใน `server/index.js` เช็คทุก 5 นาที สร้างใบงานให้ทุก rule ที่ `nextRunAt` ถึงกำหนดแล้ว (persistent process เท่านั้น เหมือนอีเมลสรุป SLA — ไม่ทำงานบน deploy แบบ serverless)

## 11. Health

`GET /api/health` → `{ "ok": true, "db": "connected", "version": "1.0.0", "uptime": 3600 }`

DB ต่อไม่ได้ → **503** `{ "ok": false, "db": "error", "version": "1.0.0", "uptime": 3600 }` — สถานะ HTTP (ไม่ใช่แค่ `ok`) ต้องไม่ใช่ 200 เพื่อให้ Docker healthcheck (`docker-compose.yml`, ใช้ `wget`) ตรวจจับได้ว่า container ไม่ healthy