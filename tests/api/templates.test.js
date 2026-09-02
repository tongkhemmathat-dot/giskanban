import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

describe('Templates API', () => {
  useTestDb();

  it('T1: GET lists the 4 seeded templates with items already parsed', async () => {
    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    const upgrade = res.body.items.find((t) => t.slug === 'upgrade');
    expect(Array.isArray(upgrade.items)).toBe(true);
    expect(upgrade.itemCount).toBe(upgrade.items.length);
  });

  it('T2: POST creates a template with an auto-generated slug', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ name: 'แม่แบบใหม่', items: ['ขั้น 1', 'ขั้น 2'] });
    expect(res.status).toBe(201);
    expect(res.body.slug).toMatch(/^tpl-/);
    expect(res.body.items).toEqual(['ขั้น 1', 'ขั้น 2']);
  });

  it('T3: PATCH updates name/items', async () => {
    const created = await request(app)
      .post('/api/templates')
      .send({ name: 'ก่อนแก้', items: ['a'] });

    const res = await request(app)
      .patch(`/api/templates/${created.body.id}`)
      .send({ name: 'หลังแก้', items: ['a', 'b'] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('หลังแก้');
    expect(res.body.items).toEqual(['a', 'b']);
  });

  it('T4: DELETE removes it', async () => {
    const created = await request(app)
      .post('/api/templates')
      .send({ name: 'จะถูกลบ', items: ['a'] });

    const del = await request(app).delete(`/api/templates/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/templates');
    expect(list.body.items.some((t) => t.id === created.body.id)).toBe(false);
  });

  it('T5: POST with empty items -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/templates').send({ name: 'ว่างเปล่า', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
