// server/services/calendar.service.js — ปฏิทินรวมของทีม (docs/07-roadmap.md
// backlog): แต่ละสมาชิกวางลิงก์ .ics ที่ Outlook ของตัวเอง publish ไว้
// (Settings → Calendar → Shared calendars → Publish a calendar) — ไม่ต้องทำ
// OAuth/Azure AD app registration เลย. ระบบ poll ดึงลิงก์นั้นเป็นรอบแล้ว
// parse ด้วย server/utils/ics.js แคชผลไว้ให้หน้าเว็บอ่าน.
//
// การ sync แยกเป็นสองขั้นตอนเสมอ: (1) เรียก fetch แบบ async นอก transaction
// ใดๆ แล้ว (2) เขียนผลลงตารางด้วย db.transaction() สั้นๆ.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { nowSqlite, toApiDateTime } from '../utils/date.js';
import { parseIcsEvents } from '../utils/ics.js';
import { buildCsv } from '../utils/csv.js';
import { parseEventSubject } from '../utils/eventSubject.js';

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

async function upsertConnectionTxn(memberId, icsUrl) {
  const icsUrlEnc = encrypt(icsUrl);
  const existing = await db.get('SELECT id FROM calendar_connections WHERE member_id = ?', [memberId]);
  if (existing) {
    await db.run("UPDATE calendar_connections SET ics_url_enc = ?, status = 'active', last_sync_error = NULL WHERE id = ?", [icsUrlEnc, existing.id]);
    return existing.id;
  }
  const info = await db.run('INSERT INTO calendar_connections (member_id, ics_url_enc) VALUES (?, ?)', [memberId, icsUrlEnc]);
  return Number(info.lastInsertRowid);
}

// Validates the member exists and the URL actually serves an .ics file
// before saving anything, then kicks a best-effort immediate sync so the
// member sees their events right away instead of waiting for the next poll
// tick (server/index.js's CALENDAR_POLL_MINUTES interval).
export async function addConnection(memberId, icsUrl) {
  const member = await db.get('SELECT id FROM members WHERE id = ?', [memberId]);
  if (!member) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  let icsText;
  try {
    icsText = await fetchIcs(icsUrl);
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', `เข้าถึงลิงก์ปฏิทินนี้ไม่ได้: ${err.message}`, 400, [{ path: 'icsUrl', message: err.message }]);
  }
  parseIcsEvents(icsText, eventsWindow()); // throws AppError('INVALID_ICS', ...) if it isn't really an .ics file

  const connectionId = await db.transaction(upsertConnectionTxn)(memberId, icsUrl);
  // Awaited, not fire-and-forget: on Vercel's serverless runtime the function
  // can freeze right after the HTTP response is sent, killing any still-
  // pending background promise before it ever runs — a fire-and-forget sync
  // here left lastSyncedAt stuck at null forever with no error either,
  // because the fetch+DB write never got the chance to execute at all. This
  // adds the fetch+parse+write latency to the connect request itself, which
  // is the right tradeoff for a user-initiated, infrequent action — better to
  // wait a moment and show real synced events than return instantly with a
  // sync that may silently never complete.
  try {
    await pollOneConnection(connectionId);
  } catch (err) {
    console.error('ซิงก์ปฏิทินหลังเชื่อมต่อไม่สำเร็จ:', err.message);
  }
  return getConnectionStatus(memberId);
}

export async function disconnectMember(memberId) {
  const existing = await db.get('SELECT id FROM calendar_connections WHERE member_id = ?', [memberId]);
  if (!existing) throw new AppError('NOT_FOUND', 'ยังไม่มีการเชื่อมต่อปฏิทินของสมาชิกนี้', 404);
  await db.run('DELETE FROM calendar_connections WHERE member_id = ?', [memberId]); // cascades calendar_events
}

async function getConnectionStatus(memberId) {
  const row = await db.get(
    `SELECT cc.*, m.name AS member_name, m.color AS member_color
     FROM calendar_connections cc
     JOIN members m ON m.id = cc.member_id
     WHERE cc.member_id = ?`,
    [memberId],
  );
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
export async function listConnectionStatuses() {
  const rows = await db.all(
    `SELECT cc.*, m.name AS member_name, m.color AS member_color
     FROM calendar_connections cc
     JOIN members m ON m.id = cc.member_id
     ORDER BY m.name`,
    [],
  );
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
      await db.run("UPDATE calendar_connections SET status = 'needs_reconnect', last_sync_error = ? WHERE id = ?", [err.message, connection.id]);
    } else {
      await db.run('UPDATE calendar_connections SET last_sync_error = ? WHERE id = ?', [err.message, connection.id]);
      throw err;
    }
    return;
  }

  let events;
  try {
    events = parseIcsEvents(icsText, eventsWindow());
  } catch (err) {
    await db.run("UPDATE calendar_connections SET status = 'needs_reconnect', last_sync_error = ? WHERE id = ?", [err.message, connection.id]);
    return;
  }

  await db.transaction(async () => {
    await db.run('DELETE FROM calendar_events WHERE connection_id = ?', [connection.id]);
    for (const ev of events) {
      await db.run(
        `INSERT INTO calendar_events (connection_id, member_id, event_uid, subject, start_at, end_at, is_all_day, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [connection.id, connection.member_id, ev.uid, ev.subject, ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0, ev.location],
      );
    }
    await db.run("UPDATE calendar_connections SET last_synced_at = ?, last_sync_error = NULL WHERE id = ?", [nowSqlite(), connection.id]);
  })();
}

export async function pollOneConnection(connectionId) {
  const connection = await db.get('SELECT * FROM calendar_connections WHERE id = ?', [connectionId]);
  if (!connection) return;
  await syncConnection(connection);
}

// Called once/tick by the scheduler in server/index.js (same shape as
// recurring.service.js's runDueRecurring()). Sequential, not parallel, so
// one slow/stuck feed doesn't pile up concurrent requests; one connection's
// failure never stops the rest from syncing.
export async function pollAllConnections() {
  const connections = await db.all("SELECT * FROM calendar_connections WHERE status = 'active' ORDER BY id", []);
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

// Pure SQL read (never fetches the .ics feed live) — the calendar page
// always reads the cache so it's never blocked on a slow/unreachable feed.
export async function getMergedEvents(startDate, endDate) {
  const rows = await db.all(
    `SELECT ce.*, m.name AS member_name, m.color AS member_color
     FROM calendar_events ce
     JOIN members m ON m.id = ce.member_id
     WHERE ce.start_at < ? AND ce.end_at > ?
     ORDER BY ce.start_at`,
    [`${endDate} 23:59:59`, `${startDate} 00:00:00`],
  );

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

const EXPORT_CSV_HEADERS = ['สมาชิก', 'รหัสโครงการ', 'โครงการ', 'เนื้องาน', 'วันที่', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'ทั้งวัน', 'สถานที่'];

// รายงานงานของแต่ละคนจากปฏิทิน (บางงานเป็นการประชุม ไม่ได้ทำเป็นใบงานในระบบ —
// หัวหน้าต้องการเห็นภาพรวมทั้งหมด ไม่ใช่แค่ที่กลายเป็นใบงานแล้ว). เรียงตาม
// สมาชิกก่อน แล้วค่อยเรียงตามเวลาเริ่ม ภายในคนเดียวกัน — ตรงข้ามกับ
// getMergedEvents ที่เรียงตามเวลาอย่างเดียว (สำหรับมุมมองปฏิทินรวม). หัวข้อ
// อีเวนต์ถูกแยกเป็นรหัสโครงการ/โครงการ/เนื้องาน ผ่าน parseEventSubject() —
// อีเวนต์ที่ subject ไม่ตรงรูปแบบ (ส่วนใหญ่ของการประชุมทั่วไป) จะได้แค่
// เนื้องาน = subject เดิมทั้งหมด รหัสโครงการ/โครงการ เว้นว่างไว้.
export async function exportEventsCsv(startDate, endDate) {
  const events = await getMergedEvents(startDate, endDate);
  events.sort((a, b) => a.memberName.localeCompare(b.memberName, 'th') || (a.startAt || '').localeCompare(b.startAt || ''));

  const rows = events.map((e) => {
    const { projectCode, project, task } = parseEventSubject(e.subject);
    return [
      e.memberName,
      projectCode,
      project,
      task,
      (e.startAt || '').slice(0, 10),
      e.isAllDay ? '' : (e.startAt || '').slice(11, 16),
      e.isAllDay ? '' : (e.endAt || '').slice(11, 16),
      e.isAllDay ? 'ใช่' : '',
      e.location ?? '',
    ];
  });

  return '﻿' + buildCsv(EXPORT_CSV_HEADERS, rows); // UTF-8 BOM so Excel auto-detects the encoding for Thai text
}
