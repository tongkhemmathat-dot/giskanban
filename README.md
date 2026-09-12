# JobCard Pro

ระบบใบงานแบบ Kanban สำหรับทีม System Engineer — เปิดเว็บแล้วใช้ได้ทันที ไม่ต้องล็อกอิน

![status](https://img.shields.io/badge/status-beta-blue)

> ⚠️ **Beta** — ใช้งานจริงในทีมแล้ว แต่ยังมีฟีเจอร์/หน้าจอที่ปรับเปลี่ยนได้อยู่เรื่อยๆ
> ตาม `docs/07-roadmap.md` โครงสร้างข้อมูล (`docs/03-database.md`) อาจยังเปลี่ยนได้ก่อนออกเวอร์ชันเสถียร —
> สำรองข้อมูลใน `data/` ไว้เสมอก่อนอัปเดตเวอร์ชันใหม่

---

## โปรเจกต์นี้ไว้ทำอะไร

ทีม System Engineer / NOC ต้องรับงานหลายประเภทพร้อมกันในแต่ละวัน — แจ้งเหตุขัดข้อง
(Incident), คำขอทั่วไป (Service Request), งานเปลี่ยนแปลงระบบ (Change) และงานบำรุงรักษา
ตามรอบ (PM) — ซึ่งเดิมมักกระจัดกระจายอยู่ใน Excel / แชท / อีเมล ทำให้ติดตามสถานะงาน
ใครถืออยู่ ใกล้เกินกำหนดหรือยัง ยากขึ้นเรื่อยๆ เมื่อทีมโตขึ้น

JobCard Pro รวมทุกอย่างไว้ที่เดียวเป็นบอร์ด Kanban ใบเดียว ช่วยงานหลักๆ ดังนี้:

- **ติดตามใบงานทั้งทีมแบบเห็นภาพเดียว** — ลาก-วางเปลี่ยนสถานะ รู้ทันทีว่างานไหนค้าง/ใกล้เกินกำหนด
- **คุม SLA ให้อัตโนมัติ** ตามความสำคัญของงาน โดยไม่ต้องมีใครมานั่งจับเวลาเอง
- **แตกงานเป็นขั้นตอนย่อย** พร้อมแม่แบบสำเร็จรูปสำหรับงานที่ทำซ้ำบ่อย (เช่นขั้นตอน PM มาตรฐาน)
- **ให้หัวหน้าทีมเห็นภาพรวม** — ใครถืองานเยอะ งานไหนเสี่ยงเกินกำหนด ผ่าน Dashboard เดียว
- **รวมนัดหมาย/ประชุมจากปฏิทิน Outlook ของแต่ละคน** เข้ากับงานในระบบ ไม่ต้องสลับไปมา
- **ไม่ต้องตั้งค่าระบบล็อกอิน/สิทธิ์ผู้ใช้ใดๆ** — ใช้ได้ทันทีในเครือข่ายองค์กร เหมาะกับทีมขนาด 5–15 คนที่ไว้ใจกันอยู่แล้ว

---

## ฟีเจอร์หลัก

- 📋 **Kanban board** 6 คอลัมน์ ลาก-วางได้ + เลือกหลายใบ ย้าย/มอบหมายทีเดียว
- ✍️ **ระบุผู้สร้าง** ทุกใบงาน — เลือกครั้งแรกจำไว้ให้ (`localStorage`) ไม่ต้องเลือกซ้ำ
- ✅ **ขั้นตอนย่อย (Subtasks)** — วางหลายบรรทัดพร้อมกัน + แม่แบบสำเร็จรูป
- ⏰ **SLA อัตโนมัติ** ตามระดับความสำคัญ + พักนับเวลาระหว่างรอผู้ให้บริการภายนอก
- 🔁 **ใบงานประจำ (Recurring)** สำหรับงาน PM — ระบบสร้างการ์ดให้อัตโนมัติตามกำหนด
- 📅 **ปฏิทินทีม** — sync ปฏิทิน Outlook (.ics) ของแต่ละคน มุมมองรายสัปดาห์ + สรุปงาน/ชั่วโมงรายคน
- 🔎 **กรองด่วน** ของฉัน / วิกฤต / เกินกำหนด / ค้างงาน
- 📊 **Dashboard** ภาระงานรายคน / งานที่แต่ละคนสร้าง / งานเสี่ยง / ภาพรวมทีมสำหรับหัวหน้า
- 🔍 ค้นหาจาก ชื่องาน / site / device / code / ผู้สร้าง
- 📎 แนบไฟล์ · 💬 ความคิดเห็น · ⏱ บันทึกเวลาทำงาน · 📧 อีเมลสรุปงานใกล้/เกินกำหนดรายวัน

---

## ติดตั้งและรัน

```bash
git clone <repo> && cd jobcard-pro
cp .env.example .env
npm install
npm run migrate && npm run seed
npm run dev
# เปิด http://localhost:3000
```

### รันด้วย Docker (ขึ้นระบบจริง)

```bash
git clone <repo> && cd jobcard-pro
cp .env.example .env && nano .env      # ตั้ง DOMAIN + TEAM_PASSWORD_HASH (ดูวิธีสร้าง hash ด้านล่าง)
docker compose up -d --build
docker compose exec app node server/db/seed.js   # ครั้งแรกเท่านั้น — migrate รันอัตโนมัติตอน start
docker compose logs -f app
```

สร้าง hash รหัสผ่านสำหรับ `TEAM_PASSWORD_HASH`:

```bash
docker run --rm caddy caddy hash-password --plaintext 'รหัสของทีม'
```

`docker compose exec app curl -f http://localhost:3000/api/health` เช็คได้ว่า container ตอบ 200 (ปกติ) หรือ 503 (DB มีปัญหา) — ใช้ค่าเดียวกับที่ Docker healthcheck ใช้ตัดสินสถานะ container

**ก่อนขึ้นใช้จริง** อ่าน [`docs/09-deployment.md`](./docs/09-deployment.md) ให้ครบ โดยเฉพาะ §7 (สำรองข้อมูลอัตโนมัติ) และ §8 (checklist ก่อน production) — README นี้ให้แค่คำสั่งเริ่มต้น ไม่ใช่คู่มือ deploy ฉบับเต็ม

### Deploy demo บน Vercel

```bash
npm i -g vercel   # ครั้งแรกครั้งเดียว
vercel            # ล็อกอิน + เชื่อม repo นี้เป็นโปรเจกต์ใหม่ ทำตามคำถามที่ถาม
vercel --prod     # deploy ขึ้น production URL (*.vercel.app)
```

หรือเข้า [vercel.com/new](https://vercel.com/new) แล้วเลือก import repo นี้จาก GitHub ก็ได้เหมือนกัน — ไม่ต้องตั้งค่าอะไรเพิ่ม (`vercel.json` มีครบแล้ว)

⚠️ **นี่คือ demo เท่านั้น ไม่ใช่การ deploy จริง** — `api/index.js` ต่อกับ Turso (libSQL) แทน SQLite ไฟล์เดียวเมื่อตั้ง `TURSO_DATABASE_URL` ไว้ (ดู `server/db/connection.js`) ข้อมูลที่สร้าง/แก้จึง persist จริงข้ามทุก instance/cold start แล้ว — แต่ไฟล์แนบที่อัปโหลด (attachments) ยังเก็บใน `/tmp` ของแต่ละ instance เท่านั้น (หายเมื่อ cold start) และยังต้องพึ่ง external service (Turso) เพิ่มจากสถาปัตยกรรมที่ตั้งใจไว้ (SQLite ไฟล์เดียว ไม่มี dependency ภายนอก) สำหรับใช้งานจริงให้ใช้ Docker Compose ด้านบน (`docs/09-deployment.md`) ซึ่งเป็นสถาปัตยกรรมที่ตั้งใจไว้จริงๆ และไม่ต้องพึ่ง service ภายนอกเลย

---

## โครงสร้างข้อมูล (ย่อ)

```text
members ─┬─< cards >─┬─< subtasks
         │           ├─< comments
         │           ├─< attachments
         │           ├─< time_logs
         │           └─< card_assignees
lists ───┘
```

---

## ⚠️ ความปลอดภัย

ระบบนี้ **ไม่มีการยืนยันตัวตน** โดยเจตนา — ใครเข้าถึง URL ได้ก็ใช้งานได้
ก่อนขึ้นใช้จริงต้องทำอย่างน้อย 1 ข้อ:

1. เปิดใช้เฉพาะใน LAN / VPN (ไม่ map port ออกอินเทอร์เน็ต)
2. เปิด Basic Auth ที่ Caddy — ดู `docs/09-deployment.md`
3. จำกัด IP ต้นทางที่ reverse proxy

---

## เอกสาร

ดูทั้งหมดใน [`docs/`](./docs) — เริ่มที่ [`docs/07-roadmap.md`](./docs/07-roadmap.md)

## License

Internal use only.