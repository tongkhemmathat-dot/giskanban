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
function parseAsUtc(input) {
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
