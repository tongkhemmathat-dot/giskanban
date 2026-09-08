import { describe, it, expect } from 'vitest';
import { parseIcsEvents } from '../../server/utils/ics.js';

const WINDOW = { windowStart: new Date('2026-09-07T00:00:00Z'), windowEnd: new Date('2026-09-21T00:00:00Z') };

function wrap(body) {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
}

describe('parseIcsEvents', () => {
  it('rejects text that is not an ICS file', () => {
    expect(() => parseIcsEvents('not an ics file', WINDOW)).toThrow();
  });

  it('parses a single UTC ("Z") event', () => {
    const ics = wrap(
      [
        'BEGIN:VEVENT',
        'UID:evt-1',
        'SUMMARY:ประชุมทีม',
        'LOCATION:ห้อง A',
        'DTSTART:20260910T100000Z',
        'DTEND:20260910T110000Z',
        'END:VEVENT',
      ].join('\n'),
    );
    const events = parseIcsEvents(ics, WINDOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ subject: 'ประชุมทีม', startAt: '2026-09-10 10:00:00', endAt: '2026-09-10 11:00:00', isAllDay: false, location: 'ห้อง A' });
  });

  it('parses an all-day event (VALUE=DATE)', () => {
    const ics = wrap(['BEGIN:VEVENT', 'UID:evt-allday', 'SUMMARY:ลาพักร้อน', 'DTSTART;VALUE=DATE:20260912', 'DTEND;VALUE=DATE:20260913', 'END:VEVENT'].join('\n'));
    const events = parseIcsEvents(ics, WINDOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ startAt: '2026-09-12 00:00:00', endAt: '2026-09-13 00:00:00', isAllDay: true });
  });

  it('treats an all-day event with DTEND=DTSTART as a full one-day span, not zero-duration', () => {
    // Some ICS producers (e.g. calendarlabs.com) set DTEND equal to DTSTART
    // for a single all-day event instead of the RFC 5545-correct DTSTART+1 —
    // a zero-length event at midnight would otherwise fall outside the
    // window and silently disappear.
    const ics = wrap(['BEGIN:VEVENT', 'UID:evt-holiday', 'SUMMARY:Labor Day', 'DTSTART;VALUE=DATE:20260907', 'DTEND;VALUE=DATE:20260907', 'END:VEVENT'].join('\n'));
    const events = parseIcsEvents(ics, WINDOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ startAt: '2026-09-07 00:00:00', endAt: '2026-09-08 00:00:00', isAllDay: true });
  });

  it('resolves a TZID event using the VTIMEZONE STANDARD offset', () => {
    const ics = wrap(
      [
        'BEGIN:VTIMEZONE',
        'TZID:SE Asia Standard Time',
        'BEGIN:STANDARD',
        'TZOFFSETTO:+0700',
        'TZOFFSETFROM:+0700',
        'DTSTART:16010101T000000',
        'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:evt-tz',
        'SUMMARY:นัดลูกค้า',
        'DTSTART;TZID=SE Asia Standard Time:20260910T170000',
        'DTEND;TZID=SE Asia Standard Time:20260910T180000',
        'END:VEVENT',
      ].join('\n'),
    );
    const events = parseIcsEvents(ics, WINDOW);
    // 17:00 ICT (UTC+7) == 10:00 UTC
    expect(events[0]).toMatchObject({ startAt: '2026-09-10 10:00:00', endAt: '2026-09-10 11:00:00' });
  });

  it('expands a DAILY recurrence bounded by COUNT', () => {
    const ics = wrap(
      ['BEGIN:VEVENT', 'UID:evt-daily', 'SUMMARY:Standup', 'DTSTART:20260907T020000Z', 'DTEND:20260907T021500Z', 'RRULE:FREQ=DAILY;COUNT=5', 'END:VEVENT'].join('\n'),
    );
    const events = parseIcsEvents(ics, WINDOW);
    expect(events).toHaveLength(5);
    expect(events.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  });

  it('expands a WEEKLY BYDAY recurrence', () => {
    const ics = wrap(
      ['BEGIN:VEVENT', 'UID:evt-weekly', 'SUMMARY:Team sync', 'DTSTART:20260907T030000Z', 'DTEND:20260907T040000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'END:VEVENT'].join(
        '\n',
      ),
    );
    const events = parseIcsEvents(ics, WINDOW);
    const dates = events.map((e) => e.startAt.slice(0, 10)).sort();
    // Within the 2-week window: Mon 9/7, Wed 9/9, Mon 9/14, Wed 9/16
    expect(dates).toEqual(['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16']);
  });

  it('excludes an occurrence listed in EXDATE', () => {
    const ics = wrap(
      [
        'BEGIN:VEVENT',
        'UID:evt-exdate',
        'SUMMARY:Standup',
        'DTSTART:20260907T020000Z',
        'DTEND:20260907T021500Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'EXDATE:20260909T020000Z',
        'END:VEVENT',
      ].join('\n'),
    );
    const events = parseIcsEvents(ics, WINDOW);
    expect(events.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11']);
  });

  it('drops an event entirely outside the window', () => {
    const ics = wrap(['BEGIN:VEVENT', 'UID:evt-far', 'SUMMARY:Far future', 'DTSTART:20271010T100000Z', 'DTEND:20271010T110000Z', 'END:VEVENT'].join('\n'));
    expect(parseIcsEvents(ics, WINDOW)).toHaveLength(0);
  });

  it('unescapes commas/semicolons/newlines/backslashes in text fields', () => {
    const ics = wrap(
      ['BEGIN:VEVENT', 'UID:evt-escape', 'SUMMARY:A\\, B\\; C\\nD\\\\E', 'DTSTART:20260910T100000Z', 'DTEND:20260910T110000Z', 'END:VEVENT'].join('\n'),
    );
    const events = parseIcsEvents(ics, WINDOW);
    expect(events[0].subject).toBe('A, B; C D\\E');
  });
});
