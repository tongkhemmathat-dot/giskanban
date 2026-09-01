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
