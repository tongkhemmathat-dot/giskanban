# CLAUDE.md — คู่มือสำหรับ AI Agent

> อ่านไฟล์นี้ก่อนเสมอ แล้วค่อยเปิด `docs/` ตามหัวข้อที่เกี่ยวข้องกับงานที่กำลังทำ

---

## 1. โปรเจกต์นี้คืออะไร

**JobCard Pro** — ระบบใบงาน (Job Card) แบบ Kanban สำหรับทีม System Engineer / NOC
ใช้ติดตามงาน Incident, Service Request, Change และงาน PM พร้อมขั้นตอนย่อยในแต่ละใบงาน

**ผู้ใช้:** ทีมภายใน 5–15 คน ใช้งานผ่านเครือข่ายองค์กร
**ภาษา UI:** ไทยทั้งหมด (โค้ด ตัวแปร คอมเมนต์ = อังกฤษ)

---

## 2. หลักการที่ห้ามละเมิด

| # | กติกา | เหตุผล |
|---|---|---|
| 1 | **ไม่มีระบบ Login / Auth / JWT / Role** | เปิดเว็บแล้วใช้ได้ทันที ความปลอดภัยอยู่ที่ชั้น network |
| 2 | **ทุกใบงานต้องมี `creator_id`** | รู้ว่าใครแจ้งงาน — บังคับกรอกตอนสร้าง |
| 3 | **ไม่ติดตั้ง framework ฝั่ง frontend** | Vanilla JS + Tailwind CDN เท่านั้น ให้แก้ไขง่าย |
| 4 | **SLA คำนวณที่ server เสมอ** | client ส่ง `slaDueAt` มา = ปฏิเสธ |
| 5 | **ไม่ลบข้อมูลจริงโดยไม่ถาม** | migration ต้อง idempotent |
| 6 | **ไม่เพิ่ม dependency ใหม่โดยไม่ถามก่อน** | คุมขนาดโปรเจกต์ |

---

## 3. Tech Stack

```yaml
runtime:   Node.js 20 LTS (ESM, "type": "module")
server:    Express 4
database:  SQLite + better-sqlite3   # ไฟล์เดียว backup ง่าย
validate:  zod
upload:    multer
frontend:  Vanilla JS + Tailwind (CDN) + Sortable.js + Chart.js
test:      vitest + supertest
deploy:    Docker Compose + Caddy (reverse proxy + basic auth)
```

---

## 4. โครงสร้างโฟลเดอร์

```text
jobcard-pro/
├── CLAUDE.md
├── README.md
├── docs/                      # เอกสารทั้งหมด (อ่านตามต้องการ)
│   ├── 01-overview.md         # ขอบเขต + ศัพท์
│   ├── 02-architecture.md     # สถาปัตยกรรม + หน้าที่แต่ละไฟล์
│   ├── 03-database.md         # schema เต็ม + migration + seed
│   ├── 04-api.md              # API contract ทุก endpoint
│   ├── 05-business-rules.md   # SLA / subtask / auto-move
│   ├── 06-ui-spec.md          # หน้าจอ + component
│   ├── 07-roadmap.md          # Task list ที่ต้องทำ ← เริ่มที่นี่
│   ├── 08-testing.md          # test case
│   ├── 09-deployment.md       # Docker + Caddy
│   └── 10-conventions.md      # code style + git
├── server/
│   ├── index.js               # entry — express app
│   ├── db/
│   │   ├── connection.js      # better-sqlite3 singleton
│   │   ├── migrate.js         # runner อ่านไฟล์ใน migrations/
│   │   ├── migrations/*.sql
│   │   └── seed.js
│   ├── routes/                # *.routes.js — รับ req เท่านั้น
│   ├── services/              # *.service.js — business logic ทั้งหมด
│   ├── schemas/               # *.schema.js — zod
│   ├── middleware/
│   │   ├── error.js           # error handler กลาง
│   │   └── validate.js
│   └── utils/{sla.js,code.js,position.js}
├── public/
│   ├── index.html
│   ├── mockup.html            # visual reference (mock data ล้วน)
│   ├── css/app.css
│   └── js/
│       ├── api.js             # fetch wrapper
│       ├── store.js           # state กลาง
│       ├── app.js             # router
│       ├── views/{board,dashboard,mytasks,members}.view.js
│       └── components/{card,card-modal,create-modal,subtasks,toast}.js
├── data/                      # jobcard.db + uploads/ (gitignore)
├── tests/
├── docker-compose.yml
├── Dockerfile
├── Caddyfile
└── .env.example
```

---

## 5. คำสั่งที่ใช้บ่อย

```bash
npm install
npm run migrate      # สร้าง/อัปเดตตาราง
npm run seed         # ใส่ข้อมูลตัวอย่าง
npm run dev          # nodemon :3000
npm test             # vitest
npm run lint
docker compose up -d --build
```

---

## 6. กติกาการเขียนโค้ด

1. **Route บาง Service หนา** — `routes/` ห้ามมี SQL หรือ business logic แม้แต่บรรทัดเดียว
2. **Validate ด้วย zod ทุก endpoint** ที่รับ body/params
3. **ทุก error ตอบรูปแบบเดียว:** `{ error: { code, message, details? } }`
4. **ทุก mutation เขียน `activities`** ด้วย `actor_name` (ชื่อดิบ ไม่ต้อง join)
5. **Transaction** สำหรับงานที่แตะหลายตาราง (`db.transaction(fn)()`)
6. **Frontend escape ทุก string** ที่มาจาก user ด้วย `esc()` ก่อนใส่ `innerHTML`
7. **ห้าม `console.log` ค้างใน production code** — ใช้ `logger`

---

## 7. Definition of Done (ทุก task)

- [ ] โค้ดรันได้ ไม่มี error ใน console
- [ ] มี zod validation ครบ
- [ ] มี test อย่างน้อย 1 เคส happy path + 1 เคส error
- [ ] อัปเดต `docs/04-api.md` ถ้าเพิ่ม/แก้ endpoint
- [ ] ติ๊ก checkbox ใน `docs/07-roadmap.md`
- [ ] commit ตาม Conventional Commits (ดู `docs/10-conventions.md`)

---

## 8. เริ่มทำงานยังไง

1. เปิด `docs/07-roadmap.md` หา task แรกที่ยังไม่ติ๊ก
2. อ่าน doc ที่เกี่ยวข้อง (schema → `03`, API → `04`, กติกา → `05`)
3. ทำทีละ task ให้ครบ Definition of Done แล้วค่อยไป task ถัดไป
4. ถ้าเจอความกำกวม — **ถามก่อน อย่าเดา**

---

## 9. สิ่งที่ห้ามทำเด็ดขาด

- ❌ เพิ่ม login page / JWT / bcrypt / session
- ❌ ติดตั้ง React / Vue / Svelte / Next.js
- ❌ เปลี่ยน SQLite เป็น Postgres โดยไม่ถาม
- ❌ ลบไฟล์ใน `data/`
- ❌ แก้ `docs/` โดยไม่บอก (ยกเว้นติ๊ก checkbox ใน roadmap)