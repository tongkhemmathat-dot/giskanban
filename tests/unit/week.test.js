import { describe, it, expect } from 'vitest';
import { mondayOf, isoWeekNumber } from '../../server/utils/week.js';

describe('mondayOf', () => {
  it('a Wednesday rolls back to that week\'s Monday', () => {
    // 2026-09-02 is a Wednesday.
    const monday = mondayOf(new Date(Date.UTC(2026, 8, 2)));
    expect(monday.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('a Monday stays put', () => {
    // 2026-09-07 is itself a Monday.
    const monday = mondayOf(new Date(Date.UTC(2026, 8, 7)));
    expect(monday.toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('isoWeekNumber', () => {
  it('a plain midyear date', () => {
    // 2026-09-02 is in ISO week 36.
    expect(isoWeekNumber(new Date(Date.UTC(2026, 8, 2)))).toBe(36);
  });

  it('year-boundary: Dec 31 can fall in week 1 of the next year', () => {
    // 2025-12-31 is a Wednesday, in ISO week 1 of 2026.
    expect(isoWeekNumber(new Date(Date.UTC(2025, 11, 31)))).toBe(1);
  });

  it('year-boundary: Jan 1 can fall in the last week of the previous year', () => {
    // 2027-01-01 is a Friday, still in ISO week 53 of 2026.
    expect(isoWeekNumber(new Date(Date.UTC(2027, 0, 1)))).toBe(53);
  });
});
