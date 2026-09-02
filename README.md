# JobCard Pro

ระบบใบงานแบบ Kanban สำหรับทีม System Engineer — เปิดเว็บแล้วใช้ได้ทันที ไม่ต้องล็อกอิน

![status](https://img.shields.io/badge/status-in%20development-orange)

---

## ฟีเจอร์หลัก

- 📋 **Kanban board** 6 คอลัมน์ ลาก-วางได้
- ✍️ **ระบุผู้สร้าง** ทุกใบงาน (จำชื่อไว้ใน localStorage)
- ✅ **ขั้นตอนย่อย (Subtasks)** — วางหลายบรรทัดพร้อมกัน + แม่แบบสำเร็จรูป
- ⏰ **SLA อัตโนมัติ** ตามระดับความสำคัญ + เตือนงานเกินกำหนด
- 📊 **Dashboard** ภาระงานรายคน / งานที่แต่ละคนสร้าง / งานเสี่ยง
- 🔍 ค้นหาจาก ชื่องาน / site / device / code / ผู้สร้าง
- 📎 แนบไฟล์ · 💬 ความคิดเห็น · ⏱ บันทึกเวลาทำงาน

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
docker compose exec app npm run seed   # ครั้งแรกเท่านั้น — migrate รันอัตโนมัติตอน start
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

⚠️ **นี่คือ demo เท่านั้น ไม่ใช่การ deploy จริง** — Vercel Functions ไม่มี disk ถาวร ระบบจะสร้างฐานข้อมูลใหม่ (seed data ชุดเดิม) ทุกครั้งที่ instance เย็นตัวลง (cold start) ข้อมูลที่สร้าง/แก้ระหว่าง session จะหายเมื่อ cold start รอบถัดไป และถ้ามีคนเข้าพร้อมกันหลาย session อาจเห็นข้อมูลไม่ตรงกัน (คนละ instance = คนละไฟล์ฐานข้อมูล) สำหรับใช้งานจริงให้ใช้ Docker Compose ด้านบน (`docs/09-deployment.md`) ซึ่งข้อมูล persist จริง

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