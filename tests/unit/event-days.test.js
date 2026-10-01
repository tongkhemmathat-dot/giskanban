import { describe, it, expect } from 'vitest';
import { eventDayKeys, shiftISODate } from '../../public/js/utils/event-days.js';

describe('eventDayKeys', () => {
  it('2-day all-day event (exclusive DTEND) covers both days, not the day after', () => {
    const ev = { startAt: '2026-10-01 00:00:00', endAt: '2026-10-03 00:00:00', isAllDay: true };
    expect(eventDayKeys(ev)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('1-day all-day event covers one day', () => {
    const ev = { startAt: '2026-10-01 00:00:00', endAt: '2026-10-02 00:00:00', isAllDay: true };
    expect(eventDayKeys(ev)).toEqual(['2026-10-01']);
  });

  it('timed event ending on a later day (not midnight) covers both days', () => {
    const ev = { startAt: '2026-10-01T22:00:00', endAt: '2026-10-02T06:00:00', isAllDay: false };
    expect(eventDayKeys(ev)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('timed event ending exactly at midnight does not spill onto the next day', () => {
    const ev = { startAt: '2026-10-01T22:00:00', endAt: '2026-10-02T00:00:00', isAllDay: false };
    expect(eventDayKeys(ev)).toEqual(['2026-10-01']);
  });

  it('same-day timed event covers one day', () => {
    const ev = { startAt: '2026-10-01T09:00:00', endAt: '2026-10-01T10:00:00', isAllDay: false };
    expect(eventDayKeys(ev)).toEqual(['2026-10-01']);
  });

  it('crosses a month boundary', () => {
    const ev = { startAt: '2026-10-31 00:00:00', endAt: '2026-11-03 00:00:00', isAllDay: true };
    expect(eventDayKeys(ev)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('missing/garbage end falls back to the start day; missing start yields nothing', () => {
    expect(eventDayKeys({ startAt: '2026-10-01T09:00:00' })).toEqual(['2026-10-01']);
    expect(eventDayKeys({ startAt: '2026-10-05T09:00:00', endAt: '2026-10-01T09:00:00' })).toEqual(['2026-10-05']);
    expect(eventDayKeys({})).toEqual([]);
  });
});

describe('shiftISODate', () => {
  it('moves across month and year ends', () => {
    expect(shiftISODate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftISODate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
