# 07 — Roadmap และรายการงาน

> ทำจากบนลงล่าง · ติ๊ก `[x]` เมื่อผ่าน Definition of Done ใน `CLAUDE.md`

---

## Phase 0 — เตรียมโครงการ

- [ ] **0.1** `npm init` + ติดตั้ง dependencies + ตั้ง `"type": "module"`
      *AC:* `npm run dev` ขึ้น server ที่ :3000 ได้
- [ ] **0.2** สร้างโครงโฟลเดอร์ตาม `CLAUDE.md` ข้อ 4
- [ ] **0.3** `.env.example`, `.gitignore` (`data/`, `node_modules/`, `.env`)
- [ ] **0.4** ESLint + Prettier + `npm run lint`
- [ ] **0.5** วาง `public/mockup.html` เป็น visual reference
      *AC:* เปิดในเบราว์เซอร์แล้วลาก-วางได้ (mock data ล้วน)

---

## Phase 1 — ฐานข้อมูล

- [ ] **1.1** `db/connection.js` — WAL mode + `foreign_keys = ON`
- [ ] **1.2** `db/migrate.js` — runner + ตาราง `_migrations`
      *AC:* รัน 2 ครั้งติดกันไม่ error (idempotent)
- [ ] **1.3** `migrations/001_init.sql` (ตาม `docs/03-database.md`)
- [ ] **1.4** `migrations/002_subtasks.sql` + view `card_progress`
- [ ] **1.5** `db/seed.js` — members 5, lists 6, templates 4, cards 10+
      *AC:* มีใบงาน `Upgrade ArcGIS Enterprise 12.1` พร้อม 11 ขั้นตอน (ติ๊ก 3)
- [ ] **1.6** `utils/{sla,code,position,subtask}.js` + unit test

---

## Phase 2 — API หลัก

- [ ] **2.1** `server/index.js` + `middleware/error.js` + `GET /api/health`
- [ ] **2.2** `middleware/validate.js` (zod) + error format มาตรฐาน
- [ ] **2.3** `members.routes.js` — GET / POST (upsert by name)
      *AC:* POST ชื่อซ้ำ → คืนตัวเดิม status 200 ไม่สร้างซ้ำ
- [ ] **2.4** `GET /api/bootstrap`
      *AC:* 1 request ได้ board+lists+cards+members+labels+templates ครบ
- [ ] **2.5** `POST /api/cards`
      *AC:* ไม่ส่ง `creatorName` → 400 `VALIDATION_ERROR`
      *AC:* ส่งชื่อใหม่ → สร้าง member อัตโนมัติ
      *AC:* ไม่ส่ง assignee → assignee = creator
      *AC:* `code` และ `slaDueAt` ถูก server สร้างเอง
- [ ] **2.6** `GET /api/cards` (+filter) และ `GET /api/cards/:id`
- [ ] **2.7** `PATCH /api/cards/:id`
      *AC:* เปลี่ยน priority → `slaDueAt` คำนวณใหม่จาก `created_at` เดิม
- [ ] **2.8** `PATCH /api/cards/:id/move`
      *AC:* ย้ายเข้าคอลัมน์ `is_done` → ตั้ง `completed_at`
- [ ] **2.9** `DELETE /api/cards/:id` + cascade ทุกตารางลูก
- [ ] **2.10** assignees add / remove

---

## Phase 3 — ขั้นตอนย่อย ★

- [ ] **3.1** `POST /api/cards/:id/subtasks` รับ `titles[]` แบบ bulk
      *AC:* `['1. ทำ backup','- ทดสอบ','','3) แจ้งผล']` → 3 แถว ไม่มีเลข/ขีดนำหน้า
- [ ] **3.2** `PATCH /api/subtasks/:sid` (title, assignee, dueDate, note)
- [ ] **3.3** `PATCH /api/subtasks/:sid/toggle` เขียน `done_by` + `done_at`
      *AC:* ติ๊กแล้ว query กลับมามีชื่อผู้ติ๊กและเวลา
- [ ] **3.4** Auto-move ตาม `docs/05-business-rules.md` ข้อ 4.3
      *AC:* ติ๊กขั้นแรกขณะอยู่ To Do → `list_id` = In Progress + มี `movedTo` ใน response
      *AC:* ติ๊กครบทุกขั้น → คืน `reason: all_done_suggest_review` แต่ **ไม่ย้ายเอง**
- [ ] **3.5** `DELETE /api/subtasks/:sid`
- [ ] **3.6** `PATCH /api/cards/:id/subtasks/reorder`
      *AC:* ส่ง `[3,1,2]` → position เรียงตามนั้น
- [ ] **3.7** `templates` CRUD + `POST .../apply-template`
      *AC:* ใช้แม่แบบกับการ์ดที่มี 2 ขั้นอยู่แล้ว → **ต่อท้าย** ไม่ลบของเดิม
- [ ] **3.8** `progress` แนบไปกับ card ทุก response

---

## Phase 4 — Frontend

- [x] **4.1** `api.js` + `store.js` + `app.js` (hash router) + boot bootstrap
- [x] **4.2** `components/toast.js`
- [x] **4.3** ตัวเลือก "ฉันคือ" + `localStorage` key `jc_me`
- [x] **4.4** `board.view.js` + `components/card.js` + progress bar
- [x] **4.5** Drag & drop (Sortable) → ยิง `/move` + optimistic update
      *AC:* API fail → การ์ดเด้งกลับที่เดิม + toast แจ้ง error
- [ ] **4.6** `create-modal.js` — ช่องผู้สร้าง (บังคับ) + textarea ขั้นตอน + แม่แบบ
- [ ] **4.7** `card-modal.js` 2 คอลัมน์ครบทุกส่วน
- [ ] **4.8** `components/subtasks.js` — เพิ่ม/ติ๊ก/แก้/ลบ/ลาก/แม่แบบ
      *AC:* วาง 3 บรรทัดพร้อมกันได้ 3 ขั้นตอนใน 1 คลิก
- [ ] **4.9** ค้นหา + กรอง (client-side debounce 250ms)
- [ ] **4.10** `mytasks.view.js` — งานที่ฉันสร้าง + ที่ฉันรับผิดชอบ
- [ ] **4.11** `members.view.js` — รายชื่อ + สถิติสร้าง/ค้าง
- [ ] **4.12** `dashboard.view.js` — KPI + 2 กราฟ + ตารางงานเสี่ยง

---

## Phase 5 — ส่วนเสริม

- [ ] **5.1** Comments API + UI
- [ ] **5.2** Attachments (multer, 10MB) + download + UI
- [ ] **5.3** Time logs API + UI
- [ ] **5.4** Activity timeline ใน modal
- [ ] **5.5** Labels CRUD + chip บนการ์ด
- [ ] **5.6** Reports 5 endpoints
- [ ] **5.7** Responsive มือถือ (ตาม `docs/06-ui-spec.md` ข้อ 10)

---

## Phase 6 — ขึ้นระบบ

- [ ] **6.1** `Dockerfile` (multi-stage, non-root, node:20-alpine)
- [ ] **6.2** `docker-compose.yml` + volume `./data`
- [ ] **6.3** `Caddyfile` + Basic Auth + TLS
- [ ] **6.4** สคริปต์ backup รายวัน (`sqlite3 .backup`) เก็บ 14 วัน
- [ ] **6.5** `GET /api/health` เชื่อมกับ Docker healthcheck
- [ ] **6.6** อัปเดต README ส่วนติดตั้งจริง

---

## ทำทีหลัง (Backlog)

- แจ้งเตือน Line Notify เมื่องานใกล้ชน SLA
- Export CSV / รายงานรายเดือน
- กำหนด due date รายขั้นตอน + เตือนขั้นที่เลยกำหนด
- หน้าจัดการแม่แบบจากในเว็บ
- ใบงานประจำ (recurring) สำหรับงาน PM
- Dark mode