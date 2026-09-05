import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

describe('Recurring cards API', () => {
  const getDb = useTestDb();

  function todoListId() {
    return getDb().prepare("SELECT id FROM lists WHERE slug = 'todo'").get().id;
  }

  it('R1: POST creates a weekly rule and computes nextRunAt', async () => {
    const res = await request(app)
      .post('/api/recurring-cards')
      .send({
        name: 'PM เราท์เตอร์ชั้น 5 รายสัปดาห์',
        listId: todoListId(),
        title: 'ตรวจเช็คเราท์เตอร์ชั้น 5',
        creatorName: 'สมชาย ก.',
        templateSlug: 'pm',
        frequency: 'weekly',
        dayOfWeek: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.frequency).toBe('weekly');
    expect(res.body.isActive).toBe(true);
    expect(res.body.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('R2: POST weekly without dayOfWeek -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/recurring-cards')
      .send({ name: 'ผิดพลาด', listId: todoListId(), title: 'x', creatorName: 'สมชาย ก.', frequency: 'weekly' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('R3: run-now creates a card and reschedules the rule without double-counting', async () => {
    const created = await request(app)
      .post('/api/recurring-cards')
      .send({
        name: 'PM รายเดือน',
        listId: todoListId(),
        title: 'ตรวจเช็คอุปกรณ์ประจำเดือน',
        creatorName: 'ณัฐพล ว.',
        templateSlug: 'pm',
        frequency: 'monthly',
        dayOfMonth: 1,
      });

    const run = await request(app).post(`/api/recurring-cards/${created.body.id}/run-now`);
    expect(run.status).toBe(201);
    expect(run.body.title).toBe('ตรวจเช็คอุปกรณ์ประจำเดือน');
    expect(run.body.subtasks).toHaveLength(8); // "pm" template has 8 steps (docs/03-database.md §4.3)

    const rule = await request(app).get('/api/recurring-cards');
    const updated = rule.body.items.find((r) => r.id === created.body.id);
    expect(updated.lastRunAt).not.toBeNull();
    expect(new Date(updated.nextRunAt).getTime()).toBeGreaterThan(new Date(updated.lastRunAt).getTime());
  });

  it('R4: PATCH can deactivate a rule', async () => {
    const created = await request(app)
      .post('/api/recurring-cards')
      .send({ name: 'จะปิด', listId: todoListId(), title: 'x', creatorName: 'สมชาย ก.', frequency: 'weekly', dayOfWeek: 3 });

    const res = await request(app).patch(`/api/recurring-cards/${created.body.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('R5: DELETE removes the rule', async () => {
    const created = await request(app)
      .post('/api/recurring-cards')
      .send({ name: 'จะถูกลบ', listId: todoListId(), title: 'x', creatorName: 'สมชาย ก.', frequency: 'weekly', dayOfWeek: 3 });

    const del = await request(app).delete(`/api/recurring-cards/${created.body.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/recurring-cards');
    expect(list.body.items.some((r) => r.id === created.body.id)).toBe(false);
  });

  it('R6: POST with unknown listId -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/recurring-cards')
      .send({ name: 'x', listId: 999999, title: 'x', creatorName: 'สมชาย ก.', frequency: 'weekly', dayOfWeek: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
