// server/services/template.service.js (docs/04-api.md §6). Plain CRUD over
// the `templates` table — single-statement writes only, no transaction needed.
import { randomUUID } from 'node:crypto';
import db from '../db/connection.js';
import { AppError } from '../utils/AppError.js';

function toApiTemplate(row) {
  const items = JSON.parse(row.items);
  return { id: row.id, name: row.name, slug: row.slug, items, itemCount: items.length };
}

export function listTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY id').all().map(toApiTemplate);
}

// Seeded templates (docs/03-database.md §4.3) use human-picked slugs
// (upgrade/pm/incident/install); user-created ones just need a unique,
// url-safe id, so a short random suffix is enough — no new dependency, since
// node:crypto is a standard-library module.
export function createTemplate({ name, items }) {
  const slug = `tpl-${randomUUID().slice(0, 8)}`;
  const info = db.prepare('INSERT INTO templates (name, slug, items) VALUES (?, ?, ?)').run(name, slug, JSON.stringify(items));
  return toApiTemplate(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
}

export function updateTemplate(id, fields) {
  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);

  const next = {
    name: fields.name ?? existing.name,
    items: fields.items ? JSON.stringify(fields.items) : existing.items,
  };
  db.prepare('UPDATE templates SET name = ?, items = ? WHERE id = ?').run(next.name, next.items, id);

  return toApiTemplate(db.prepare('SELECT * FROM templates WHERE id = ?').get(id));
}

export function deleteTemplate(id) {
  const existing = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  if (!existing) throw new AppError('NOT_FOUND', 'ไม่พบแม่แบบขั้นตอนนี้', 404);
  db.prepare('DELETE FROM templates WHERE id = ?').run(id);
}
