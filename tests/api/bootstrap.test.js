import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

describe('Bootstrap API', () => {
  useTestDb();

  it('GET /api/bootstrap returns board+lists+cards+members+labels+templates in one request', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.board).toMatchObject({ name: 'NOC Operations' });
    expect(res.body.lists).toHaveLength(6);
    expect(res.body.members).toHaveLength(5);
    expect(Array.isArray(res.body.labels)).toBe(true);
    expect(res.body.templates).toHaveLength(4);
    expect(res.body.cards.length).toBeGreaterThanOrEqual(10);

    const arcgis = res.body.cards.find((c) => c.title.includes('ArcGIS'));
    expect(arcgis).toBeTruthy();
    expect(arcgis.progress).toEqual({ done: 3, total: 11, pct: 27 });
    expect(arcgis.creator.name).toBe('สมชาย ก.');
    expect(arcgis.counts).toEqual({ comments: 0, attachments: 0 });
  });
});
