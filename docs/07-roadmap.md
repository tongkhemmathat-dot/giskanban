# 07 — Roadmap และรายการงาน

> ทำจากบนลงล่าง · ติ๊ก `[x]` เมื่อผ่าน Definition of Done ใน `CLAUDE.md`

---

## Phase 0 — เตรียมโครงการ

- [x] **0.1** `npm init` + ติดตั้ง dependencies + ตั้ง `"type": "module"`
      *AC:* `npm run dev` ขึ้น server ที่ :3000 ได้
- [x] **0.2** สร้างโครงโฟลเดอร์ตาม `CLAUDE.md` ข้อ 4
- [x] **0.3** `.env.example`, `.gitignore` (`data/`, `node_modules/`, `.env`)
- [x] **0.4** ESLint + Prettier + `npm run lint`
- [x] **0.5** วาง `public/mockup.html` เป็น visual reference
      *AC:* เปิดในเบราว์เซอร์แล้วลาก-วางได้ (mock data ล้วน)

---

## Phase 1 — ฐานข้อมูล

- [x] **1.1** `db/connection.js` — WAL mode + `foreign_keys = ON`
- [x] **1.2** `db/migrate.js` — runner + ตาราง `_migrations`
      *AC:* รัน 2 ครั้งติดกันไม่ error (idempotent)
- [x] **1.3** `migrations/001_init.sql` (ตาม `docs/03-database.md`)
- [x] **1.4** `migrations/002_subtasks.sql` + view `card_progress`
- [x] **1.5** `db/seed.js` — members 5, lists 6, templates 4, cards 10+
      *AC:* มีใบงาน `Upgrade ArcGIS Enterprise 12.1` พร้อม 11 ขั้นตอน (ติ๊ก 3)
- [x] **1.6** `utils/{sla,code,position,subtask}.js` + unit test

---

## Phase 2 — API หลัก

- [x] **2.1** `server/index.js` + `middleware/error.js` + `GET /api/health`
- [x] **2.2** `middleware/validate.js` (zod) + error format มาตรฐาน
- [x] **2.3** `members.routes.js` — GET / POST (upsert by name)
      *AC:* POST ชื่อซ้ำ → คืนตัวเดิม status 200 ไม่สร้างซ้ำ
- [x] **2.4** `GET /api/bootstrap`
      *AC:* 1 request ได้ board+lists+cards+members+labels+templates ครบ
- [x] **2.5** `POST /api/cards`
      *AC:* ไม่ส่ง `creatorName` → 400 `VALIDATION_ERROR`
      *AC:* ส่งชื่อใหม่ → สร้าง member อัตโนมัติ
      *AC:* ไม่ส่ง assignee → assignee = creator
      *AC:* `code` และ `slaDueAt` ถูก server สร้างเอง
      *AC:* `projectCode` ไม่บังคับ แต่ถ้าส่งมาต้องตรงรูปแบบ `E##-####` มิฉะนั้น 400
- [x] **2.6** `GET /api/cards` (+filter) และ `GET /api/cards/:id`
- [x] **2.7** `PATCH /api/cards/:id`
      *AC:* เปลี่ยน priority → `slaDueAt` คำนวณใหม่จาก `created_at` เดิม
- [x] **2.8** `PATCH /api/cards/:id/move`
      *AC:* ย้ายเข้าคอลัมน์ `is_done` → ตั้ง `completed_at`
- [x] **2.9** `DELETE /api/cards/:id` + cascade ทุกตารางลูก
- [x] **2.10** assignees add / remove

---

## Phase 3 — ขั้นตอนย่อย ★

- [x] **3.1** `POST /api/cards/:id/subtasks` รับ `titles[]` แบบ bulk
      *AC:* `['1. ทำ backup','- ทดสอบ','','3) แจ้งผล']` → 3 แถว ไม่มีเลข/ขีดนำหน้า
- [x] **3.2** `PATCH /api/subtasks/:sid` (title, assignee, dueDate, note)
- [x] **3.3** `PATCH /api/subtasks/:sid/toggle` เขียน `done_by` + `done_at`
      *AC:* ติ๊กแล้ว query กลับมามีชื่อผู้ติ๊กและเวลา
- [x] **3.4** Auto-move ตาม `docs/05-business-rules.md` ข้อ 4.3
      *AC:* ติ๊กขั้นแรกขณะอยู่ To Do → `list_id` = In Progress + มี `movedTo` ใน response
      *AC:* ติ๊กครบทุกขั้น → คืน `reason: all_done_suggest_review` แต่ **ไม่ย้ายเอง**
- [x] **3.5** `DELETE /api/subtasks/:sid`
- [x] **3.6** `PATCH /api/cards/:id/subtasks/reorder`
      *AC:* ส่ง `[3,1,2]` → position เรียงตามนั้น
- [x] **3.7** `templates` CRUD + `POST .../apply-template`
      *AC:* ใช้แม่แบบกับการ์ดที่มี 2 ขั้นอยู่แล้ว → **ต่อท้าย** ไม่ลบของเดิม
- [x] **3.8** `progress` แนบไปกับ card ทุก response

---

## Phase 4 — Frontend

- [x] **4.1** `api.js` + `store.js` + `app.js` (hash router) + boot bootstrap
- [x] **4.2** `components/toast.js`
- [x] **4.3** ตัวเลือก "ฉันคือ" + `localStorage` key `jc_me`
- [x] **4.4** `board.view.js` + `components/card.js` + progress bar
- [x] **4.5** Drag & drop (Sortable) → ยิง `/move` + optimistic update
      *AC:* API fail → การ์ดเด้งกลับที่เดิม + toast แจ้ง error
- [x] **4.6** `create-modal.js` — ช่องผู้สร้าง (บังคับ) + textarea ขั้นตอน + แม่แบบ
- [x] **4.7** `card-modal.js` 2 คอลัมน์ครบทุกส่วน
- [x] **4.8** `components/subtasks.js` — เพิ่ม/ติ๊ก/แก้/ลบ/ลาก/แม่แบบ
      *AC:* วาง 3 บรรทัดพร้อมกันได้ 3 ขั้นตอนใน 1 คลิก
- [x] **4.9** ค้นหา + กรอง (client-side debounce 250ms)
- [x] **4.10** `mytasks.view.js` — งานที่ฉันสร้าง + ที่ฉันรับผิดชอบ
- [x] **4.11** `members.view.js` — รายชื่อ + สถิติสร้าง/ค้าง
- [x] **4.12** `dashboard.view.js` — KPI + 2 กราฟ + ตารางงานเสี่ยง

---

## Phase 5 — ส่วนเสริม

- [x] **5.1** Comments API + UI
- [x] **5.2** Attachments (multer, 10MB) + download + UI
- [x] **5.3** Time logs API + UI
- [x] **5.4** Activity timeline ใน modal
- [x] **5.5** Labels CRUD + chip บนการ์ด
- [x] **5.6** Reports 5 endpoints
- [x] **5.7** Responsive มือถือ (ตาม `docs/06-ui-spec.md` ข้อ 10)

---

## Phase 6 — ขึ้นระบบ

- [x] **6.1** `Dockerfile` (multi-stage, non-root, node:20-alpine)
- [x] **6.2** `docker-compose.yml` + volume `./data`
- [x] **6.3** `Caddyfile` + Basic Auth + TLS
- [x] **6.4** สคริปต์ backup รายวัน (`sqlite3 .backup`) เก็บ 14 วัน
- [x] **6.5** `GET /api/health` เชื่อมกับ Docker healthcheck
- [x] **6.6** อัปเดต README ส่วนติดตั้งจริง

---

## ทำทีหลัง (Backlog)

- [x] แจ้งเตือนเมื่องานใกล้ชน SLA — Line Notify ถูกยกเลิกโดย LINE (มี.ค. 2025) เปลี่ยนเป็นอีเมลสรุปรายวัน 1 ฉบับ/วัน (`server/services/notify.service.js`, ตั้งค่าใน `.env`: `NOTIFY_ENABLED`/`NOTIFY_HOUR`/`NOTIFY_EMAIL_TO`/`SMTP_*`) ทำงานเฉพาะ process ที่รันค้างไว้ (Docker) ไม่ใช่ demo แบบ serverless
- [x] Export CSV — `GET /api/cards/export` (รองรับ filter เดียวกับ `GET /api/cards`) + ปุ่มใน header · "รายงานรายเดือน" แยกไม่ได้ทำ (ไม่มี concept ชัดเจนนอกเหนือจาก Dashboard ที่มีอยู่แล้ว)
- [x] กำหนด due date รายขั้นตอน + เตือนขั้นที่เลยกำหนด — `subtasks.isOverdue` คำนวณที่ server (`parseAsUtc`, `server/utils/sla.js`), ตั้งค่า/แก้ไขได้ใน card-modal ตอน hover แถวขั้นตอน
- [x] หน้าจัดการแม่แบบจากในเว็บ — `#/templates` (`public/js/views/templates.view.js`)
- [x] ใบงานประจำ (recurring) สำหรับงาน PM — `recurring_cards` table (`003_recurring.sql`) + `server/services/recurring.service.js` + `#/recurring` (`public/js/views/recurring.view.js`); scheduler ใน `server/index.js` เช็คทุก 5 นาที สร้างการ์ดจริงผ่าน `createCard()` เมื่อถึงกำหนด, ปุ่ม "สร้างตอนนี้" สำหรับ trigger มือ
- [x] Dark mode — toggle ใน header, จำค่าไว้ (`localStorage jc_theme`), ตาม system preference เป็นค่าเริ่มต้น
- [x] ตัวอักษรใหญ่ (สำหรับผู้ใช้สูงอายุ) — ปุ่ม "Aa" ใน header เหมือน dark mode toggle, จำค่าไว้ (`localStorage jc_textsize`), ขยาย root font-size 118% (`public/js/textsize.js`, `public/css/app.css`)
- [x] พัก SLA ระหว่างรอผู้ให้บริการภายนอก — คอลัมน์ที่ตั้ง `lists.pauses_sla = 1` (ปัจจุบันคือ Waiting Vendor) ไม่นับเวลาเสี่ยง/เกินกำหนดระหว่างการ์ดอยู่ในนั้น เข้า/ออกจะพัก/เลื่อน `sla_due_at` ให้อัตโนมัติ (`004_sla_pause.sql`, `server/utils/sla.js`'s `shiftSlaDueAt`, `card.service.js`'s `moveCardTxn`) ดู `docs/05-business-rules.md` §2
- [x] Bulk action บนบอร์ด — ปุ่ม "☑️ เลือกหลายใบ" เลือกหลายการ์ดพร้อมกันแล้วย้ายคอลัมน์/มอบหมายทีเดียว (`public/js/views/board.view.js`) ไม่มี endpoint ใหม่ — วนเรียก `PATCH /api/cards/:id/move` / `POST /api/cards/:id/assignees` เดิมทีละใบ
- [x] ป้ายเตือนการ์ดค้าง — การ์ดที่ไม่มีความเคลื่อนไหว (แก้ไข/ย้าย/ติ๊กขั้นตอน/คอมเมนต์/log เวลา) ≥3 วัน และยังไม่เสร็จ ขึ้นป้าย "🕸 ไม่มีความเคลื่อนไหว N วัน" — คำนวณจาก `lastActivityAt` (ใหม่กว่าของ `updated_at`/`MAX(activities.created_at)`, `card.service.js`'s `mapCardRow`) ไม่เพิ่มตาราง/คอลัมน์ใหม่ ดู `docs/04-api.md` §2
- [x] ปุ่มกรองด่วนบนบอร์ด — chip "ของฉัน / วิกฤต / เกินกำหนด / ค้างนาน" เลือกได้ทีละอัน (กดซ้ำเพื่อล้าง) ANDs กับช่องค้นหาเดิม (`public/js/views/board.view.js`'s `matchesQuickFilter`) frontend ล้วน ไม่มี query param ใหม่