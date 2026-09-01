import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

describe('Members API', () => {
  useTestDb();

  it('GET /api/members lists the 5 seeded members', async () => {
    const res = await request(app).get('/api/members');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
  });

  it('GET /api/members?active=1 filters to active members', async () => {
    const res = await request(app).get('/api/members').query({ active: '1' });
    expect(res.status).toBe(200);
    expect(res.body.items.every((m) => m.isActive)).toBe(true);
  });

  it('M1: POST a new name -> 201 + short = first 2 chars + has a color', async () => {
    const res = await request(app).post('/api/members').send({ name: 'ทดสอบ ใหม่' });
    expect(res.status).toBe(201);
    expect(res.body.short).toBe('ทด');
    expect(res.body.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('M2: POST an existing name -> 200, returns the same row, no duplicate created', async () => {
    const first = await request(app).post('/api/members').send({ name: 'ซ้ำกัน' });
    expect(first.status).toBe(201);

    const before = await request(app).get('/api/members');

    const second = await request(app).post('/api/members').send({ name: 'ซ้ำกัน' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const after = await request(app).get('/api/members');
    expect(after.body.items.length).toBe(before.body.items.length);
  });

  it('M3: DELETE a member who is a card creator -> 409 CONFLICT', async () => {
    // สมชาย ก. (id 1) is the creator of the seeded ArcGIS card.
    const res = await request(app).delete('/api/members/1');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('DELETE a member who never created a card succeeds', async () => {
    const created = await request(app).post('/api/members').send({ name: 'ไม่เคยสร้างงาน' });
    const res = await request(app).delete(`/api/members/${created.body.id}`);
    expect(res.status).toBe(204);
  });

  it('PATCH updates member fields', async () => {
    const created = await request(app).post('/api/members').send({ name: 'จะแก้ไข' });
    const res = await request(app).patch(`/api/members/${created.body.id}`).send({ color: '#123456', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.color).toBe('#123456');
    expect(res.body.isActive).toBe(false);
  });

  it('PATCH a non-existent member -> 404', async () => {
    const res = await request(app).patch('/api/members/999999').send({ name: 'ไม่มีจริง' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
