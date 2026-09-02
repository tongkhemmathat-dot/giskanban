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

describe('Time Logs API', () => {
  useTestDb();

  it('TL1: POST creates a time log and it shows up on GET /api/cards/:id', async () => {
    const card = await createCard();
    const res = await request(app)
      .post(`/api/cards/${card.id}/time-logs`)
      .send({ memberName: 'ณัฐพล ว.', hours: 2.5, note: 'ตรวจสอบระบบ' });

    expect(res.status).toBe(201);
    expect(res.body.member.name).toBe('ณัฐพล ว.');
    expect(res.body.hours).toBe(2.5);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.timeLogs).toHaveLength(1);
  });

  it('TL2: POST hours > 24 -> 400 VALIDATION_ERROR', async () => {
    const card = await createCard();
    const res = await request(app).post(`/api/cards/${card.id}/time-logs`).send({ memberName: 'ณัฐพล ว.', hours: 25 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('TL3: POST hours <= 0 -> 400 VALIDATION_ERROR', async () => {
    const card = await createCard();
    const res = await request(app).post(`/api/cards/${card.id}/time-logs`).send({ memberName: 'ณัฐพล ว.', hours: 0 });
    expect(res.status).toBe(400);
  });

  it('TL4: DELETE removes the time log', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/time-logs`).send({ memberName: 'ณัฐพล ว.', hours: 1 });

    const del = await request(app).delete(`/api/time-logs/${created.body.id}`);
    expect(del.status).toBe(204);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.timeLogs).toHaveLength(0);
  });
});
