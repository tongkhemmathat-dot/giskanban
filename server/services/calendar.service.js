// server/services/calendar.service.js — ปฏิทินรวมของทีม (docs/07-roadmap.md
// backlog): แต่ละสมาชิกวางลิงก์ .ics ที่ Outlook ของตัวเอง publish ไว้
// (Settings → Calendar → Shared calendars → Publish a calendar) — ไม่ต้องทำ
// OAuth/Azure AD app registration เลย. ระบบ poll ดึงลิงก์นั้นเป็นรอบแล้ว
// parse ด้วย server/utils/ics.js แคชผลไว้ให้หน้าเว็บอ่านแบบ sync เสมอ.
//
// การ sync แยกเป็นสองขั้นตอนเสมอ: (1) เรียก fetch แบบ async นอก transaction
// ใดๆ แล้ว (2) เขียนผลลงตารางด้วย db.transaction() แบบ sync สั้นๆ — เพราะ
// better-sqlite3 transaction ต้องเป็น synchronous function.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { nowSqlite, toApiDateTime } from '../utils/date.js';
import { parseIcsEvents } from '../utils/ics.js';

const WINDOW_BEFORE_DAYS = 1; // absorbs ICT-vs-UTC "today" boundary edge cases
const WINDOW_AFTER_DAYS = 14; // "team lead planning the next two weeks" horizon
const FETCH_TIMEOUT_MS = 15_000;

function eventsWindow() {
  return { windowStart: new Date(Date.now() - WINDOW_BEFORE_DAYS * 86_400_000), windowEnd: new Date(Date.now() + WINDOW_AFTER_DAYS * 86_400_000) };
}

async function fetchIcs(icsUrl) {
  const res = await fetch(icsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`ดึงลิงก์ปฏิทินไม่สำเร็จ (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

// --- Connection storage --------------------------------------------------

function upsertConnectionTxn(memberId, icsUrl) {
  const icsUrlEnc = encrypt(icsUrl);
  const existing = db.prepare('SELECT id FROM calendar_connections WHERE member_id = ?').get(memberId);
  if (existing) {
    db.prepare("UPDATE calendar_connections SET ics_url_enc = ?, status = 'active', last_sync_error = NULL WHERE id = ?").run(icsUrlEnc, existing.id);
    return existing.id;
  }
  const info = db.prepare('INSERT INTO calendar_connections (member_id, ics_url_enc) VALUES (?, ?)').run(memberId, icsUrlEnc);
  return Number(info.lastInsertRowid);
}

// Validates the member exists and the URL actually serves an .ics file
// before saving anything, then kicks a best-effort immediate sync so the
// member sees their events right away instead of waiting for the next poll
// tick (server/index.js's CALENDAR_POLL_MINUTES interval).
export async function addConnection(memberId, icsUrl) {
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(memberId);
  if (!member) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  let icsText;
  try {
    icsText = await fetchIcs(icsUrl);
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', `เข้าถึงลิงก์ปฏิทินนี้ไม่ได้: ${err.message}`, 400, [{ path: 'icsUrl', message: err.message }]);
  }
  parseIcsEvents(icsText, eventsWindow()); // throws AppError('INVALID_ICS', ...) if it isn't really an .ics file

  const connectionId = db.transaction(upsertConnectionTxn)(memberId, icsUrl);
  pollOneConnection(connectionId).catch((err) => {
    console.error('ซิงก์ปฏิทินหลังเชื่อมต่อไม่สำเร็จ:', err.message);
  });
  return getConnectionStatus(memberId);
}

export function disconnectMember(memberId) {
  const existing = db.prepare('SELECT id FROM calendar_connections WHERE member_id = ?').get(memberId);
  if (!existing) throw new AppError('NOT_FOUND', 'ยังไม่มีการเชื่อมต่อปฏิทินของสมาชิกนี้', 404);
  db.prepare('DELETE FROM calendar_connections WHERE member_id = ?').run(memberId); // cascades calendar_events
}

function getConnectionStatus(memberId) {
  const row = db
    .prepare(
      `SELECT cc.*, m.name AS member_name, m.color AS member_color
       FROM calendar_connections cc
       JOIN members m ON m.id = cc.member_id
       WHERE cc.member_id = ?`,
    )
    .get(memberId);
  return row ? toStatusApi(row) : null;
}

function toStatusApi(row) {
  return {
    memberId: row.member_id,
    memberName: row.member_name,
    memberColor: row.member_color,
    status: row.status,
    lastSyncedAt: toApiDateTime(row.last_synced_at),
    lastSyncError: row.last_sync_error,
  };
}

// For the Members page and calendar.view.js's filter chips — one row per
// connected member, never includes the .ics link itself (it's a bearer
// secret — anyone with it can read that member's calendar).
export function listConnectionStatuses() {
  const rows = db
    .prepare(
      `SELECT cc.*, m.name AS member_name, m.color AS member_color
       FROM calendar_connections cc
       JOIN members m ON m.id = cc.member_id
       ORDER BY m.name`,
    )
    .all();
  return rows.map(toStatusApi);
}

// --- Polling / sync -------------------------------------------------

async function syncConnection(connection) {
  const icsUrl = decrypt(connection.ics_url_enc);
  let icsText;
  try {
    icsText = await fetchIcs(icsUrl);
  } catch (err) {
    // 404/403 means the member unpublished the calendar or changed its
    // link — that needs them to reconnect. Anything else (timeout, 5xx from
    // Outlook) is treated as transient: keep polling, don't force a reconnect.
    if (err.status === 404 || err.status === 403) {
      db.prepare("UPDATE calendar_connections SET status = 'needs_reconnect', last_sync_error = ? WHERE id = ?").run(err.message, connection.id);
    } else {
      db.prepare('UPDATE calendar_connections SET last_sync_error = ? WHERE id = ?').run(err.message, connection.id);
      throw err;
    }
    return;
  }

  let events;
  try {
    events = parseIcsEvents(icsText, eventsWindow());
  } catch (err) {
    db.prepare("UPDATE calendar_connections SET status = 'needs_reconnect', last_sync_error = ? WHERE id = ?").run(err.message, connection.id);
    return;
  }

  db.transaction(() => {
    db.prepare('DELETE FROM calendar_events WHERE connection_id = ?').run(connection.id);
    const insert = db.prepare(
      `INSERT INTO calendar_events (connection_id, member_id, event_uid, subject, start_at, end_at, is_all_day, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ev of events) {
      insert.run(connection.id, connection.member_id, ev.uid, ev.subject, ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0, ev.location);
    }
    db.prepare("UPDATE calendar_connections SET last_synced_at = ?, last_sync_error = NULL WHERE id = ?").run(nowSqlite(), connection.id);
  })();
}

export async function pollOneConnection(connectionId) {
  const connection = db.prepare('SELECT * FROM calendar_connections WHERE id = ?').get(connectionId);
  if (!connection) return;
  await syncConnection(connection);
}

// Called once/tick by the scheduler in server/index.js (same shape as
// recurring.service.js's runDueRecurring()). Sequential, not parallel, so
// one slow/stuck feed doesn't pile up concurrent requests; one connection's
// failure never stops the rest from syncing.
export async function pollAllConnections() {
  const connections = db.prepare("SELECT * FROM calendar_connections WHERE status = 'active' ORDER BY id").all();
  let synced = 0;
  let failed = 0;
  for (const connection of connections) {
    try {
      await syncConnection(connection);
      synced += 1;
    } catch (err) {
      failed += 1;
      console.error(`ซิงก์ปฏิทินของสมาชิก #${connection.member_id} ไม่สำเร็จ:`, err.message);
    }
  }
  return { synced, failed };
}

// --- Merged read for the frontend -------------------------------------

// Pure sync SQL read (never fetches the .ics feed live) — the calendar page
// always reads the cache so it's never blocked on a slow/unreachable feed.
export function getMergedEvents(startDate, endDate) {
  const rows = db
    .prepare(
      `SELECT ce.*, m.name AS member_name, m.color AS member_color
       FROM calendar_events ce
       JOIN members m ON m.id = ce.member_id
       WHERE ce.start_at < ? AND ce.end_at > ?
       ORDER BY ce.start_at`,
    )
    .all(`${endDate} 23:59:59`, `${startDate} 00:00:00`);

  return rows.map((row) => ({
    memberId: row.member_id,
    memberName: row.member_name,
    memberColor: row.member_color,
    subject: row.subject,
    startAt: toApiDateTime(row.start_at),
    endAt: toApiDateTime(row.end_at),
    isAllDay: !!row.is_all_day,
    location: row.location,
  }));
}
