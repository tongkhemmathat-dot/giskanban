// Minimal RFC 4180 CSV writer (backlog: Export CSV, docs/07-roadmap.md).
// Pure functions, no card/domain knowledge — same shape as week.js.

// Wraps in double-quotes (and doubles any internal double-quote) whenever
// the value contains a comma, quote, or newline — RFC 4180's escaping rule.
// Anything else passes through unquoted.
export function toCsvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// headers: string[], rows: array of arrays (same column order as headers).
// Joined with \r\n per RFC 4180.
export function buildCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(toCsvField).join(','));
  return lines.join('\r\n');
}
