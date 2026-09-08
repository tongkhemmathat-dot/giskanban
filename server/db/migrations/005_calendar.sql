-- ปฏิทินรวมของทีม (combined team calendar) — แต่ละสมาชิกเชื่อมต่อ Outlook/M365
-- ของตัวเองผ่าน Microsoft Graph OAuth (docs/07-roadmap.md backlog), เพื่อให้
-- หัวหน้าทีมเห็นตารางงานทุกคนในหน้าเดียวแทนที่จะต้องเปิดปฏิทินทีละคน.
-- Sync เป็นแบบ polling (server/services/calendar.service.js's
-- pollAllConnections(), ticked จาก server/index.js) เพราะระบบรันในเครือข่าย
-- องค์กร ไม่มี public HTTPS endpoint รับ Graph webhook push ได้.
--
-- Token ทุกตัวเข้ารหัสด้วย AES-256-GCM ก่อนเก็บ (server/utils/crypto.js) —
-- นี่เป็นข้อมูลลับชุดแรกในระบบนี้ที่เข้ารหัสจริง (ก่อนหน้านี้ไม่มี secret ใด
-- เก็บอยู่ใน DB เลย).
CREATE TABLE calendar_connections (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id               INTEGER NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL DEFAULT 'microsoft' CHECK (provider IN ('microsoft')),
  account_email           TEXT NOT NULL,             -- แสดงผลในหน้า Members เท่านั้น ไม่ใช่ตัวระบุการล็อกอิน
  access_token_enc        TEXT NOT NULL,             -- AES-256-GCM: iv:authTag:ciphertext (base64, คั่นด้วย ':')
  refresh_token_enc       TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,             -- UTC 'YYYY-MM-DD HH:MM:SS'
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect')),
  last_synced_at          TEXT,
  last_sync_error         TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_connections_status ON calendar_connections(status);

-- แคชอีเวนต์ที่ดึงมาจาก Graph — wipe-and-reinsert ต่อ connection ทุกรอบ poll
-- (ช่วงวันนี้ -1 วัน ถึง +14 วัน) ไม่ทำ incremental diff/delta query เพราะเกิน
-- ความจำเป็นสำหรับทีมขนาด 5-15 คน — อีเวนต์ที่ถูกยกเลิก/ย้ายจะหายไปเองเพราะ
-- ไม่ถูก insert ซ้ำในรอบถัดไป
CREATE TABLE calendar_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id  INTEGER NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  member_id      INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  graph_event_id TEXT NOT NULL,
  subject        TEXT NOT NULL,
  start_at       TEXT NOT NULL,                      -- UTC 'YYYY-MM-DD HH:MM:SS'
  end_at         TEXT NOT NULL,
  is_all_day     INTEGER NOT NULL DEFAULT 0,
  location       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_events_range ON calendar_events(member_id, start_at, end_at);
