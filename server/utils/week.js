// ISO-8601 week helpers for the throughput report (docs/04-api.md §9,
// server/services/report.service.js). Pure functions, no DB access — same
// shape as sla.js/position.js. All arithmetic is UTC-normalized so this
// agrees with how the rest of the codebase stores/compares datetimes
// (server/utils/sla.js's comment: SQLite's datetime('now') is UTC with no
// offset marker, and every date here is treated as already-UTC).

// Monday 00:00 UTC of the week containing `date`.
export function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday (0) -> 7, so Monday is always day 1
  if (day !== 1) d.setUTCDate(d.getUTCDate() - day + 1);
  return d;
}

// Standard ISO-8601 week-number algorithm ("nearest Thursday" trick): shift
// to the Thursday of the same week, then count weeks from that year's
// Jan-1 — this is what correctly handles the year-boundary edge case (e.g.
// Dec 31, 2025 falling in week 1 of 2026, or Jan 1 falling in the last week
// of the previous year).
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
