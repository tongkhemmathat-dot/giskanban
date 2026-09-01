// Bulk subtask-title splitting (docs/05-business-rules.md §4.1).
// Accepts either an array of lines or a single multi-line string, strips
// leading numbered/bulleted prefixes, drops blank lines, caps at 100 items
// (spam guard, docs/05-business-rules.md §4.4).
export const splitTitles = (input) =>
  (Array.isArray(input) ? input : String(input).split(/\r?\n/))
    .map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 100);
