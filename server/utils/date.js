// Single shared date-formatting helper (docs/10-conventions.md §1: snake_case
// DB <-> camelCase JSON, but *also* used to normalize the date STYLE for every
// datetime field the API ever returns, so responses match docs/04-api.md's
// examples exactly, e.g. "dueDate": "2026-09-06T22:00", "slaDueAt": "2026-09-02T10:00").
//
// DB columns store plain SQLite 'YYYY-MM-DD HH:MM:SS' UTC strings (no 'Z') —
// see server/utils/sla.js's parseAsUtc comment and server/utils/recurrence.js
// for why. toApiDateTime() below shifts that UTC value to Asia/Bangkok
// (fixed +7, no DST — the only timezone this NOC-internal app's users are
// in) for display; it's the ONLY place that shifts timezone for JSON output,
// so every service must route every UTC datetime field through it before
// sending a response.
const DISPLAY_TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok (ICT), no DST

// value (UTC, naive-string or ISO) -> 'YYYY-MM-DDTHH:MM' in Asia/Bangkok | null.
export function toApiDateTime(value) {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z'; // no offset -> assume UTC, same rule as sla.js's parseAsUtc
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + DISPLAY_TZ_OFFSET_MS).toISOString().slice(0, 16);
}

// card.dueDate / subtask.dueDate ONLY: captured straight from a plain
// <input type="datetime-local"> and stored verbatim (public/js/components/
// create-modal.js, card-modal.js) — it's already a naive Asia/Bangkok
// wall-clock string with no UTC semantics at all, so unlike every other
// datetime field it must NOT be shifted by toApiDateTime() above. This just
// normalizes the separator/truncates, same as toApiDateTime() did before it
// started shifting.
export function toApiDateTimeNaive(value) {
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
