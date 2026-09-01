# 03 — ฐานข้อมูล

ไฟล์: `data/jobcard.db` — SQLite (WAL mode, foreign_keys ON)

## 1. ER Diagram (text)

```text
members ──┬──< cards.creator_id           (ผู้สร้าง — บังคับ)
          ├──< card_assignees             (ผู้รับผิดชอบ — หลายคน)
          ├──< subtasks.assignee_id       (ผู้ทำรายขั้น)
          ├──< comments.author_id
          └──< time_logs.member_id

boards ───< lists ───< cards ──┬──< subtasks
                                ├──< comments
                                ├──< attachments
                                ├──< time_logs
                                ├──< activities
                                └──< card_labels >── labels
```

## 2. Migration 001 — โครงหลัก

ไฟล์: `server/db/migrations/001_init.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _migrations (
  name     TEXT PRIMARY KEY,
  ran_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- สมาชิกทีม (ไม่มีรหัสผ่าน — ใช้เลือกเป็นผู้สร้าง/ผู้รับผิดชอบเท่านั้น)
CREATE TABLE members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  short      TEXT,                                  -- ตัวย่อบน avatar
  color      TEXT NOT NULL DEFAULT '#6366f1',
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE boards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lists (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id  INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL,                          -- backlog, todo, doing…
  position  REAL NOT NULL DEFAULT 65536,
  wip_limit INTEGER,
  is_done   INTEGER NOT NULL DEFAULT 0              -- 1 = คอลัมน์ปิดงาน
);

CREATE TABLE cards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id         INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  code            TEXT UNIQUE NOT NULL,             -- JC-000123
  title           TEXT NOT NULL,
  description     TEXT,
  position        REAL NOT NULL DEFAULT 65536,
  type            TEXT NOT NULL DEFAULT 'service_request'
                  CHECK (type IN ('incident','service_request','change','maintenance')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('critical','high','medium','low')),
  due_date        TEXT,
  sla_due_at      TEXT,                             -- server คำนวณเท่านั้น
  estimated_hours REAL,
  site            TEXT,
  customer        TEXT,
  device_ref      TEXT,
  creator_id      INTEGER NOT NULL REFERENCES members(id),   -- ★ บังคับ
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE card_assignees (
  card_id   INTEGER NOT NULL REFERENCES cards(id)   ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, member_id)
);

CREATE TABLE labels (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  color    TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE card_labels (
  card_id  INTEGER NOT NULL REFERENCES cards(id)  ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES members(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type   TEXT,
  size        INTEGER,
  uploader_id INTEGER REFERENCES members(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE time_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id   INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  hours     REAL NOT NULL CHECK (hours > 0),
  note      TEXT,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  actor_name TEXT,                                  -- เก็บชื่อดิบ ไม่ join
  action     TEXT NOT NULL,                         -- created, moved, subtask_done…
  meta_json  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cards_list      ON cards(list_id, position);
CREATE INDEX idx_cards_creator   ON cards(creator_id);
CREATE INDEX idx_cards_sla       ON cards(sla_due_at);
CREATE INDEX idx_activities_card ON activities(card_id, created_at DESC);
```

## 3. Migration 002 — ขั้นตอนย่อย + แม่แบบ

ไฟล์: `server/db/migrations/002_subtasks.sql`

```sql
CREATE TABLE subtasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  is_done     INTEGER NOT NULL DEFAULT 0,
  position    REAL    NOT NULL DEFAULT 65536,
  assignee_id INTEGER REFERENCES members(id),
  due_date    TEXT,
  note        TEXT,
  done_by     TEXT,                                 -- ชื่อคนที่กดติ๊ก
  done_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_subtasks_card ON subtasks(card_id, position);

CREATE TABLE templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  items      TEXT NOT NULL,                         -- JSON array ของชื่อขั้นตอน
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- อ่านความคืบหน้าเร็ว ไม่ต้องนับซ้ำ
CREATE VIEW card_progress AS
SELECT card_id,
       COUNT(*)                                  AS total,
       SUM(is_done)                              AS done,
       CAST(SUM(is_done) * 100.0 / COUNT(*) AS INT) AS pct
FROM subtasks
GROUP BY card_id;
```

## 4. Seed — ข้อมูลตั้งต้น

ไฟล์: `server/db/seed.js` ต้องใส่:

### 4.1 สมาชิก 5 คน

| name | short | color |
|---|---|---|
| สมชาย ก. | สช | `#6366f1` |
| ณัฐพล ว. | ณพ | `#10b981` |
| ปรียา ส. | ปย | `#f43f5e` |
| อนุชา น. | อช | `#f59e0b` |
| วีระ ท. | วร | `#0ea5e9` |

### 4.2 คอลัมน์ 6 คอลัมน์

| position | name | slug | wip_limit | is_done |
|---|---|---|---|---|
| 1 | Backlog | `backlog` | – | 0 |
| 2 | To Do | `todo` | – | 0 |
| 3 | In Progress | `doing` | 4 | 0 |
| 4 | Waiting Vendor | `waiting` | – | 0 |
| 5 | Review | `review` | – | 0 |
| 6 | Done | `done` | – | 1 |

### 4.3 แม่แบบขั้นตอน 4 ชุด

```json
{
  "upgrade": {
    "name": "อัปเกรดซอฟต์แวร์",
    "items": [
      "แจ้งผู้ใช้งาน + ขอ downtime window",
      "ตรวจ release note / compatibility",
      "ทำ backup ฐานข้อมูล + config",
      "ทำ snapshot เครื่อง (rollback point)",
      "ดาวน์โหลดตัวติดตั้ง + ตรวจ checksum",
      "หยุดบริการที่เกี่ยวข้อง",
      "ติดตั้งเวอร์ชันใหม่",
      "ตรวจสอบ license / authorize",
      "ทดสอบฟังก์ชันหลัก (smoke test)",
      "เปิดบริการ + แจ้งผู้ใช้",
      "เฝ้าระวัง 24 ชม. + สรุปผล"
    ]
  },
  "pm": {
    "name": "ตรวจเช็คอุปกรณ์ (PM)",
    "items": [
      "แจ้งเข้าพื้นที่ + ขออนุญาต",
      "ตรวจสภาพกายภาพ / ไฟสถานะ",
      "ทำความสะอาด + ตรวจพัดลม",
      "ตรวจ log & alarm ย้อนหลัง",
      "อัปเดต firmware (ถ้าจำเป็น)",
      "ทดสอบ redundancy / failover",
      "ถ่ายรูปหลังตรวจ",
      "บันทึกผลลง PM report"
    ]
  },
  "incident": {
    "name": "แก้ไขเหตุขัดข้อง (Incident)",
    "items": [
      "ยืนยันอาการ + ขอบเขตผลกระทบ",
      "แจ้งผู้ใช้งานที่กระทบ",
      "เก็บ log / evidence",
      "แก้ไขเบื้องต้น (workaround)",
      "แก้ไขถาวร",
      "ทดสอบยืนยันว่าใช้งานได้",
      "แจ้งปิดเหตุ",
      "สรุป root cause + แนวป้องกัน"
    ]
  },
  "install": {
    "name": "ติดตั้งอุปกรณ์ใหม่",
    "items": [
      "สำรวจหน้างาน + เตรียมพื้นที่",
      "เตรียมอุปกรณ์ + สาย",
      "ติดตั้ง rack / mount",
      "เดินสายไฟ + สายสัญญาณ",
      "ตั้งค่า config พื้นฐาน",
      "เชื่อมเข้าระบบ monitoring",
      "ทดสอบการใช้งาน",
      "ส่งมอบ + ทำเอกสาร"
    ]
  }
}
```

### 4.4 ใบงานตัวอย่างอย่างน้อย 10 ใบ

ต้องมีอย่างน้อย 1 ใบที่ใช้แม่แบบ `upgrade` เต็ม เช่น:

```text
JC-000130 · Upgrade ArcGIS Enterprise 12.1
  type: change · priority: high · list: To Do
  site: DC-Rama9 · customer: ฝ่าย GIS · device: GIS-APP-01
  creator: สมชาย ก. · assignee: ณัฐพล ว.
  subtasks: 11 ขั้น (ติ๊กแล้ว 3 ขั้นแรก)
```

และต้องมีใบที่ `sla_due_at` เลยกำหนดแล้ว 1 ใบ + ใกล้ครบกำหนด 2 ใบ เพื่อทดสอบ Dashboard

## 5. Query ที่ใช้บ่อย

```sql
-- การ์ดพร้อมความคืบหน้าและผู้สร้าง
SELECT c.*, m.name AS creator_name, m.color AS creator_color,
       COALESCE(p.done,0) AS sub_done, COALESCE(p.total,0) AS sub_total,
       COALESCE(p.pct,0)  AS sub_pct
FROM cards c
JOIN members m ON m.id = c.creator_id
LEFT JOIN card_progress p ON p.card_id = c.id
ORDER BY c.list_id, c.position;

-- งานเกินกำหนด
SELECT * FROM cards c
JOIN lists l ON l.id = c.list_id
WHERE l.is_done = 0 AND c.sla_due_at < datetime('now');

-- จำนวนใบงานที่แต่ละคนสร้าง
SELECT m.name, COUNT(c.id) AS created
FROM members m LEFT JOIN cards c ON c.creator_id = m.id
GROUP BY m.id ORDER BY created DESC;
```