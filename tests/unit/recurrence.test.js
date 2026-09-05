import { describe, it, expect } from 'vitest';
import { computeNextRun } from '../../server/utils/recurrence.js';

// Builds a UTC Date from a wall-clock time expressed in ICT (UTC+7) — same
// convention recurrence.js uses internally — so test inputs/expectations read
// as "06:00 น. เวลาไทย" instead of raw UTC offsets.
function ict(y, m, d, h, mi = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, mi, 0) - 7 * 60 * 60 * 1000);
}

function ictSqlite(y, m, d, h, mi = 0) {
  return ict(y, m, d, h, mi).toISOString().slice(0, 19).replace('T', ' ');
}

describe('computeNextRun (ICT / UTC+7 wall clock)', () => {
  it('weekly: from a Saturday 10:00 ICT, dayOfWeek=1 (Monday) -> next Monday 06:00 ICT', () => {
    const from = ict(2026, 9, 5, 10, 0); // Saturday
    expect(computeNextRun('weekly', { dayOfWeek: 1 }, from)).toBe(ictSqlite(2026, 9, 7, 6, 0));
  });

  it("weekly: from before today's run slot on the target day -> today, not next week", () => {
    const from = ict(2026, 9, 7, 3, 0); // Monday, before 06:00 ICT
    expect(computeNextRun('weekly', { dayOfWeek: 1 }, from)).toBe(ictSqlite(2026, 9, 7, 6, 0));
  });

  it("weekly: from after today's run slot on the target day -> next week, not today", () => {
    const from = ict(2026, 9, 7, 10, 0); // Monday, after 06:00 ICT
    expect(computeNextRun('weekly', { dayOfWeek: 1 }, from)).toBe(ictSqlite(2026, 9, 14, 6, 0));
  });

  it("monthly: mid-month -> the same month's target day", () => {
    const from = ict(2026, 9, 5, 10, 0);
    expect(computeNextRun('monthly', { dayOfMonth: 15 }, from)).toBe(ictSqlite(2026, 9, 15, 6, 0));
  });

  it('monthly: after the target day -> rolls into next month', () => {
    const from = ict(2026, 9, 20, 10, 0);
    expect(computeNextRun('monthly', { dayOfMonth: 15 }, from)).toBe(ictSqlite(2026, 10, 15, 6, 0));
  });

  it('monthly: rolls year boundary correctly (December -> January)', () => {
    const from = ict(2026, 12, 20, 10, 0);
    expect(computeNextRun('monthly', { dayOfMonth: 1 }, from)).toBe(ictSqlite(2027, 1, 1, 6, 0));
  });

  it('crosses the UTC calendar-day boundary: 06:00 ICT is 23:00 UTC the previous day', () => {
    const from = ict(2026, 9, 5, 10, 0);
    expect(computeNextRun('weekly', { dayOfWeek: 1 }, from)).toBe('2026-09-06 23:00:00');
  });
});
