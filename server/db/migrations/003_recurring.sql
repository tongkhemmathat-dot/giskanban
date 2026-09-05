-- ใบงานประจำ (recurring) สำหรับงาน PM (docs/07-roadmap.md backlog). One row =
-- one schedule; the scheduler in server/index.js creates a real card from it
-- via card.service.js's createCard() whenever next_run_at is due, then
-- reschedules that same row -- no separate "occurrences" table needed.
CREATE TABLE recurring_cards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,                     -- ชื่อกฎ เช่น "PM เราท์เตอร์ชั้น 5 รายเดือน"
  list_id       INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,                     -- ชื่อใบงานที่จะสร้างทุกรอบ
  description   TEXT,
  type          TEXT NOT NULL DEFAULT 'maintenance'
                CHECK (type IN ('incident','service_request','change','maintenance')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('critical','high','medium','low')),
  site          TEXT,
  customer      TEXT,
  device_ref    TEXT,
  project_code  TEXT,
  template_slug TEXT REFERENCES templates(slug),
  creator_id    INTEGER NOT NULL REFERENCES members(id),
  assignee_id   INTEGER REFERENCES members(id),
  frequency     TEXT NOT NULL CHECK (frequency IN ('weekly','monthly')),
  day_of_week   INTEGER,                           -- 0=Sun..6=Sat, ใช้เมื่อ frequency='weekly'
  day_of_month  INTEGER,                           -- 1-28 เท่านั้น (หลีกเลี่ยงปัญหาเดือนสั้น), ใช้เมื่อ frequency='monthly'
  is_active     INTEGER NOT NULL DEFAULT 1,
  next_run_at   TEXT NOT NULL,
  last_run_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recurring_due ON recurring_cards(is_active, next_run_at);
