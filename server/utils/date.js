// Single shared date-formatting helper (docs/10-conventions.md §1: snake_case
// DB <-> camelCase JSON, but *also* used to normalize the date STYLE for every
// datetime field the API ever returns, so responses match docs/04-api.md's
// examples exactly, e.g. "dueDate": "2026-09-06T22:00", "slaDueAt": "2026-09-02T10:00").
//
// DB columns store plain SQLite 'YYYY-MM-DD HH:MM:SS' UTC strings (no 'Z').
// toApiDateTime() below is the ONLY place that reformats a datetime for JSON
// output anywhere in this codebase — every service must route every
// date/datetime field through it before sending a response.

// value -> 'YYYY-MM-DDTHH:MM' | null. Truncates seconds and any timezone
// marker rather than re-parsing, so it round-trips whatever shape the value
// already has (SQLite's 'YYYY-MM-DD HH:MM:SS' or an ISO string with offset).
export function toApiDateTime(value) {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(' ', 'T');
  s = s.replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  return s.slice(0, 16);
}

// Current time in the exact 'YYYY-MM-DD HH:MM:SS' (UTC) shape SQLite's
// datetime('now') and calcSlaDueAt() produce, so anything we write here stays
// directly comparable via `WHERE col < datetime('now')`-style queries.
export function nowSqlite() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
