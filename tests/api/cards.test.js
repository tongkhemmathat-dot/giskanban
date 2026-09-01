import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';
import { calcSlaDueAt } from '../../server/utils/sla.js';
import { toApiDateTime } from '../../server/utils/date.js';

// Seeded list ids (server/db/seed.js LISTS order): backlog=1, todo=2,
// doing=3, waiting=4, review=5, done=6.
const TODO_LIST_ID = 2;
const DONE_LIST_ID = 6;

describe('Cards API', () => {
  const getDb = useTestDb();

  it('GET /api/health reports ok + connected db', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, db: 'connected', version: '1.0.0' });
    expect(typeof res.body.uptime).toBe('number');
  });

  it('C1: POST with all fields -> 201 + code JC-######', async () => {
    const res = await request(app).post('/api/cards').send({
      listId: TODO_LIST_ID,
      title: 'ทดสอบสร้างใบงาน',
      description: 'รายละเอียด',
      type: 'incident',
      priority: 'high',
      site: 'DC-Rama9',
      customer: 'ฝ่าย GIS',
      deviceRef: 'GIS-APP-01',
      dueDate: '2026-09-06T22:00',
      creatorName: 'สมชาย ก.',
      assigneeNames: ['ณัฐพล ว.'],
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^JC-\d{6}$/);
    expect(res.body.title).toBe('ทดสอบสร้างใบงาน');
    expect(res.body.listId).toBe(TODO_LIST_ID);
  });

  it('C2: POST without creatorName -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/cards').send({ listId: TODO_LIST_ID, title: 'ไม่มีผู้สร้าง' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('C3: POST with a brand-new creatorName auto-creates the member exactly once', async () => {
    const before = await request(app).get('/api/members');
    const beforeCount = before.body.items.length;

    const res1 = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'งานที่ 1', creatorName: 'ทดสอบ คนใหม่' });
    expect(res1.status).toBe(201);
    expect(res1.body.creator.name).toBe('ทดสอบ คนใหม่');

    const res2 = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'งานที่ 2', creatorName: 'ทดสอบ คนใหม่' });
    expect(res2.body.creator.id).toBe(res1.body.creator.id); // same member, not duplicated

    const after = await request(app).get('/api/members');
    expect(after.body.items.length).toBe(beforeCount + 1);
  });

  it('C4: POST without assigneeNames -> assignees = [creator]', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'ไม่มี assignee', creatorName: 'ปรียา ส.' });
    expect(res.status).toBe(201);
    expect(res.body.assignees).toHaveLength(1);
    expect(res.body.assignees[0].name).toBe('ปรียา ส.');
  });

  it('C5: POST with 3 subtaskTitles -> progress.total = 3', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({
        listId: TODO_LIST_ID,
        title: 'มีขั้นตอน',
        creatorName: 'สมชาย ก.',
        subtaskTitles: ['1. ทำ backup', '2. ติดตั้งเวอร์ชันใหม่', '3. ทดสอบ'],
      });
    expect(res.status).toBe(201);
    expect(res.body.progress).toEqual({ done: 0, total: 3, pct: 0 });
    expect(res.body.subtasks.map((s) => s.title)).toEqual(['ทำ backup', 'ติดตั้งเวอร์ชันใหม่', 'ทดสอบ']);
  });

  it('C6: POST with templateSlug "upgrade" -> progress.total = 11', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'ใช้แม่แบบ', creatorName: 'สมชาย ก.', templateSlug: 'upgrade' });
    expect(res.status).toBe(201);
    expect(res.body.progress.total).toBe(11);
  });

  it('C7: POST with client-sent code/slaDueAt -> both ignored, server computes its own', async () => {
    const res = await request(app).post('/api/cards').send({
      listId: TODO_LIST_ID,
      title: 'ส่ง code เอง',
      creatorName: 'สมชาย ก.',
      priority: 'critical',
      code: 'JC-999999',
      slaDueAt: '2099-01-01T00:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.code).not.toBe('JC-999999');
    expect(res.body.code).toMatch(/^JC-\d{6}$/);
    const expectedSla = toApiDateTime(calcSlaDueAt('critical', res.body.createdAt));
    expect(res.body.slaDueAt).toBe(expectedSla);
  });

  it('C8: PATCH priority low -> critical recalculates slaDueAt from the ORIGINAL created_at', async () => {
    const created = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'เปลี่ยน priority', creatorName: 'สมชาย ก.', priority: 'low' });
    const cardId = created.body.id;
    const originalCreatedAt = created.body.createdAt;

    const patched = await request(app).patch(`/api/cards/${cardId}`).send({ priority: 'critical', actorName: 'สมชาย ก.' });
    expect(patched.status).toBe(200);
    expect(patched.body.priority).toBe('critical');
    const expected = toApiDateTime(calcSlaDueAt('critical', originalCreatedAt));
    expect(patched.body.slaDueAt).toBe(expected);
  });

  it('C9/C10: PATCH move into and out of a done column sets/clears completedAt', async () => {
    const created = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'ย้ายเข้า-ออก Done', creatorName: 'สมชาย ก.' });
    const cardId = created.body.id;
    expect(created.body.completedAt).toBeNull();

    const intoDone = await request(app)
      .patch(`/api/cards/${cardId}/move`)
      .send({ listId: DONE_LIST_ID, position: 65536 });
    expect(intoDone.status).toBe(200);
    expect(intoDone.body.completedAt).not.toBeNull();

    const outOfDone = await request(app)
      .patch(`/api/cards/${cardId}/move`)
      .send({ listId: TODO_LIST_ID, position: 65536 });
    expect(outOfDone.body.completedAt).toBeNull();
  });

  it('C11: DELETE card cascades to its subtasks', async () => {
    const created = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'จะถูกลบ', creatorName: 'สมชาย ก.', templateSlug: 'upgrade' });
    const cardId = created.body.id;
    expect(created.body.progress.total).toBe(11);

    const del = await request(app).delete(`/api/cards/${cardId}`);
    expect(del.status).toBe(204);

    const remaining = getDb().prepare('SELECT COUNT(*) AS n FROM subtasks WHERE card_id = ?').get(cardId);
    expect(remaining.n).toBe(0);

    const getAfter = await request(app).get(`/api/cards/${cardId}`);
    expect(getAfter.status).toBe(404);
  });

  it('C12: GET ?q=ArcGIS finds the seeded card by title', async () => {
    const res = await request(app).get('/api/cards').query({ q: 'ArcGIS' });
    expect(res.status).toBe(200);
    expect(res.body.items.some((c) => c.title.includes('ArcGIS'))).toBe(true);
  });

  it('C13: GET ?slaStatus=overdue returns only overdue, unclosed cards', async () => {
    const res = await request(app).get('/api/cards').query({ slaStatus: 'overdue' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const c of res.body.items) {
      expect(c.slaStatus).toBe('overdue');
    }
  });

  it('C14: POST projectCode "e26-1234" is stored uppercased', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'projectCode lowercase', creatorName: 'สมชาย ก.', projectCode: 'e26-1234' });
    expect(res.status).toBe(201);
    expect(res.body.projectCode).toBe('E26-1234');
  });

  it('C15: POST projectCode "E9-12" (wrong format) -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'projectCode ผิด', creatorName: 'สมชาย ก.', projectCode: 'E9-12' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('C16: POST without projectCode -> null', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'ไม่มี projectCode', creatorName: 'สมชาย ก.' });
    expect(res.status).toBe(201);
    expect(res.body.projectCode).toBeNull();
  });

  describe('assignees', () => {
    it('POST adds an assignee (auto-creating the member if new) and DELETE removes it', async () => {
      const created = await request(app)
        .post('/api/cards')
        .send({ listId: TODO_LIST_ID, title: 'assignee flow', creatorName: 'สมชาย ก.' });
      const cardId = created.body.id;

      const added = await request(app).post(`/api/cards/${cardId}/assignees`).send({ memberName: 'คนใหม่ รับงาน' });
      expect(added.status).toBe(201);
      expect(added.body.assignees.some((a) => a.name === 'คนใหม่ รับงาน')).toBe(true);
      const memberId = added.body.assignees.find((a) => a.name === 'คนใหม่ รับงาน').id;

      const removed = await request(app).delete(`/api/cards/${cardId}/assignees/${memberId}`);
      expect(removed.status).toBe(200);
      expect(removed.body.assignees.some((a) => a.id === memberId)).toBe(false);
    });

    it('POST assignee on a non-existent card -> 404', async () => {
      const res = await request(app).post('/api/cards/999999/assignees').send({ memberName: 'ใครสักคน' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  it('attaches labelIds when creating a card', async () => {
    const label = getDb().prepare('INSERT INTO labels (board_id, name, color) VALUES (1, ?, ?)').run('Network', '#0ea5e9');
    const labelId = Number(label.lastInsertRowid);

    const res = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'มี label', creatorName: 'สมชาย ก.', labelIds: [labelId] });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual([{ id: labelId, name: 'Network', color: '#0ea5e9' }]);
  });
});
