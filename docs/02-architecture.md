# 02 — สถาปัตยกรรม

## 1. ภาพรวม

```text
┌──────────────────────────────────────────────────────────┐
│  Browser (Vanilla JS)                                    │
│  ┌────────┐  ┌──────────┐  ┌─────────────────────────┐   │
│  │ app.js │→ │ store.js │→ │ views/ + components/    │   │
│  │(router)│  │ (state)  │  │ board · dashboard · ... │   │
│  └────────┘  └────┬─────┘  └─────────────────────────┘   │
│                   │ api.js (fetch wrapper)               │
└───────────────────┼──────────────────────────────────────┘
                    │ HTTP/JSON
┌───────────────────▼──────────────────────────────────────┐
│  Caddy — reverse proxy + basic auth + TLS                │
└───────────────────┬──────────────────────────────────────┘
┌───────────────────▼──────────────────────────────────────┐
│  Express (Node 20)                                       │
│  routes/ ──→ middleware/validate (zod) ──→ services/     │
│                                              │           │
│                              utils/ (sla, code, position)│
└──────────────────────────────────────────────┼───────────┘
                                    ┌──────────▼─────────┐
                                    │ SQLite (WAL mode)  │
                                    │ data/jobcard.db    │
                                    │ data/uploads/      │
                                    └────────────────────┘
```

## 2. ชั้นและความรับผิดชอบ

| ชั้น | โฟลเดอร์ | ทำอะไร | ห้ามทำ |
|---|---|---|---|
| Route | `server/routes/` | รับ req, เรียก service, ส่ง res | SQL, business logic |
| Validate | `server/schemas/` | zod schema | เรียก DB |
| Service | `server/services/` | logic + SQL + transaction | อ่าน `req`/`res` |
| Util | `server/utils/` | ฟังก์ชันบริสุทธิ์ | แตะ DB |
| DB | `server/db/` | connection, migration, seed | business logic |

## 3. หน้าที่ของแต่ละไฟล์

### Backend

| ไฟล์ | หน้าที่ |
|---|---|
| `server/index.js` | ตั้งค่า express, static, routes, error handler, listen |
| `db/connection.js` | เปิด better-sqlite3, `PRAGMA journal_mode=WAL`, `foreign_keys=ON` |
| `db/migrate.js` | อ่าน `migrations/*.sql` เรียงชื่อ รันที่ยังไม่เคยรัน บันทึกใน `_migrations` |
| `db/seed.js` | ใส่ members, board, lists, labels, templates, cards ตัวอย่าง |
| `routes/bootstrap.routes.js` | `GET /api/bootstrap` — ดึงทุกอย่างใน 1 request |
| `routes/cards.routes.js` | CRUD ใบงาน + move |
| `routes/subtasks.routes.js` | CRUD ขั้นตอนย่อย + reorder + apply-template |
| `routes/members.routes.js` | รายชื่อทีม + upsert by name |
| `routes/reports.routes.js` | summary / workload / overdue / throughput |
| `services/card.service.js` | สร้างรหัส, คำนวณ SLA, transaction, เขียน activity |
| `services/subtask.service.js` | bulk insert, toggle, auto-move, reorder |
| `utils/sla.js` | `calcSlaDueAt(priority, createdAt)` |
| `utils/code.js` | `nextCardCode()` → `JC-000131` |
| `utils/position.js` | `midPosition(prev, next)` สำหรับ drag & drop |
| `routes/calendar.routes.js` | connections (เพิ่ม/ลบ/รายการ) + events — ปฏิทินรวมของทีม |
| `services/calendar.service.js` | เก็บลิงก์ .ics ต่อสมาชิก, poll ดึง+parse, แคชอีเวนต์ |
| `utils/crypto.js` | AES-256-GCM `encrypt`/`decrypt` สำหรับลิงก์ .ics ที่เก็บใน DB |
| `utils/ics.js` | parse ไฟล์ .ics (RFC 5545 แบบจำกัดขอบเขต) → รายการอีเวนต์ |

### Frontend

| ไฟล์ | หน้าที่ |
|---|---|
| `js/api.js` | `get/post/patch/del` + จัดการ error กลาง |
| `js/store.js` | เก็บ `state` (board, lists, cards, members) + `emit()` |
| `js/app.js` | router hash-based + boot `GET /api/bootstrap` |
| `views/board.view.js` | วาดคอลัมน์ + Sortable |
| `components/card.js` | HTML ของการ์ด 1 ใบ + progress bar |
| `components/card-modal.js` | modal รายละเอียด |
| `components/create-modal.js` | ฟอร์มสร้าง (มีช่องผู้สร้าง + ขั้นตอน) |
| `components/subtasks.js` | รายการขั้นตอน + drag + template |
| `components/toast.js` | แจ้งเตือนมุมล่าง |
| `views/calendar.view.js` | ปฏิทินรวมของทีม รายสัปดาห์ + filter รายสมาชิก |

## 4. Data Flow — ตัวอย่าง "ติ๊กขั้นตอนเสร็จ"

```text
1. user คลิก checkbox
2. subtasks.js → api.patch('/api/subtasks/45/toggle', { actorName: ME })
3. routes/subtasks.routes.js → validate zod
4. services/subtask.service.js (transaction):
   a. UPDATE subtasks SET is_done, done_by, done_at
   b. อ่าน card_progress
   c. ถ้า done>0 && card.list_id ∈ {Backlog, To Do} → ย้ายไป In Progress
   d. INSERT activities
5. ตอบ { subtask, card, progress, movedTo? }
6. store.js อัปเดต state → re-render การ์ด + progress bar
7. ถ้ามี movedTo → toast แจ้ง
```

## 4.5 Data Flow — "เชื่อมต่อปฏิทิน .ics แล้วดูปฏิทินรวม"

```text
1. สมาชิก publish ปฏิทิน Outlook ของตัวเองเป็นลิงก์ .ics (นอกระบบ, ทำใน
   Outlook เอง — docs/09-deployment.md §4.5) แล้ววางลิงก์ในฟอร์มที่หน้า
   Members → api.post('/calendar/connections', { memberId, icsUrl })
2. calendar.service.js's addConnection(): fetch ลิงก์ 1 ครั้งเพื่อตรวจว่า
   เป็น .ics จริง → เข้ารหัสด้วย crypto.js → เก็บ/อัปเดตแถวใน
   calendar_connections → poll รอบแรกแบบ fire-and-forget ให้เห็นผลทันที
3. Scheduler ใน server/index.js เรียก pollAllConnections() ทุก
   CALENDAR_POLL_MINUTES นาที: ถอดรหัสลิงก์ → fetch .ics → parse ด้วย
   utils/ics.js (ขยาย recurring event ในช่วงหน้าต่างเวลา) → wipe+insert ลง
   calendar_events
4. calendar.view.js โหลด GET /api/calendar/events?start=&end= (อ่านจากแคช
   เสมอ ไม่รอ fetch สด) + GET /api/calendar/connections (สถานะ/สี filter chip)
   มาวาดเป็นตารางรายสัปดาห์
```

## 5. การตัดสินใจเชิงเทคนิค

| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| Database | SQLite | ทีมเล็ก, backup = copy 1 ไฟล์, ไม่ต้องดูแล server |
| ORM | ไม่ใช้ (raw SQL) | query ตรงไปตรงมา อ่านง่าย ไม่มี magic |
| Frontend | Vanilla JS | ทีมดูแลต่อได้เอง ไม่ต้อง build step |
| Drag & drop | Sortable.js | เบา ใช้ง่าย รองรับ touch |
| ลำดับ (position) | float | แทรกกลางได้โดยไม่ต้อง update ทั้งคอลัมน์ |
| ผู้สร้าง | เก็บเป็น FK → `members` | รายงาน "ใครสร้างกี่ใบ" ได้ |
| Activity actor | เก็บเป็นข้อความ | ไม่ต้อง join, ประวัติไม่เสียถ้าลบสมาชิก |
| Calendar sync | ลิงก์ .ics ที่สมาชิก publish เอง ไม่ใช้ Microsoft Graph OAuth | ไม่ต้องตั้งค่า Azure AD app registration/client secret เลย — สมาชิก publish ลิงก์เองในเบราว์เซอร์ได้ทันที; แลกกับ: ต้อง parse RRULE เอง (ไม่มี auto-expand เหมือน Graph's calendarview) และลิงก์เป็น bearer secret ที่ revoke แยกจากการสร้างใหม่ทั้งหมดไม่ได้ |
| .ics parser | เขียนเอง (`server/utils/ics.js`) ไม่ใช้ library | โปรเจกต์นี้ไม่มี HTTP client/parsing dependency เลยสักตัว (raw SQL, ไม่มี ORM) — ตรงตามข้อ 6 ของ `CLAUDE.md` ที่ไม่เพิ่ม dependency โดยไม่จำเป็น; ขอบเขต RRULE ที่รองรับจำกัดเฉพาะ DAILY/WEEKLY/MONTHLY แบบพื้นฐาน (ดู comment ในไฟล์) |
| Calendar sync method | Polling ไม่ใช้ push | ระบบรันในเครือข่ายองค์กร ไม่มี public HTTPS endpoint ให้ผู้ให้บริการภายนอก push แจ้งเตือนได้อยู่แล้ว |
| Calendar event cache | wipe-and-reinsert ต่อรอบ poll | ง่ายกว่า incremental diff มาก สำหรับทีม 5-15 คน, อีเวนต์ที่ยกเลิก/ย้ายหายไปเองโดยไม่ต้อง track การลบ |