import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';
import { encrypt, decrypt } from '../../server/utils/crypto.js';
import { signState } from '../../server/utils/oauthState.js';
import { pollOneConnection, pollAllConnections } from '../../server/services/calendar.service.js';

function jsonResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

// Dispatches a mocked `fetch` by URL so each test only needs to describe
// what Microsoft's token / /me / /me/calendarview endpoints should answer —
// mirrors real Graph shapes closely enough for calendar.service.js's parsing.
function mockGraphFetch({ token, me, calendarView } = {}) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/oauth2/v2.0/token')) {
      const params = new URLSearchParams(init.body);
      return token
        ? token(params)
        : jsonResponse(200, { access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 3600 });
    }
    if (u.includes('/me/calendarview')) {
      return calendarView ? calendarView() : jsonResponse(200, { value: [] });
    }
    if (u.endsWith('/me')) {
      return me ? me() : jsonResponse(200, { mail: 'somchai@company.local' });
    }
    throw new Error(`Unexpected fetch call to ${u}`);
  });
}

describe('Calendar sync API', () => {
  const getDb = useTestDb();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function memberId(name = 'สมชาย ก.') {
    return getDb().prepare('SELECT id FROM members WHERE name = ?').get(name).id;
  }

  function insertConnection({ member, accountEmail = 'existing@company.local', accessToken = 'old-access', refreshToken = 'old-refresh', expiresAt }) {
    const info = getDb()
      .prepare(
        `INSERT INTO calendar_connections (member_id, account_email, access_token_enc, refresh_token_enc, access_token_expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(member, accountEmail, encrypt(accessToken), encrypt(refreshToken), expiresAt);
    return Number(info.lastInsertRowid);
  }

  const FAR_FUTURE = '2099-01-01 00:00:00';
  const PAST = '2020-01-01 00:00:00';

  it('CAL1: GET /connect/:memberId redirects to Microsoft with client_id + state for a real member', async () => {
    const res = await request(app).get(`/api/calendar/connect/${memberId()}`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.hostname).toBe('login.microsoftonline.com');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  it('CAL2: GET /connect/:memberId for an unknown member -> 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/calendar/connect/999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('CAL3: GET /callback with a valid code+state creates a connection and redirects', async () => {
    vi.stubGlobal('fetch', mockGraphFetch());
    const id = memberId();
    const state = signState(id);

    const res = await request(app).get('/api/calendar/callback').query({ code: 'auth-code-123', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/#/calendar?connected=1');

    const row = getDb().prepare('SELECT * FROM calendar_connections WHERE member_id = ?').get(id);
    expect(row).toBeTruthy();
    expect(row.account_email).toBe('somchai@company.local');
    expect(row.access_token_enc).not.toBe('new-access-token'); // stored encrypted, not plaintext
    expect(row.status).toBe('active');
  });

  it('CAL4: GET /callback with a tampered state redirects with an error and creates no connection', async () => {
    vi.stubGlobal('fetch', mockGraphFetch());
    const id = memberId();
    const state = signState(id).slice(0, -1) + (signState(id).endsWith('a') ? 'b' : 'a');

    const res = await request(app).get('/api/calendar/callback').query({ code: 'auth-code-123', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/#\/calendar\?error=/);
    expect(getDb().prepare('SELECT * FROM calendar_connections WHERE member_id = ?').get(id)).toBeUndefined();
  });

  it('CAL5: GET /callback with ?error= (user declined consent) redirects with error and never calls Microsoft', async () => {
    const fetchMock = mockGraphFetch();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).get('/api/calendar/callback').query({ error: 'access_denied', error_description: 'user cancelled' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/#\/calendar\?error=/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CAL6: pollOneConnection refreshes an expiring access token and caches fetched events', async () => {
    const id = memberId();
    const connectionId = insertConnection({ member: id, expiresAt: PAST });
    vi.stubGlobal(
      'fetch',
      mockGraphFetch({
        calendarView: () =>
          jsonResponse(200, {
            value: [
              {
                id: 'evt-1',
                subject: 'ประชุมทีม',
                start: { dateTime: '2026-09-10T10:00:00.0000000' },
                end: { dateTime: '2026-09-10T11:00:00.0000000' },
                isAllDay: false,
                location: { displayName: 'ห้องประชุม A' },
              },
            ],
          }),
      }),
    );

    await pollOneConnection(connectionId);

    const events = getDb().prepare('SELECT * FROM calendar_events WHERE connection_id = ?').all(connectionId);
    expect(events).toHaveLength(1);
    expect(events[0].subject).toBe('ประชุมทีม');
    expect(events[0].start_at).toBe('2026-09-10 10:00:00');

    const conn = getDb().prepare('SELECT * FROM calendar_connections WHERE id = ?').get(connectionId);
    expect(decrypt(conn.access_token_enc)).toBe('new-access-token');
    expect(conn.status).toBe('active');
    expect(conn.last_synced_at).toBeTruthy();
  });

  it('CAL7: an invalid_grant refresh response marks the connection needs_reconnect', async () => {
    const id = memberId();
    const connectionId = insertConnection({ member: id, expiresAt: PAST });
    vi.stubGlobal(
      'fetch',
      mockGraphFetch({ token: () => jsonResponse(400, { error: 'invalid_grant', error_description: 'token revoked' }) }),
    );

    await pollOneConnection(connectionId);

    const conn = getDb().prepare('SELECT * FROM calendar_connections WHERE id = ?').get(connectionId);
    expect(conn.status).toBe('needs_reconnect');

    const res = await request(app).get('/api/calendar/connections');
    const status = res.body.items.find((c) => c.memberId === id);
    expect(status.status).toBe('needs_reconnect');
  });

  it('CAL8: DELETE /connections/:memberId removes the connection and cascades its cached events', async () => {
    const id = memberId();
    const connectionId = insertConnection({ member: id, expiresAt: FAR_FUTURE });
    getDb()
      .prepare(
        `INSERT INTO calendar_events (connection_id, member_id, graph_event_id, subject, start_at, end_at)
         VALUES (?, ?, 'evt-x', 'x', '2026-09-10 10:00:00', '2026-09-10 11:00:00')`,
      )
      .run(connectionId, id);

    const res = await request(app).delete(`/api/calendar/connections/${id}`);
    expect(res.status).toBe(204);
    expect(getDb().prepare('SELECT * FROM calendar_connections WHERE id = ?').get(connectionId)).toBeUndefined();
    expect(getDb().prepare('SELECT * FROM calendar_events WHERE connection_id = ?').all(connectionId)).toHaveLength(0);
  });

  it('CAL9: GET /events merges events from multiple members and filters by date range', async () => {
    const somchai = memberId('สมชาย ก.');
    const natthaphon = memberId('ณัฐพล ว.');
    const connA = insertConnection({ member: somchai, expiresAt: FAR_FUTURE });
    const connB = insertConnection({ member: natthaphon, expiresAt: FAR_FUTURE });

    const insertEvent = getDb().prepare(
      `INSERT INTO calendar_events (connection_id, member_id, graph_event_id, subject, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertEvent.run(connA, somchai, 'in-range', 'อยู่ในช่วง', '2026-09-10 09:00:00', '2026-09-10 10:00:00');
    insertEvent.run(connB, natthaphon, 'also-in-range', 'อีกงาน', '2026-09-11 09:00:00', '2026-09-11 10:00:00');
    insertEvent.run(connA, somchai, 'out-of-range', 'นอกช่วง', '2026-10-01 09:00:00', '2026-10-01 10:00:00');

    const res = await request(app).get('/api/calendar/events').query({ start: '2026-09-08', end: '2026-09-14' });
    expect(res.status).toBe(200);
    const subjects = res.body.items.map((e) => e.subject).sort();
    expect(subjects).toEqual(['อยู่ในช่วง', 'อีกงาน']);
    expect(res.body.items.every((e) => e.memberName && e.memberColor)).toBe(true);
  });

  it('CAL10: pollAllConnections keeps syncing other connections when one has a hard failure', async () => {
    const somchai = memberId('สมชาย ก.');
    const natthaphon = memberId('ณัฐพล ว.');
    // Both access tokens are still valid (far-future expiry), so this
    // exercises calendarview failures, not token-refresh failures — inserted
    // in this order so pollAllConnections (ORDER BY id) processes สมชาย first.
    const connA = insertConnection({ member: somchai, expiresAt: FAR_FUTURE });
    const connB = insertConnection({ member: natthaphon, expiresAt: FAR_FUTURE });

    let calendarViewCalls = 0;
    vi.stubGlobal(
      'fetch',
      mockGraphFetch({
        calendarView: () => {
          calendarViewCalls += 1;
          if (calendarViewCalls === 1) {
            return jsonResponse(200, {
              value: [
                {
                  id: 'evt-a',
                  subject: 'งานของสมชาย',
                  start: { dateTime: '2026-09-10T09:00:00.0000000' },
                  end: { dateTime: '2026-09-10T10:00:00.0000000' },
                },
              ],
            });
          }
          return { ok: false, status: 500, json: async () => ({ error: { message: 'Graph unavailable' } }) };
        },
      }),
    );

    const result = await pollAllConnections();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(calendarViewCalls).toBe(2);

    expect(getDb().prepare('SELECT * FROM calendar_events WHERE connection_id = ?').all(connA)).toHaveLength(1);
    expect(getDb().prepare('SELECT * FROM calendar_events WHERE connection_id = ?').all(connB)).toHaveLength(0);

    const connBRow = getDb().prepare('SELECT * FROM calendar_connections WHERE id = ?').get(connB);
    expect(connBRow.status).toBe('active'); // a transient Graph error doesn't force reconnect
    expect(connBRow.last_sync_error).toBeTruthy();
  });
});
