import { describe, it, expect, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
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

describe('Attachments API', () => {
  useTestDb();

  afterAll(() => {
    // vitest.config.js points UPLOAD_DIR at data/test-uploads specifically so
    // this is safe to wipe — never the real data/uploads directory.
    rmSync('./data/test-uploads', { recursive: true, force: true });
  });

  it('AT1: POST uploads a .txt file, and it downloads back with the same content', async () => {
    const card = await createCard();
    const res = await request(app)
      .post(`/api/cards/${card.id}/attachments`)
      .field('uploaderName', 'ณัฐพล ว.')
      .attach('file', Buffer.from('hello jobcard'), 'note.txt');

    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('note.txt');
    expect(res.body.uploader.name).toBe('ณัฐพล ว.');

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.attachments).toHaveLength(1);
    expect(fetched.body.counts.attachments).toBe(1);

    const download = await request(app).get(`/api/attachments/${res.body.id}/download`);
    expect(download.status).toBe(200);
    expect(download.text).toBe('hello jobcard');
  });

  it('AT2: POST an unsupported file type -> 400 VALIDATION_ERROR', async () => {
    const card = await createCard();
    const res = await request(app)
      .post(`/api/cards/${card.id}/attachments`)
      .field('uploaderName', 'ณัฐพล ว.')
      .attach('file', Buffer.from('MZ...'), 'virus.exe');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AT3: POST a file over MAX_UPLOAD_MB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const card = await createCard();
    const oversized = Buffer.alloc(2 * 1024 * 1024); // MAX_UPLOAD_MB=1 in vitest.config.js
    const res = await request(app)
      .post(`/api/cards/${card.id}/attachments`)
      .field('uploaderName', 'ณัฐพล ว.')
      .attach('file', oversized, 'big.log');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('AT4: POST without a file -> 400 VALIDATION_ERROR', async () => {
    const card = await createCard();
    const res = await request(app).post(`/api/cards/${card.id}/attachments`).field('uploaderName', 'ณัฐพล ว.');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AT5: DELETE removes the attachment row', async () => {
    const card = await createCard();
    const created = await request(app)
      .post(`/api/cards/${card.id}/attachments`)
      .field('uploaderName', 'ณัฐพล ว.')
      .attach('file', Buffer.from('bye'), 'bye.txt');

    const del = await request(app).delete(`/api/attachments/${created.body.id}`);
    expect(del.status).toBe(204);

    const fetched = await request(app).get(`/api/cards/${card.id}`);
    expect(fetched.body.attachments).toHaveLength(0);
  });
});
