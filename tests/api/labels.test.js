import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

const TODO_LIST_ID = 2;

async function createCard() {
  const res = await request(app)
    .post('/api/cards')
    .send({ listId: TODO_LIST_ID, title: 'การ์ดทดสอบ', creatorName: 'สมชาย ก.' });
  return res.body;
}

describe('Labels API', () => {
  useTestDb();

  it('L1: GET lists 0 labels initially, POST creates one with an auto-assigned color', async () => {
    const before = await request(app).get('/api/labels');
    expect(before.body.items).toHaveLength(0);

    const res = await request(app).post('/api/labels').send({ name: 'Network' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Network');
    expect(res.body.color).toMatch(/^#[0-9a-fA-F]{6}$/);

    const after = await request(app).get('/api/labels');
    expect(after.body.items).toHaveLength(1);
  });

  it('L2: POST with an explicit color stores it as-is', async () => {
    const res = await request(app).post('/api/labels').send({ name: 'Urgent', color: '#ff0000' });
    expect(res.status).toBe(201);
    expect(res.body.color).toBe('#ff0000');
  });

  it('L3: PATCH updates name/color', async () => {
    const created = await request(app).post('/api/labels').send({ name: 'ก่อนแก้' });
    const res = await request(app).patch(`/api/labels/${created.body.id}`).send({ name: 'หลังแก้', color: '#00ff00' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('หลังแก้');
    expect(res.body.color).toBe('#00ff00');
  });

  it('L4: DELETE removes it', async () => {
    const created = await request(app).post('/api/labels').send({ name: 'จะถูกลบ' });
    const del = await request(app).delete(`/api/labels/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/labels');
    expect(list.body.items.some((l) => l.id === created.body.id)).toBe(false);
  });

  it('L5: POST /api/cards/:id/labels attaches a label and GET /api/cards/:id reflects it', async () => {
    const card = await createCard();
    const label = await request(app).post('/api/labels').send({ name: 'Network' });

    const res = await request(app).post(`/api/cards/${card.id}/labels`).send({ labelId: label.body.id });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual([{ id: label.body.id, name: 'Network', color: label.body.color }]);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.labels).toHaveLength(1);
  });

  it('L6: DELETE /api/cards/:id/labels/:labelId detaches it', async () => {
    const card = await createCard();
    const label = await request(app).post('/api/labels').send({ name: 'Network' });
    await request(app).post(`/api/cards/${card.id}/labels`).send({ labelId: label.body.id });

    const res = await request(app).delete(`/api/cards/${card.id}/labels/${label.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual([]);
  });

  it('L7: POST attach a nonexistent label -> 404', async () => {
    const card = await createCard();
    const res = await request(app).post(`/api/cards/${card.id}/labels`).send({ labelId: 999999 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('L8: DELETE label cascades out of any card it was attached to', async () => {
    const card = await createCard();
    const label = await request(app).post('/api/labels').send({ name: 'Network' });
    await request(app).post(`/api/cards/${card.id}/labels`).send({ labelId: label.body.id });

    await request(app).delete(`/api/labels/${label.body.id}`);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.labels).toHaveLength(0);
  });
});
