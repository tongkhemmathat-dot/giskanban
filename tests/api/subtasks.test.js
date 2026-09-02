import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

// Seeded list ids (server/db/seed.js LISTS order): backlog=1, todo=2,
// doing=3, waiting=4, review=5, done=6.
const TODO_LIST_ID = 2;

async function createCard(overrides = {}) {
  const res = await request(app)
    .post('/api/cards')
    .send({ listId: TODO_LIST_ID, title: 'การ์ดทดสอบ', creatorName: 'สมชาย ก.', ...overrides });
  return res.body;
}

describe('Subtasks API', () => {
  useTestDb();

  it('S1: POST bulk titles strips numbered/bulleted prefixes and skips blanks', async () => {
    const card = await createCard();
    const res = await request(app)
      .post(`/api/cards/${card.id}/subtasks`)
      .send({ titles: ['1. ทำ backup', '- ทดสอบ restore', '', '3) แจ้งผลให้ผู้ใช้'], actorName: 'ณัฐพล ว.' });

    expect(res.status).toBe(201);
    expect(res.body.items.map((s) => s.title)).toEqual(['ทำ backup', 'ทดสอบ restore', 'แจ้งผลให้ผู้ใช้']);
    expect(res.body.progress).toEqual({ done: 0, total: 3, pct: 0 });
  });

  it('S2: PATCH /api/subtasks/:sid updates title, assigneeName, dueDate, note', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก'] });
    const sid = created.body.items[0].id;

    const res = await request(app)
      .patch(`/api/subtasks/${sid}`)
      .send({ title: 'ขั้นแรก (แก้ไข)', assigneeName: 'ปรียา ส.', dueDate: '2026-09-10T09:00', note: 'หมายเหตุ' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('ขั้นแรก (แก้ไข)');
    expect(res.body.assignee.name).toBe('ปรียา ส.');
    expect(res.body.dueDate).toBe('2026-09-10T09:00');
    expect(res.body.note).toBe('หมายเหตุ');
  });

  it('S3: PATCH /toggle sets done_by + done_at, toggling back clears both', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก', 'ขั้นสอง'] });
    const sid = created.body.items[0].id;

    const done = await request(app).patch(`/api/subtasks/${sid}/toggle`).send({ actorName: 'ณัฐพล ว.' });
    expect(done.status).toBe(200);
    expect(done.body.subtask.isDone).toBe(true);
    expect(done.body.subtask.doneBy).toBe('ณัฐพล ว.');
    expect(done.body.subtask.doneAt).not.toBeNull();

    const undone = await request(app).patch(`/api/subtasks/${sid}/toggle`).send({ actorName: 'ณัฐพล ว.' });
    expect(undone.body.subtask.isDone).toBe(false);
    expect(undone.body.subtask.doneBy).toBeNull();
    expect(undone.body.subtask.doneAt).toBeNull();
  });

  it('S4: toggling the first subtask while card is in To Do auto-moves it to In Progress', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก', 'ขั้นสอง'] });
    const sid = created.body.items[0].id;

    const res = await request(app).patch(`/api/subtasks/${sid}/toggle`).send({ actorName: 'ณัฐพล ว.' });
    expect(res.status).toBe(200);
    expect(res.body.movedTo).toMatchObject({ reason: 'first_subtask_done' });
    expect(res.body.card.listId).toBe(res.body.movedTo.listId);
    expect(res.body.card.listId).not.toBe(TODO_LIST_ID);

    const after = await request(app).get(`/api/cards/${card.id}`);
    expect(after.body.startedAt).not.toBeNull();
  });

  it('S4b: toggling the last remaining subtask suggests Review without actually moving', async () => {
    const card = await createCard({ listId: 4 }); // Waiting Vendor — not backlog/todo, not review/done
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นเดียว'] });
    const sid = created.body.items[0].id;

    const res = await request(app).patch(`/api/subtasks/${sid}/toggle`).send({ actorName: 'ณัฐพล ว.' });
    expect(res.body.movedTo).toMatchObject({ reason: 'all_done_suggest_review', listId: 4 });
    expect(res.body.card.listId).toBe(4); // unchanged — UI must ask first
  });

  it('S5: DELETE /api/subtasks/:sid removes it and returns updated progress', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก', 'ขั้นสอง'] });
    const sid = created.body.items[0].id;

    const res = await request(app).delete(`/api/subtasks/${sid}`);
    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual({ done: 0, total: 1, pct: 0 });
  });

  it('S6: PATCH reorder applies the given order', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['หนึ่ง', 'สอง', 'สาม'] });
    const [a, b, c] = created.body.items;

    const res = await request(app)
      .patch(`/api/cards/${card.id}/subtasks/reorder`)
      .send({ orderedIds: [c.id, a.id, b.id] });

    expect(res.status).toBe(200);
    expect(res.body.items.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it('S7: apply-template appends to existing subtasks instead of replacing them', async () => {
    const card = await createCard();
    await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['งานเดิม 1', 'งานเดิม 2'] });

    const res = await request(app)
      .post(`/api/cards/${card.id}/subtasks/apply-template`)
      .send({ templateSlug: 'upgrade', actorName: 'สมชาย ก.' });

    expect(res.status).toBe(201);
    expect(res.body.added).toBe(11);
    expect(res.body.progress.total).toBe(13);
    expect(res.body.items.map((s) => s.title).slice(0, 2)).toEqual(['งานเดิม 1', 'งานเดิม 2']);
  });

  it('S8: progress is attached to every card in GET /api/cards', async () => {
    await createCard();
    const res = await request(app).get('/api/cards');
    expect(res.status).toBe(200);
    for (const c of res.body.items) {
      expect(c.progress).toEqual(expect.objectContaining({ done: expect.any(Number), total: expect.any(Number), pct: expect.any(Number) }));
    }
  });

  it('S9: a subtask with no dueDate is never isOverdue', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก'] });
    expect(created.body.items[0].isOverdue).toBe(false);
  });

  it('S10: a future dueDate is not isOverdue', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก'] });
    const sid = created.body.items[0].id;

    const res = await request(app).patch(`/api/subtasks/${sid}`).send({ dueDate: '2099-01-01T00:00' });
    expect(res.body.isOverdue).toBe(false);
  });

  it('S11: a past dueDate on an unfinished subtask is isOverdue', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก'] });
    const sid = created.body.items[0].id;

    const res = await request(app).patch(`/api/subtasks/${sid}`).send({ dueDate: '2020-01-01T00:00' });
    expect(res.body.isOverdue).toBe(true);
  });

  it('S12: marking an overdue subtask done clears isOverdue', async () => {
    const card = await createCard();
    const created = await request(app).post(`/api/cards/${card.id}/subtasks`).send({ titles: ['ขั้นแรก'] });
    const sid = created.body.items[0].id;
    await request(app).patch(`/api/subtasks/${sid}`).send({ dueDate: '2020-01-01T00:00' });

    const res = await request(app).patch(`/api/subtasks/${sid}/toggle`).send({ actorName: 'ณัฐพล ว.' });
    expect(res.body.subtask.isDone).toBe(true);
    expect(res.body.subtask.isOverdue).toBe(false);
  });
});
