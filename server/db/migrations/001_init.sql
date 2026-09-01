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
  project_code    TEXT,                             -- รูปแบบ E<ปี 2 หลัก>-<เลข 4 หลัก> เช่น E26-1234 (ไม่บังคับ, validate ที่ zod)
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
