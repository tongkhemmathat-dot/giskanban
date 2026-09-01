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

### รันด้วย Docker

```bash
docker compose up -d --build
```

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