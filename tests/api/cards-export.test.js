import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/index.js';
import { useTestDb } from '../helpers/testDb.js';

const TODO_LIST_ID = 2;

describe('GET /api/cards/export (CSV)', () => {
  useTestDb();

  it('E1: returns a CSV file with the expected headers and a BOM prefix', async () => {
    const res = await request(app).get('/api/cards/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM

    const firstLine = res.text.slice(1).split('\r\n')[0];
    expect(firstLine).toBe(
      'code,title,type,priority,list,slaStatus,creator,assignees,site,customer,deviceRef,projectCode,dueDate,slaDueAt,progress,labels,createdAt,completedAt',
    );
  });

  it('E2: a title containing a comma is correctly quoted/escaped', async () => {
    const created = await request(app)
      .post('/api/cards')
      .send({ listId: TODO_LIST_ID, title: 'ทดสอบ, มีคอมม่า', creatorName: 'สมชาย ก.' });

    const res = await request(app).get('/api/cards/export');
    expect(res.text).toContain(`${created.body.code},"ทดสอบ, มีคอมม่า"`);
  });

  it('E3: ?priority=critical narrows the rows the same way GET /api/cards does', async () => {
    await request(app).post('/api/cards').send({ listId: TODO_LIST_ID, title: 'critical one', priority: 'critical', creatorName: 'สมชาย ก.' });
    await request(app).post('/api/cards').send({ listId: TODO_LIST_ID, title: 'low one', priority: 'low', creatorName: 'สมชาย ก.' });

    const filtered = await request(app).get('/api/cards/export').query({ priority: 'critical' });
    const unfiltered = await request(app).get('/api/cards/export');

    const countRows = (text) => text.slice(1).trim().split('\r\n').length - 1; // minus header
    expect(countRows(filtered.text)).toBeLessThan(countRows(unfiltered.text));
    expect(filtered.text).toContain('critical one');
    expect(filtered.text).not.toContain('low one');
  });
});
