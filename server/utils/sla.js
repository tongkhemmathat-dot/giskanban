// SLA due-date calculation — always computed server-side (docs/05-business-rules.md §2).
// Hours-to-close per priority.
export const SLA_HOURS = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
};

// SQLite's `datetime('now')` (used as the DEFAULT for created_at/etc.) returns
// UTC time formatted as 'YYYY-MM-DD HH:MM:SS' with no timezone marker. To keep
// `WHERE sla_due_at < datetime('now')` (docs/03-database.md §5) working as a
// plain string comparison, every date we produce here uses that exact same
// UTC, zero-padded, non-offset format — and any input string with no explicit
// offset is *assumed* to already be UTC (matching how it was written by SQLite),
// regardless of the server's TZ env var (which only affects display).
// Exported so subtask.service.js can reuse this exact same UTC-naive-string
// convention for isOverdue (backlog: per-subtask due dates) — string-based
// date comparisons break across the ' ' vs 'T' separator formats this
// codebase mixes (SQLite's nowSqlite() vs client-sent ISO strings), so the
// only safe way to compare two naive datetime strings is parsing them both
// through the same rule.
export function parseAsUtc(input) {
  if (input instanceof Date) return input;
  let s = String(input).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) {
    s += 'Z';
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date input: ${input}`);
  }
  return d;
}

function formatSqlite(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * calcSlaDueAt(priority, createdAt)
 * Returns 'YYYY-MM-DD HH:MM:SS' (UTC) = createdAt + SLA_HOURS[priority].
 * `createdAt` may be a Date, a SQLite datetime string, or an ISO string.
 */
export function calcSlaDueAt(priority, createdAt) {
  const hours = SLA_HOURS[priority];
  if (hours == null) {
    throw new Error(`Unknown priority: ${priority}`);
  }
  const base = parseAsUtc(createdAt);
  const due = new Date(base.getTime() + hours * 60 * 60 * 1000);
  return formatSqlite(due);
}

/**
 * computeSlaStatus({ priority, slaDueAt, isDone }) -> 'done'|'overdue'|'at_risk'|'ok'
 * Read-time SLA status classification (docs/05-business-rules.md §2 table).
 * Pure function — the caller (card.service.js) is responsible for looking up
 * whether the card's current list has is_done=1.
 */
export function computeSlaStatus({ priority, slaDueAt, isDone }) {
  if (isDone) return 'done';
  if (!slaDueAt) return 'ok';
  const due = parseAsUtc(slaDueAt).getTime();
  const now = Date.now();
  if (due < now) return 'overdue';
  const totalMs = (SLA_HOURS[priority] ?? 0) * 60 * 60 * 1000;
  const remainingMs = due - now;
  if (totalMs > 0 && remainingMs < totalMs * 0.25) return 'at_risk';
  return 'ok';
}
