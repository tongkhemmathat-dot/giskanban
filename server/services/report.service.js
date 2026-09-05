// server/services/report.service.js (docs/04-api.md §9, docs/02-architecture.md
// §3 "routes/reports.routes.js"). Reuses computeSlaStatus (server/utils/sla.js)
// and listCards (card.service.js) rather than re-deriving SLA logic — every
// other place in this codebase that needs slaStatus goes through one of
// these two, and reports should agree with the board's own numbers.
import db from '../db/connection.js';
import { computeSlaStatus } from '../utils/sla.js';
import { mondayOf, isoWeekNumber } from '../utils/week.js';
import { listCards } from './card.service.js';

function cardSlaRows() {
  return db
    .prepare(
      `SELECT c.id, c.priority, c.sla_due_at, c.created_at, c.completed_at, c.creator_id,
              l.id AS list_id, l.slug, l.is_done, l.pauses_sla
       FROM cards c JOIN lists l ON l.id = c.list_id`,
    )
    .all();
}

export function getSummary() {
  const rows = cardSlaRows();
  const statuses = rows.map((r) => computeSlaStatus({ priority: r.priority, slaDueAt: r.sla_due_at, isDone: !!r.is_done, isPaused: !!r.pauses_sla }));

  const open = rows.filter((r) => !r.is_done).length;
  const doing = rows.filter((r) => r.slug === 'doing').length;
  const overdue = statuses.filter((s) => s === 'overdue').length;
  const atRisk = statuses.filter((s) => s === 'at_risk').length;

  // Rolling 7 days, not calendar week — docs/04-api.md §9 doesn't specify a
  // boundary, and a rolling window is simplest to reason about/test.
  const doneThisWeek = db
    .prepare(`SELECT COUNT(*) AS n FROM cards WHERE completed_at >= datetime('now', '-7 days')`)
    .get().n;

  const avgRow = db
    .prepare(`SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24) AS avg FROM cards WHERE completed_at IS NOT NULL`)
    .get();
  const avgCloseHours = avgRow.avg == null ? 0 : Math.round(avgRow.avg * 10) / 10;

  return { open, doing, overdue, atRisk, doneThisWeek, avgCloseHours };
}

export function getWorkload() {
  const members = db.prepare('SELECT id, name FROM members ORDER BY name').all();
  const rows = cardSlaRows();

  const assigneesByCard = new Map();
  for (const row of db.prepare('SELECT card_id, member_id FROM card_assignees').all()) {
    if (!assigneesByCard.has(row.card_id)) assigneesByCard.set(row.card_id, new Set());
    assigneesByCard.get(row.card_id).add(row.member_id);
  }

  return members.map((m) => {
    const created = rows.filter((r) => r.creator_id === m.id).length;
    const assigned = rows.filter((r) => assigneesByCard.get(r.id)?.has(m.id));
    const active = assigned.filter((r) => !r.is_done).length;
    const overdue = assigned.filter(
      (r) => !r.is_done && computeSlaStatus({ priority: r.priority, slaDueAt: r.sla_due_at, isDone: false, isPaused: !!r.pauses_sla }) === 'overdue',
    ).length;
    return { memberId: m.id, name: m.name, active, created, overdue };
  });
}

export function getOverdueCards() {
  return listCards().filter((c) => c.slaStatus === 'overdue' || c.slaStatus === 'at_risk');
}

export function getThroughput(weeks = 8) {
  const currentMonday = mondayOf(new Date());
  const result = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(monday.getUTCDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const start = monday.toISOString().slice(0, 10);
    const end = sunday.toISOString().slice(0, 10);

    const opened = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE date(created_at) BETWEEN ? AND ?`).get(start, end).n;
    const closed = db
      .prepare(`SELECT COUNT(*) AS n FROM cards WHERE completed_at IS NOT NULL AND date(completed_at) BETWEEN ? AND ?`)
      .get(start, end).n;

    result.push({ week: `W${String(isoWeekNumber(monday)).padStart(2, '0')}`, opened, closed });
  }

  return result;
}

export function getByCreator() {
  // Same query as docs/03-database.md §5's reference example.
  return db
    .prepare(
      `SELECT m.name AS name, COUNT(c.id) AS count
       FROM members m LEFT JOIN cards c ON c.creator_id = m.id
       GROUP BY m.id ORDER BY count DESC, m.name`,
    )
    .all();
}
