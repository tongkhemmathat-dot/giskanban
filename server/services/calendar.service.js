// server/services/calendar.service.js — ปฏิทินรวมของทีม (docs/07-roadmap.md
// backlog): แต่ละสมาชิกเชื่อมต่อ Outlook/M365 ของตัวเองผ่าน Microsoft Graph
// OAuth (authorization-code flow), ระบบ poll ดึงอีเวนต์เป็นรอบแล้วแคชไว้ใน
// `calendar_events` ให้หน้าเว็บอ่านแบบ sync เสมอ (ไม่รอ Graph สดตอนโหลดหน้า).
//
// ไม่ใช้ SDK ใดๆ (เช่น @azure/msal-node) — Microsoft's OAuth/Graph เป็น REST
// ธรรมดา เรียกด้วย `fetch` builtin ของ Node 20 ตรงๆ ได้ ตรงกับปรัชญาโปรเจกต์
// นี้ที่ไม่เพิ่ม dependency โดยไม่จำเป็น (raw SQL, ไม่มี ORM).
//
// การ sync แยกเป็นสองขั้นตอนเสมอ: (1) เรียก Graph ผ่าน `fetch` แบบ async
// นอก transaction ใดๆ แล้ว (2) เขียนผลลงตารางด้วย db.transaction() แบบ sync
// สั้นๆ — ต่างจาก recurring.service.js ที่ทำทุกอย่างในทรานแซคชันเดียวได้เพราะ
// เป็น sync ล้วนๆ, ที่นี่ทำแบบนั้นไม่ได้เพราะ better-sqlite3 transaction ต้อง
// เป็น synchronous function.
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { signState, verifyState } from '../utils/oauthState.js';
import { nowSqlite, toApiDateTime } from '../utils/date.js';
import { parseAsUtc } from '../utils/sla.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access Calendars.Read User.Read';
const EXPIRY_SKEW_MS = 2 * 60 * 1000; // refresh 2 min before actual expiry
const WINDOW_BEFORE_DAYS = 1; // absorbs ICT-vs-UTC "today" boundary edge cases
const WINDOW_AFTER_DAYS = 14; // "team lead planning the next two weeks" horizon

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ไม่ได้ตั้งค่า`);
  return value;
}

function redirectUri() {
  return `${requireEnv('PUBLIC_BASE_URL')}/api/calendar/callback`;
}

function authorityUrl(path) {
  return `https://login.microsoftonline.com/${requireEnv('MS_TENANT_ID')}/oauth2/v2.0/${path}`;
}

function toSqlite(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// --- OAuth: authorize URL ---------------------------------------------

export function buildAuthorizationUrl(memberId) {
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(memberId);
  if (!member) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  const params = new URLSearchParams({
    client_id: requireEnv('MS_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPE,
    state: signState(memberId),
  });
  return `${authorityUrl('authorize')}?${params.toString()}`;
}

// --- OAuth: token endpoint (authorization_code / refresh_token) --------

async function tokenRequest(extraParams) {
  const body = new URLSearchParams({
    client_id: requireEnv('MS_CLIENT_ID'),
    client_secret: requireEnv('MS_CLIENT_SECRET'),
    scope: SCOPE,
    ...extraParams,
  });

  const res = await fetch(authorityUrl('token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'แลกเปลี่ยน token กับ Microsoft ไม่สำเร็จ');
    err.graphError = data.error;
    throw err;
  }
  return data; // { access_token, refresh_token, expires_in, ... }
}

function exchangeCodeForTokens(code) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
}

function refreshTokens(refreshToken) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function fetchGraphMe(accessToken) {
  const res = await fetch(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('ดึงข้อมูลบัญชี Microsoft ไม่สำเร็จ');
  const data = await res.json();
  return data.mail || data.userPrincipalName || '(ไม่ทราบอีเมล)';
}

// --- Connection storage --------------------------------------------------

function upsertConnectionTxn(memberId, { accountEmail, accessToken, refreshToken, expiresIn }) {
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(memberId);
  if (!member) throw new AppError('NOT_FOUND', 'ไม่พบสมาชิกนี้', 404);

  const accessTokenEnc = encrypt(accessToken);
  const refreshTokenEnc = encrypt(refreshToken);
  const expiresAt = toSqlite(new Date(Date.now() + expiresIn * 1000));

  const existing = db.prepare('SELECT id FROM calendar_connections WHERE member_id = ?').get(memberId);
  if (existing) {
    db.prepare(
      `UPDATE calendar_connections
       SET account_email = ?, access_token_enc = ?, refresh_token_enc = ?, access_token_expires_at = ?,
           status = 'active', last_sync_error = NULL
       WHERE id = ?`,
    ).run(accountEmail, accessTokenEnc, refreshTokenEnc, expiresAt, existing.id);
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO calendar_connections (member_id, account_email, access_token_enc, refresh_token_enc, access_token_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(memberId, accountEmail, accessTokenEnc, refreshTokenEnc, expiresAt);
  return Number(info.lastInsertRowid);
}

// Called by routes/calendar.routes.js's GET /callback. Verifies `state`
// (CSRF protection — see utils/oauthState.js), exchanges `code` for tokens,
// stores the connection, then kicks a best-effort immediate sync so the
// member sees their events right away instead of waiting for the next poll
// tick (server/index.js's CALENDAR_POLL_MINUTES interval).
export async function handleOAuthCallback(code, state) {
  const memberId = verifyState(state);
  if (!code) throw new AppError('OAUTH_DENIED', 'การเชื่อมต่อถูกยกเลิกหรือไม่สำเร็จ', 400);

  const tokens = await exchangeCodeForTokens(code);
  const accountEmail = await fetchGraphMe(tokens.access_token);

  const connectionId = db.transaction(upsertConnectionTxn)(memberId, {
    accountEmail,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });

  pollOneConnection(connectionId).catch((err) => {
    console.error('ซิงก์ปฏิทินหลังเชื่อมต่อไม่สำเร็จ:', err.message);
  });

  return { memberId, accountEmail };
}

export function disconnectMember(memberId) {
  const existing = db.prepare('SELECT id FROM calendar_connections WHERE member_id = ?').get(memberId);
  if (!existing) throw new AppError('NOT_FOUND', 'ยังไม่มีการเชื่อมต่อปฏิทินของสมาชิกนี้', 404);
  db.prepare('DELETE FROM calendar_connections WHERE member_id = ?').run(memberId); // cascades calendar_events
}

function toStatusApi(row) {
  return {
    memberId: row.member_id,
    memberName: row.member_name,
    memberColor: row.member_color,
    accountEmail: row.account_email,
    status: row.status,
    lastSyncedAt: toApiDateTime(row.last_synced_at),
    lastSyncError: row.last_sync_error,
  };
}

// For the Members page and calendar.view.js's filter chips — one row per
// connected member (so a member with zero events this week still gets a
// chip), never includes tokens.
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

// --- Token lifecycle -------------------------------------------------

// Pure/testable: true when `expiresAtSqlite` is at or within EXPIRY_SKEW_MS
// of `now`. Exported for tests/unit/calendar-token.test.js.
export function isTokenExpiring(expiresAtSqlite, now = new Date()) {
  return parseAsUtc(expiresAtSqlite).getTime() - now.getTime() <= EXPIRY_SKEW_MS;
}

// Returns a usable plaintext access token for `connection`, refreshing (and
// persisting the refresh) first if the current one is expiring. Throws with
// `.needsReconnect = true` when Microsoft reports the refresh token itself
// is no longer valid (revoked, password changed, etc.) — the caller marks
// the connection status='needs_reconnect' instead of retrying forever.
async function ensureFreshAccessToken(connection) {
  if (!isTokenExpiring(connection.access_token_expires_at)) {
    return decrypt(connection.access_token_enc);
  }

  const currentRefreshToken = decrypt(connection.refresh_token_enc);
  let tokens;
  try {
    tokens = await refreshTokens(currentRefreshToken);
  } catch (err) {
    if (err.graphError === 'invalid_grant') {
      const reconnectErr = new Error('การเชื่อมต่อหมดอายุ กรุณาเชื่อมต่อ Outlook ใหม่');
      reconnectErr.needsReconnect = true;
      throw reconnectErr;
    }
    throw err;
  }

  // Microsoft doesn't always rotate the refresh token on every refresh call
  // — keep the existing one when a new one isn't returned.
  const nextRefreshToken = tokens.refresh_token || currentRefreshToken;
  const expiresAt = toSqlite(new Date(Date.now() + tokens.expires_in * 1000));
  db.prepare(
    `UPDATE calendar_connections
     SET access_token_enc = ?, refresh_token_enc = ?, access_token_expires_at = ?
     WHERE id = ?`,
  ).run(encrypt(tokens.access_token), encrypt(nextRefreshToken), expiresAt, connection.id);

  return tokens.access_token;
}

// --- Graph calendarview -------------------------------------------------

function eventsWindow() {
  const start = new Date(Date.now() - WINDOW_BEFORE_DAYS * 86_400_000);
  const end = new Date(Date.now() + WINDOW_AFTER_DAYS * 86_400_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// Graph returns e.g. "2026-09-08T10:00:00.0000000" (no offset) when asked
// for Prefer: outlook.timezone="UTC" — that's already the UTC-naive
// 'YYYY-MM-DD HH:MM:SS' shape every other datetime column in this DB uses.
function graphDateTimeToSqlite(dateTimeStr) {
  if (!dateTimeStr) return null;
  return dateTimeStr.replace('T', ' ').slice(0, 19);
}

async function fetchCalendarView(accessToken, startIso, endIso) {
  const params = new URLSearchParams({ startDateTime: startIso, endDateTime: endIso, $top: '100', $orderby: 'start/dateTime' });
  const res = await fetch(`${GRAPH_BASE}/me/calendarview?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Graph calendarview ล้มเหลว (HTTP ${res.status})`);
  }
  const data = await res.json();
  return (data.value || []).map((ev) => ({
    id: ev.id,
    subject: ev.subject || '(ไม่มีหัวข้อ)',
    startAt: graphDateTimeToSqlite(ev.start?.dateTime),
    endAt: graphDateTimeToSqlite(ev.end?.dateTime),
    isAllDay: !!ev.isAllDay,
    location: ev.location?.displayName || null,
  }));
}

// --- Polling / sync -------------------------------------------------

async function syncConnection(connection) {
  let accessToken;
  try {
    accessToken = await ensureFreshAccessToken(connection);
  } catch (err) {
    if (err.needsReconnect) {
      db.prepare("UPDATE calendar_connections SET status = 'needs_reconnect', last_sync_error = ? WHERE id = ?").run(err.message, connection.id);
      return;
    }
    db.prepare('UPDATE calendar_connections SET last_sync_error = ? WHERE id = ?').run(err.message, connection.id);
    throw err;
  }

  const { startIso, endIso } = eventsWindow();
  let events;
  try {
    events = await fetchCalendarView(accessToken, startIso, endIso);
  } catch (err) {
    db.prepare('UPDATE calendar_connections SET last_sync_error = ? WHERE id = ?').run(err.message, connection.id);
    throw err;
  }

  db.transaction(() => {
    db.prepare('DELETE FROM calendar_events WHERE connection_id = ?').run(connection.id);
    const insert = db.prepare(
      `INSERT INTO calendar_events (connection_id, member_id, graph_event_id, subject, start_at, end_at, is_all_day, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ev of events) {
      insert.run(connection.id, connection.member_id, ev.id, ev.subject, ev.startAt, ev.endAt, ev.isAllDay ? 1 : 0, ev.location);
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
// recurring.service.js's runDueRecurring()). Sequential, not parallel, to
// avoid tripping Graph's per-app throttling for a 5-15 person team; one
// connection's failure (e.g. an expired refresh token) never stops the rest.
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

// Pure sync SQL read (never calls Graph) — the calendar page always reads
// the cache so it's never blocked on live Graph latency.
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
