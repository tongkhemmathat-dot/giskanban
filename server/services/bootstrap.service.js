// GET /api/bootstrap aggregation (docs/04-api.md §2). Board/lists/labels/
// templates here are simple read-only lookups with no business logic of
// their own yet (their CRUD belongs to later agents) — reusing
// member.service.js/card.service.js for the parts that already have one.
import db from '../db/connection.js';
import { listMembers } from './member.service.js';
import { listCards } from './card.service.js';
import { listLabels } from './label.service.js';

export function getBootstrap() {
  const board = db.prepare('SELECT * FROM boards LIMIT 1').get();
  const lists = db.prepare('SELECT * FROM lists ORDER BY position').all();
  const templates = db.prepare('SELECT id, name, slug, items FROM templates ORDER BY id').all();

  return {
    board: board ? { id: board.id, name: board.name } : null,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      wipLimit: l.wip_limit,
      isDone: l.is_done,
    })),
    members: listMembers(),
    labels: listLabels(),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      itemCount: JSON.parse(t.items).length,
    })),
    cards: listCards(),
  };
}
