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

describe('Comments API', () => {
  useTestDb();

  it('CM1: POST creates a comment and it shows up on GET /api/cards/:id', async () => {
    const card = await createCard();
    const res = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .send({ authorName: 'ณัฐพล ว.', body: 'กำลังดำเนินการอยู่' });

    expect(res.status).toBe(201);
    expect(res.body.author.name).toBe('ณัฐพล ว.');
    expect(res.body.body).toBe('กำลังดำเนินการอยู่');

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.comments).toHaveLength(1);
    expect(fetched.body.counts.comments).toBe(1);
  });

  it('CM2: POST without body -> 400 VALIDATION_ERROR', async () => {
    const card = await createCard();
    const res = await request(app).post(`/api/cards/${card.id}/comments`).send({ authorName: 'ณัฐพล ว.' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('CM3: DELETE removes the comment', async () => {
    const card = await createCard();
    const created = await request(app)
      .post(`/api/cards/${card.id}/comments`)
      .send({ authorName: 'ณัฐพล ว.', body: 'ลบทีหลัง' });

    const del = await request(app).delete(`/api/comments/${created.body.id}`);
    expect(del.status).toBe(204);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.comments).toHaveLength(0);
  });
});
