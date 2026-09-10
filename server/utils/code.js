// Job card code generator (docs/05-business-rules.md §1).
// Format: 'JC-' + 6-digit zero-padded, continuing from the max existing code.
// Never reuses a deleted card's code because it always looks at MAX(existing).
// Call inside the same transaction as the INSERT to avoid races.
export async function nextCardCode(db) {
  const row = await db.get(`SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS n FROM cards`, []);
  return 'JC-' + String((row?.n ?? 0) + 1).padStart(6, '0');
}
