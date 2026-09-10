import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';
import { encrypt, decrypt } from '../../server/utils/crypto.js';
import { pollOneConnection, pollAllConnections } from '../../server/services/calendar.service.js';

const ICS_URL = 'https://outlook.office365.com/owa/calendar/abc123/calendar.ics';

function icsResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => ({}) };
}

function icsWithEvent({ uid = 'evt-1', subject = 'ประชุมทีม', start = '20260910T100000Z', end = '20260910T110000Z' } = {}) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${subject}`, `DTSTART:${start}`, `DTEND:${end}`, 'END:VEVENT', 'END:VCALENDAR'].join(
    '\n',
  );
}

describe('Calendar sync API (.ics feeds)', () => {
  const getDb = useTestDb();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function memberId(name = 'สมชาย ก.') {
    return (await getDb().get('SELECT id FROM members WHERE name = ?', [name])).id;
  }

  async function insertConnection({ member, icsUrl = ICS_URL, status = 'active' }) {
    const info = await getDb().run(`INSERT INTO calendar_connections (member_id, ics_url_enc, status) VALUES (?, ?, ?)`, [member, encrypt(icsUrl), status]);
    return Number(info.lastInsertRowid);
  }

  it('CAL1: POST /connections rejects a non-https URL (VALIDATION_ERROR)', async () => {
    const res = await request(app).post('/api/calendar/connections').send({ memberId: await memberId(), icsUrl: 'http://insecure.example/cal.ics' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('CAL2: POST /connections for an unknown member -> 404 NOT_FOUND', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(200, icsWithEvent())));
    const res = await request(app).post('/api/calendar/connections').send({ memberId: 999999, icsUrl: ICS_URL });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('CAL3: POST /connections rejects a URL that does not serve an .ics file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(200, '<html>not a calendar</html>')));
    const res = await request(app).post('/api/calendar/connections').send({ memberId: await memberId(), icsUrl: ICS_URL });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ICS');
  });

  it('CAL4: POST /connections rejects a URL that fails to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(404, '')));
    const res = await request(app).post('/api/calendar/connections').send({ memberId: await memberId(), icsUrl: ICS_URL });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('CAL5: POST /connections succeeds and stores the URL encrypted (never plaintext)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(200, icsWithEvent({ start: '20260910T100000Z', end: '20260910T110000Z' }))));
    const id = await memberId();

    const res = await request(app).post('/api/calendar/connections').send({ memberId: id, icsUrl: ICS_URL });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ memberId: id, status: 'active' });

    const row = await getDb().get('SELECT * FROM calendar_connections WHERE member_id = ?', [id]);
    expect(row).toBeTruthy();
    expect(decrypt(row.ics_url_enc)).toBe(ICS_URL);
    expect(row.ics_url_enc).not.toContain(ICS_URL); // never stored in plaintext
  });

  it('CAL6: connecting again for the same member replaces the existing connection, not a duplicate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(200, icsWithEvent())));
    const id = await memberId();
    await request(app).post('/api/calendar/connections').send({ memberId: id, icsUrl: ICS_URL });
    await request(app).post('/api/calendar/connections').send({ memberId: id, icsUrl: 'https://outlook.office365.com/owa/calendar/other/calendar.ics' });

    const rows = await getDb().all('SELECT * FROM calendar_connections WHERE member_id = ?', [id]);
    expect(rows).toHaveLength(1);
    expect(decrypt(rows[0].ics_url_enc)).toBe('https://outlook.office365.com/owa/calendar/other/calendar.ics');
  });

  it('CAL7: pollOneConnection caches parsed events with the correct fields', async () => {
    const id = await memberId();
    const connectionId = await insertConnection({ member: id });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => icsResponse(200, icsWithEvent({ subject: 'นัดลูกค้า', start: '20260911T030000Z', end: '20260911T040000Z' }))),
    );

    await pollOneConnection(connectionId);

    const events = await getDb().all('SELECT * FROM calendar_events WHERE connection_id = ?', [connectionId]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ subject: 'นัดลูกค้า', start_at: '2026-09-11 03:00:00', end_at: '2026-09-11 04:00:00' });

    const conn = await getDb().get('SELECT * FROM calendar_connections WHERE id = ?', [connectionId]);
    expect(conn.status).toBe('active');
    expect(conn.last_synced_at).toBeTruthy();
  });

  it('CAL8: a 404 from the feed marks the connection needs_reconnect', async () => {
    const id = await memberId();
    const connectionId = await insertConnection({ member: id });
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(404, '')));

    await pollOneConnection(connectionId);

    const conn = await getDb().get('SELECT * FROM calendar_connections WHERE id = ?', [connectionId]);
    expect(conn.status).toBe('needs_reconnect');

    const res = await request(app).get('/api/calendar/connections');
    expect(res.body.items.find((c) => c.memberId === id).status).toBe('needs_reconnect');
  });

  it('CAL9: a transient error (500) keeps the connection active but records the error', async () => {
    const id = await memberId();
    const connectionId = await insertConnection({ member: id });
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(500, '')));

    const result = await pollAllConnections();
    expect(result.failed).toBe(1);

    const conn = await getDb().get('SELECT * FROM calendar_connections WHERE id = ?', [connectionId]);
    expect(conn.status).toBe('active');
    expect(conn.last_sync_error).toBeTruthy();
  });

  it('CAL10: DELETE /connections/:memberId removes the connection and cascades its cached events', async () => {
    const id = await memberId();
    const connectionId = await insertConnection({ member: id });
    await getDb().run(
      `INSERT INTO calendar_events (connection_id, member_id, event_uid, subject, start_at, end_at) VALUES (?, ?, 'e1', 'x', '2026-09-10 10:00:00', '2026-09-10 11:00:00')`,
      [connectionId, id],
    );

    const res = await request(app).delete(`/api/calendar/connections/${id}`);
    expect(res.status).toBe(204);
    expect(await getDb().get('SELECT * FROM calendar_connections WHERE id = ?', [connectionId])).toBeUndefined();
    expect(await getDb().all('SELECT * FROM calendar_events WHERE connection_id = ?', [connectionId])).toHaveLength(0);
  });

  it('CAL11: GET /events merges events from multiple members and filters by date range', async () => {
    const somchai = await memberId('สมชาย ก.');
    const natthaphon = await memberId('ณัฐพล ว.');
    const connA = await insertConnection({ member: somchai });
    const connB = await insertConnection({ member: natthaphon });

    const insertEvent = (...args) =>
      getDb().run(`INSERT INTO calendar_events (connection_id, member_id, event_uid, subject, start_at, end_at) VALUES (?, ?, ?, ?, ?, ?)`, args);
    await insertEvent(connA, somchai, 'e1', 'อยู่ในช่วง', '2026-09-10 09:00:00', '2026-09-10 10:00:00');
    await insertEvent(connB, natthaphon, 'e2', 'อีกงาน', '2026-09-11 09:00:00', '2026-09-11 10:00:00');
    await insertEvent(connA, somchai, 'e3', 'นอกช่วง', '2026-10-01 09:00:00', '2026-10-01 10:00:00');

    const res = await request(app).get('/api/calendar/events').query({ start: '2026-09-08', end: '2026-09-14' });
    expect(res.status).toBe(200);
    expect(res.body.items.map((e) => e.subject).sort()).toEqual(['อยู่ในช่วง', 'อีกงาน']);
    expect(res.body.items.every((e) => e.memberName && e.memberColor)).toBe(true);
  });

  it('CAL12: pollAllConnections keeps syncing other connections when one has a hard failure', async () => {
    const somchai = await memberId('สมชาย ก.');
    const natthaphon = await memberId('ณัฐพล ว.');
    const connA = await insertConnection({ member: somchai });
    const connB = await insertConnection({ member: natthaphon });

    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) return icsResponse(200, icsWithEvent({ subject: 'งานของสมชาย' }));
        return icsResponse(500, '');
      }),
    );

    const result = await pollAllConnections();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);

    expect(await getDb().all('SELECT * FROM calendar_events WHERE connection_id = ?', [connA])).toHaveLength(1);
    expect(await getDb().all('SELECT * FROM calendar_events WHERE connection_id = ?', [connB])).toHaveLength(0);
  });

  it('CAL13: POST /sync re-syncs every active connection and reports counts', async () => {
    const somchai = await memberId('สมชาย ก.');
    await insertConnection({ member: somchai });
    vi.stubGlobal('fetch', vi.fn(async () => icsResponse(200, icsWithEvent({ subject: 'ซิงก์ด้วยมือ' }))));

    const res = await request(app).post('/api/calendar/sync');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ synced: 1, failed: 0 });

    const conn = await getDb().get('SELECT * FROM calendar_connections WHERE member_id = ?', [somchai]);
    expect(conn.last_synced_at).toBeTruthy();
  });

  it('CAL14: POST /sync with no connections returns zero counts, not an error', async () => {
    const res = await request(app).post('/api/calendar/sync');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ synced: 0, failed: 0 });
  });
});
