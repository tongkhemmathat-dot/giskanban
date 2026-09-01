// Fractional-position helper for drag & drop ordering (docs/05-business-rules.md §5).
const GAP = 65536;

export function midPosition(prev, next) {
  if (prev == null && next == null) return GAP;
  if (prev == null) return next / 2;
  if (next == null) return prev + GAP;
  return (prev + next) / 2;
}

// If the gap between neighbours becomes narrower than this, callers should
// renumber the whole column to GAP, 2*GAP, 3*GAP, … before inserting again.
export const MIN_GAP = 0.0001;
