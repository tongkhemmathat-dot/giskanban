-- แทนที่การเชื่อมต่อ Outlook แบบ Microsoft Graph OAuth (005_calendar.sql) ด้วย
-- ลิงก์ .ics ที่แต่ละสมาชิก publish จาก Outlook เอง (Settings → Calendar →
-- Shared calendars → Publish a calendar) — ไม่ต้องตั้งค่า Azure AD app
-- registration เลย. ยังไม่เคยมีข้อมูลจริงในสองตารางนี้ (ฟีเจอร์ยังไม่ได้
-- เปิดใช้งาน) จึงดร็อปแล้วสร้างใหม่ทั้งคู่แทนการ ALTER ทีละคอลัมน์.
DROP TABLE IF EXISTS calendar_events;
DROP TABLE IF EXISTS calendar_connections;

-- ลิงก์ .ics เป็นความลับแบบ bearer token เหมือนกัน (ใครมีลิงก์ก็เห็นปฏิทิน
-- ได้) จึงยังเข้ารหัส AES-256-GCM ก่อนเก็บเหมือนเดิม (server/utils/crypto.js)
CREATE TABLE calendar_connections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  ics_url_enc     TEXT NOT NULL,             -- AES-256-GCM: iv:authTag:ciphertext (base64)
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect')),
  last_synced_at  TEXT,
  last_sync_error TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_connections_status ON calendar_connections(status);

-- แคชอีเวนต์ที่ parse มาจาก .ics — wipe-and-reinsert ต่อ connection ทุกรอบ
-- poll (วันนี้ -1 วัน ถึง +14 วัน) เหมือนเดิม, event_uid มาจาก ICS UID
-- ต่อท้ายด้วย timestamp ของ occurrence (server/utils/ics.js) เพื่อแยกแต่ละ
-- นัดที่เกิดซ้ำ (recurring) ออกจากกัน
CREATE TABLE calendar_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_uid     TEXT NOT NULL,
  subject       TEXT NOT NULL,
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  is_all_day    INTEGER NOT NULL DEFAULT 0,
  location      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_events_range ON calendar_events(member_id, start_at, end_at);
