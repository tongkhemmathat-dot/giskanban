// GET /api/bootstrap aggregation (docs/04-api.md §2). Board/lists/labels/
// templates here are simple read-only lookups with no business logic of
// their own yet (their CRUD belongs to later agents) — reusing
// member.service.js/card.service.js for the parts that already have one.
import db from '../db/connection.js';
import { listMembers } from './member.service.js';
import { listCards } from './card.service.js';
import { listLabels } from './label.service.js';

export async function getBootstrap() {
  const [board, lists, templates, members, labels, cards] = await Promise.all([
    db.get('SELECT * FROM boards LIMIT 1', []),
    db.all('SELECT * FROM lists ORDER BY position', []),
    db.all('SELECT id, name, slug, items FROM templates ORDER BY id', []),
    listMembers(),
    listLabels(),
    listCards(),
  ]);

  return {
    board: board ? { id: board.id, name: board.name } : null,
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      wipLimit: l.wip_limit,
      isDone: l.is_done,
    })),
    members,
    labels,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      itemCount: JSON.parse(t.items).length,
    })),
    cards,
  };
}
