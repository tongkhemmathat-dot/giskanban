import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

describe('Reports API', () => {
  const getDb = useTestDb();

  it('R1: GET /reports/summary returns sane counts consistent with the seed data', async () => {
    const res = await request(app).get('/api/reports/summary');
    expect(res.status).toBe(200);

    const totalCards = getDb().prepare('SELECT COUNT(*) AS n FROM cards').get().n;
    expect(res.body.open).toBeGreaterThanOrEqual(0);
    expect(res.body.open).toBeLessThanOrEqual(totalCards);
    expect(res.body.doneThisWeek).toBeGreaterThanOrEqual(0);
    expect(res.body.overdue).toBeGreaterThan(0); // seed.js §4.4 seeds at least one overdue card
    expect(typeof res.body.avgCloseHours).toBe('number');
  });

  it('R2: GET /reports/by-creator sums to the total card count', async () => {
    const res = await request(app).get('/api/reports/by-creator');
    expect(res.status).toBe(200);

    const totalCards = getDb().prepare('SELECT COUNT(*) AS n FROM cards').get().n;
    const sum = res.body.reduce((acc, row) => acc + row.count, 0);
    expect(sum).toBe(totalCards);
  });

  it('R3: GET /reports/overdue never includes a card from an is_done column', async () => {
    const res = await request(app).get('/api/reports/overdue');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const doneListIds = new Set(getDb().prepare('SELECT id FROM lists WHERE is_done = 1').all().map((r) => r.id));
    for (const card of res.body) {
      expect(doneListIds.has(card.listId)).toBe(false);
      expect(['overdue', 'at_risk']).toContain(card.slaStatus);
    }
  });

  it('R4: GET /reports/workload returns one row per seeded member with non-negative counts', async () => {
    const res = await request(app).get('/api/reports/workload');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    for (const row of res.body) {
      expect(row.active).toBeGreaterThanOrEqual(0);
      expect(row.created).toBeGreaterThanOrEqual(0);
      expect(row.overdue).toBeGreaterThanOrEqual(0);
    }
  });

  it('R5: GET /reports/throughput defaults to 8 weeks, each labeled "Wxx"', async () => {
    const res = await request(app).get('/api/reports/throughput');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    for (const row of res.body) {
      expect(row.week).toMatch(/^W\d{2}$/);
      expect(row.opened).toBeGreaterThanOrEqual(0);
      expect(row.closed).toBeGreaterThanOrEqual(0);
    }
  });

  it('R6: GET /reports/throughput?weeks=2 returns exactly 2 rows', async () => {
    const res = await request(app).get('/api/reports/throughput').query({ weeks: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('R7: GET /reports/throughput?weeks=100 -> 400 VALIDATION_ERROR (max 52)', async () => {
    const res = await request(app).get('/api/reports/throughput').query({ weeks: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
