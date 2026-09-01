# 08 — การทดสอบ

## 1. ตั้งค่า

```bash
npm i -D vitest supertest
```

```json
// package.json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage"
}
```

ใช้ DB แยกสำหรับเทสต์: `DB_PATH=:memory:` หรือ `data/test.db` (ลบทิ้งทุกครั้งใน `beforeEach`)

## 2. โครงไฟล์เทสต์

```text
tests/
├── setup.js               # สร้าง db ใหม่ + migrate + seed ขั้นต่ำ
├── unit/
│   ├── sla.test.js
│   ├── code.test.js
│   ├── position.test.js
│   └── subtask-split.test.js
└── api/
    ├── cards.test.js
    ├── subtasks.test.js
    ├── members.test.js
    └── reports.test.js
```

## 3. Test Cases — Utils

| # | ฟังก์ชัน | Input | คาดหวัง |
|---|---|---|---|
| U1 | `calcSlaDueAt` | `critical`, `2026-09-01T10:00` | `2026-09-01T14:00` |
| U2 | `calcSlaDueAt` | `low`, `2026-09-01T10:00` | `2026-09-08T10:00` |
| U3 | `nextCardCode` | ตารางว่าง | `JC-000001` |
| U4 | `nextCardCode` | มี `JC-000130` | `JC-000131` |
| U5 | `midPosition` | `(null, null)` | `65536` |
| U6 | `midPosition` | `(100, 200)` | `150` |
| U7 | `midPosition` | `(100, null)` | `65636` |
| U8 | `splitTitles` | `'1. ทำ backup'` | `['ทำ backup']` |
| U9 | `splitTitles` | `'- ทดสอบ\n\n• สรุป'` | `['ทดสอบ','สรุป']` |
| U10 | `splitTitles` | `'ArcGIS 12.1 ver 2.0'` | คงข้อความเดิมทั้งหมด |

## 4. Test Cases — Cards API

| # | สถานการณ์ | คาดหวัง |
|---|---|---|
| C1 | POST ครบทุกฟิลด์ | 201 + มี `code` รูปแบบ `JC-\d{6}` |
| C2 | POST ไม่มี `creatorName` | 400 `VALIDATION_ERROR` |
| C3 | POST `creatorName` = ชื่อใหม่ | สร้าง member ใหม่ + ผูก `creator_id` |
| C4 | POST ไม่ส่ง `assigneeNames` | `assignees` = `[creator]` |
| C5 | POST พร้อม `subtaskTitles` 3 บรรทัด | `progress.total = 3` |
| C6 | POST พร้อม `templateSlug: 'upgrade'` | `progress.total = 11` |
| C7 | POST ส่ง `slaDueAt` มาเอง | ถูกละเว้น — ใช้ค่าที่ server คำนวณ |
| C8 | PATCH เปลี่ยน priority `low → critical` | `slaDueAt` = `created_at + 4h` |
| C9 | PATCH move ไปคอลัมน์ `is_done` | `completed_at` ไม่เป็น null |
| C10 | PATCH move ออกจาก `is_done` | `completed_at` = null |
| C11 | DELETE card | subtasks/comments/attachments หายตาม |
| C12 | GET `?q=ArcGIS` | เจอใบงานที่ title มีคำนี้ |
| C13 | GET `?slaStatus=overdue` | คืนเฉพาะที่เกินกำหนดและยังไม่ปิด |

## 5. Test Cases — Subtasks API ★

| # | สถานการณ์ | คาดหวัง |
|---|---|---|
| S1 | POST `titles: ['1. ทำ backup','- ทดสอบ','','3) แจ้งผล']` | 3 แถว ไม่มี prefix |
| S2 | POST `titles: []` | 400 |
| S3 | POST 150 บรรทัด | เก็บสูงสุด 100 |
| S4 | Toggle ครั้งแรก | `is_done=1`, `done_by` = actorName, `done_at` ไม่ null |
| S5 | Toggle ซ้ำ | `is_done=0`, `done_by`/`done_at` = null |
| S6 | Toggle ขั้นแรกขณะการ์ดอยู่ `todo` | การ์ดย้ายไป `doing` + `movedTo.reason = first_subtask_done` |
| S7 | Toggle ขั้นแรกขณะการ์ดอยู่ `review` | **ไม่ย้าย** |
| S8 | Toggle จนครบทุกขั้น | `pct=100` + `reason = all_done_suggest_review` แต่ `list_id` ไม่เปลี่ยน |
| S9 | Reorder `[3,1,2]` | GET กลับมาเรียงตามลำดับนั้น |
| S10 | Apply template กับการ์ดที่มี 2 ขั้น | รวมเป็น 13 ขั้น (ต่อท้าย) |
| S11 | Apply template slug ไม่มีจริง | 404 |
| S12 | DELETE subtask | `progress.total` ลดลง 1 |
| S13 | PATCH assignee เป็นคนที่ไม่ใช่ผู้รับผิดชอบใบงาน | สำเร็จ (อนุญาต) |
| S14 | ลบ card | subtasks หายหมด |

## 6. Test Cases — Members / Reports

| # | สถานการณ์ | คาดหวัง |
|---|---|---|
| M1 | POST ชื่อใหม่ | 201 + `short` = 2 ตัวแรก + มีสี |
| M2 | POST ชื่อซ้ำ | 200 คืนตัวเดิม ไม่สร้างซ้ำ |
| M3 | ลบ member ที่เป็นผู้สร้างใบงาน | 409 `CONFLICT` |
| R1 | `/reports/summary` | `open + doneThisWeek` สอดคล้องกับข้อมูล seed |
| R2 | `/reports/by-creator` | ผลรวม = จำนวนการ์ดทั้งหมด |
| R3 | `/reports/overdue` | ไม่มีการ์ดจากคอลัมน์ `is_done` ปนมา |

## 7. ทดสอบด้วยมือ (Smoke Test) ก่อน deploy

1. เปิดเว็บ → เห็นบอร์ดทันที ไม่มีหน้า login
2. เลือกชื่อในช่อง "ฉันคือ" → รีเฟรช → ชื่อยังอยู่
3. สร้างใบงานโดยไม่เลือกผู้สร้าง → ระบบเตือน
4. สร้างใบงาน `Upgrade ArcGIS 12.1` พร้อมวาง 3 บรรทัด `1. ทำ backup / 2. ติดตั้ง / 3. ทดสอบ` → ได้ 3 ขั้นตอน
5. เปิดการ์ด → เลือกแม่แบบ "อัปเกรดซอฟต์แวร์" → ขั้นตอนเพิ่มต่อท้าย
6. ติ๊กขั้นแรก → การ์ดย้ายไป In Progress + toast
7. ติ๊กครบทุกขั้น → toast ถามย้าย Review → กดแล้วย้ายจริง
8. ลากขั้นตอนสลับลำดับ → รีเฟรช → ลำดับยังอยู่
9. ลากการ์ดข้ามคอลัมน์ → รีเฟรช → อยู่ที่เดิมที่ลากไป
10. ค้นหา `ArcGIS` → เจอ · ค้นหาชื่อผู้สร้าง → เจอ
11. เปิด Dashboard → ตัวเลข KPI ตรงกับที่เห็นบนบอร์ด
12. เปิดบนมือถือ → ใช้งานได้ ไม่มี layout พัง

## 8. เป้าหมาย Coverage

| ส่วน | ขั้นต่ำ |
|---|---|
| `utils/` | 90% |
| `services/` | 80% |
| `routes/` | 70% |
| รวม | 75% |