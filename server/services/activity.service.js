// Shared activity-log writer (docs/05-business-rules.md §8, docs/10-conventions.md §3).
// Every mutation that touches a card writes one row here. `actorName` is
// stored as raw text on purpose (no FK to members) so the history survives
// even if the member is later renamed or removed. Later agents (subtasks,
// comments, attachments, time-logs, templates) import `logActivity` from
// here rather than re-implementing it.
import db from '../db/connection.js';
import { toApiDateTime } from '../utils/date.js';

/**
 * logActivity({ cardId, actorName, action, meta })
 * - cardId:    the card this activity belongs to, or `null` for events whose
 *              card no longer exists (e.g. card_deleted — see card.service.js,
 *              which intentionally passes null there so the row survives the
 *              cascade delete of the card it describes).
 * - actorName: raw display name of whoever performed the action, or null.
 * - action:    one of the action strings in docs/05-business-rules.md §8.
 * - meta:      plain object, JSON-serialized into meta_json. Optional.
 */
export async function logActivity({ cardId = null, actorName = null, action, meta = null }) {
  await db.run('INSERT INTO activities (card_id, actor_name, action, meta_json) VALUES (?, ?, ?, ?)', [
    cardId,
    actorName,
    action,
    meta == null ? null : JSON.stringify(meta),
  ]);
}

/** Full activity timeline for one card, newest first — used by card.service.js's GET :id. */
export async function listActivities(cardId) {
  const rows = await db.all('SELECT * FROM activities WHERE card_id = ? ORDER BY created_at DESC, id DESC', [cardId]);
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    action: row.action,
    meta: row.meta_json ? JSON.parse(row.meta_json) : null,
    createdAt: toApiDateTime(row.created_at),
  }));
}
