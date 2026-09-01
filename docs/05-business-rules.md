# 05 — กฎทางธุรกิจ

## 1. รหัสใบงาน

- รูปแบบ `JC-` + เลข 6 หลัก zero-pad → `JC-000131`
- รันต่อจากเลขสูงสุดในตาราง `cards` เสมอ
- ต้องอยู่ใน transaction เดียวกับการ insert เพื่อกันชนกัน
- **ห้ามนำรหัสที่ลบไปแล้วกลับมาใช้ซ้ำ**

```js
// utils/code.js
export function nextCardCode(db) {
  const row = db.prepare(
    `SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS n FROM cards`
  ).get();
  return 'JC-' + String((row?.n ?? 0) + 1).padStart(6, '0');
}
```

## 2. SLA

| Priority | เวลาที่ต้องปิด | สี |
|---|---|---|
| `critical` | 4 ชั่วโมง | แดง `#e11d48` |
| `high` | 24 ชั่วโมง | ส้ม `#f97316` |
| `medium` | 72 ชั่วโมง | เหลือง `#fbbf24` |
| `low` | 168 ชั่วโมง (7 วัน) | เทา `#94a3b8` |

**กติกา**
1. `sla_due_at = created_at + ชั่วโมงตามตาราง` — คำนวณที่ server เท่านั้น
2. เปลี่ยน `priority` → คำนวณใหม่จาก `created_at` เดิม (ไม่ใช่เวลาปัจจุบัน)
3. การ์ดในคอลัมน์ `is_done = 1` ไม่นับ SLA อีก

**สถานะ SLA (คำนวณตอนอ่าน)**

| สถานะ | เงื่อนไข | แสดงผล |
|---|---|---|
| `done` | อยู่ในคอลัมน์ `is_done = 1` | ไม่แสดง chip |
| `overdue` | `sla_due_at < now` | 🔴 `⏰ เกินกำหนด` |
| `at_risk` | เหลือ < 25% ของเวลาทั้งหมด | 🟠 `⚠ ใกล้ครบ` |
| `ok` | นอกเหนือจากนั้น | ไม่แสดง chip |

## 3. ผู้สร้างและผู้รับผิดชอบ

1. `creator_id` **บังคับ** ทุกใบงาน แก้ไขภายหลังไม่ได้
2. ส่งชื่อที่ยังไม่มีในระบบ → สร้าง member ใหม่อัตโนมัติ (`short` = 2 ตัวแรก, สีสุ่ม)
3. ไม่ระบุผู้รับผิดชอบ → ตั้ง = ผู้สร้าง
4. ผู้รับผิดชอบมีได้หลายคน · ใครก็กด "รับงาน" / "ถอนตัว" ได้
5. ลบสมาชิกไม่ได้ถ้ายังเป็นผู้สร้างของใบงานใด — ให้ตั้ง `is_active = 0` แทน

## 4. ขั้นตอนย่อย (Subtasks) ★

### 4.1 การตัดข้อความ

รับข้อความหลายบรรทัด → แยกเป็นคนละขั้น พร้อม strip prefix:

```js
// utils/subtask.js
export const splitTitles = (input) =>
  (Array.isArray(input) ? input : String(input).split(/\r?\n/))
    .map(s => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 100);          // กันสแปม
```

| Input | Output |
|---|---|
| `1. ทำ backup` | `ทำ backup` |
| `2) ติดตั้ง` | `ติดตั้ง` |
| `- ทดสอบ` | `ทดสอบ` |
| `• สรุปผล` | `สรุปผล` |
| `` (บรรทัดว่าง) | ข้าม |
| `ArcGIS 12.1 ver 2.0` | คงเดิม (ไม่ตัดเลขกลางประโยค) |

### 4.2 การติ๊กเสร็จ

- บันทึก `done_by` = `actorName` (ชื่อที่เลือกในช่อง "ฉันคือ") และ `done_at`
- ติ๊กกลับ → เคลียร์ `done_by`, `done_at` เป็น `NULL`
- เขียน `activities` action `subtask_done` / `subtask_undone`

### 4.3 Auto-move

| เหตุการณ์ | เงื่อนไข | การกระทำ |
|---|---|---|
| ติ๊กขั้นแรกสำเร็จ | `done = 1` และการ์ดอยู่ `backlog`/`todo` | **ย้ายอัตโนมัติ** ไป `In Progress` + ตั้ง `started_at` |
| ติ๊กครบทุกขั้น | `done = total` และไม่ได้อยู่ `review`/`done` | **เสนอ** ย้ายไป Review (UI ถามก่อน) |
| ย้ายเข้าคอลัมน์ `is_done` | – | ตั้ง `completed_at = now` |
| ย้ายออกจากคอลัมน์ `is_done` | – | ล้าง `completed_at` |

### 4.4 อื่น ๆ

1. **แม่แบบ = ต่อท้าย** ไม่ลบขั้นตอนเดิม
2. **ลำดับ** ใช้ `position` แบบ float — แทรกกลาง = ค่าเฉลี่ยของเพื่อนบ้าน
3. **ผู้ทำรายขั้น** (`assignee_id`) ตั้งคนละคนกับผู้รับผิดชอบใบงานได้
4. ลบการ์ด → subtasks ถูกลบตาม (`ON DELETE CASCADE`)
5. ขั้นตอนสูงสุด 100 ข้อต่อใบงาน

## 5. ลำดับ (Position) สำหรับ Drag & Drop

```js
// utils/position.js
const GAP = 65536;
export function midPosition(prev, next) {
  if (prev == null && next == null) return GAP;
  if (prev == null) return next / 2;
  if (next == null) return prev + GAP;
  return (prev + next) / 2;
}
// ถ้าช่องว่างแคบกว่า 0.0001 → เรียก renumber ทั้งคอลัมน์ใหม่เป็น GAP, 2×GAP, …
```

## 6. WIP Limit

- ตั้งได้รายคอลัมน์ (ค่าเริ่มต้น: `In Progress` = 4)
- เกินลิมิต → **เตือนอย่างเดียว** (ตัวเลขเป็นสีแดง) ไม่บล็อกการลาก
- แสดงเป็น `5/4` บนหัวคอลัมน์

## 7. การตรวจสอบข้อมูล (Validation)

| ฟิลด์ | กฎ |
|---|---|
| `title` | 1–200 ตัวอักษร บังคับ |
| `description` | ≤ 5,000 ตัวอักษร |
| `creatorName` | 1–100 ตัวอักษร **บังคับ** |
| `type` | ต้องอยู่ใน 4 ค่าที่กำหนด |
| `priority` | ต้องอยู่ใน 4 ค่าที่กำหนด |
| `dueDate` | ISO 8601 หรือ `null` |
| `projectCode` | รูปแบบ `E` + ปี 2 หลัก + `-` + เลข 4 หลัก เช่น `E26-1234` หรือว่างได้ (ไม่บังคับ) |
| `hours` (time log) | > 0 และ ≤ 24 |
| `subtask.title` | 1–200 ตัวอักษร |
| ไฟล์แนบ | ≤ 10 MB, MIME ที่อนุญาต |

## 8. Activity Log

บันทึกทุกครั้งที่มีการเปลี่ยนแปลง

| action | meta_json |
|---|---|
| `card_created` | `{ code, listName }` |
| `card_moved` | `{ from, to }` |
| `card_updated` | `{ fields: ['priority'], before, after }` |
| `card_deleted` | `{ code, title }` |
| `assignee_added` / `assignee_removed` | `{ memberName }` |
| `subtask_added` | `{ count, titles }` |
| `subtask_done` / `subtask_undone` | `{ title }` |
| `template_applied` | `{ templateName, count }` |
| `comment_added` | `{ excerpt }` |
| `attachment_added` | `{ filename }` |
| `time_logged` | `{ hours }` |