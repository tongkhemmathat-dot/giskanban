import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';
import { __setTestDb } from '../../server/db/connection.js';

describe('Health endpoint (docs/07-roadmap.md 6.5)', () => {
  useTestDb();

  it('H1: GET /api/health -> 200 when the DB is connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: 'connected', version: '1.0.0' });
    expect(typeof res.body.uptime).toBe('number');
  });

  it('H2: GET /api/health -> 503 when the DB is unreachable, so Docker\'s healthcheck can detect it', async () => {
    __setTestDb({
      prepare: () => {
        throw new Error('simulated db failure');
      },
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, db: 'error' });
  });
});
