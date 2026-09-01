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
      "dueDate": "2026-09-06T22:00", "slaDueAt": "2026-09-02T10:00",
      "slaStatus": "ok",
      "creator": { "id": 1, "name": "สมชาย ก.", "color": "#6366f1" },
      "assignees": [{ "id": 2, "name": "ณัฐพล ว.", "color": "#10b981" }],
      "labels": [], "progress": { "done": 3, "total": 11, "pct": 27 },
      "counts": { "comments": 2, "attachments": 1 }
    }
  ]
}
```

---

## 3. Members

| Method | Path | Body | หมายเหตุ |
|---|---|---|---|
| GET | `/api/members` | – | `?active=1` กรองเฉพาะที่ใช้งาน |
| POST | `/api/members` | `{ "name": "วีระ ท." }` | **upsert by name** — มีอยู่แล้วคืนตัวเดิม 200 |
| PATCH | `/api/members/:id` | `{ name?, short?, color?, isActive? }` | |

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
  "items": [{ "id": 51, "title": "ทำ backup", "isDone": 0, "position": 65536 }],
  "progress": { "done": 0, "total": 3, "pct": 0 }
}
```

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
  "subtask": { "id": 51, "isDone": 1, "doneBy": "ณัฐพล ว.", "doneAt": "2026-09-01T10:22:00" },
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
| GET | `/api/templates` | – (คืน `items` เป็น array แล้ว) |
| POST | `/api/templates` | `{ name, items: string[] }` |
| PATCH | `/api/templates/:id` | `{ name?, items? }` |
| DELETE | `/api/templates/:id` | – |

---

## 7. Comments / Attachments / Time Logs

| Method | Path | Body |
|---|---|---|
| POST | `/api/cards/:id/comments` | `{ authorName, body }` |
| DELETE | `/api/comments/:cid` | – |
| POST | `/api/cards/:id/attachments` | `multipart/form-data`: `file`, `uploaderName` |
| GET | `/api/attachments/:aid/download` | – |
| DELETE | `/api/attachments/:aid` | – |
| POST | `/api/cards/:id/time-logs` | `{ memberName, hours, note? }` |
| DELETE | `/api/time-logs/:tid` | – |

ข้อจำกัดไฟล์: สูงสุด **10 MB** · อนุญาต `image/*`, `application/pdf`, `text/plain`, `.log`, `.csv`, `.zip`

---

## 8. Reports

| Method | Path | คืนอะไร |
|---|---|---|
| GET | `/api/reports/summary` | `{ open, doing, overdue, atRisk, doneThisWeek, avgCloseHours }` |
| GET | `/api/reports/workload` | `[{ memberId, name, active, created, overdue }]` |
| GET | `/api/reports/overdue` | รายการการ์ดเกินกำหนด + ใกล้ครบ |
| GET | `/api/reports/throughput?weeks=8` | `[{ week: "W35", opened: 12, closed: 8 }]` |
| GET | `/api/reports/by-creator` | `[{ name, count }]` |

## 9. Health

`GET /api/health` → `{ "ok": true, "db": "connected", "version": "1.0.0", "uptime": 3600 }`