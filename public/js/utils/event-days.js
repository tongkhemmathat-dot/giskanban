// js/utils/event-days.js — which calendar days an event covers.
// Pure string/UTC date math (no Date-in-local-time), so it behaves the same in
// every browser timezone and can be unit-tested from tests/unit/.

/** 'YYYY-MM-DD' + n days -> 'YYYY-MM-DD' */
export function shiftISODate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Every 'YYYY-MM-DD' the event touches, first to last. startAt/endAt are
 * 'YYYY-MM-DD[ T]HH:MM...' strings (as returned by /api/calendar/events).
 *
 * An end that falls exactly on 00:00 is exclusive (iCal all-day DTEND is the
 * day AFTER the last day; a timed event ending at midnight also doesn't touch
 * the new day), so a 2-day all-day event ending "…-03 00:00" covers -01 and -02.
 */
export function eventDayKeys(ev) {
  const startKey = (ev.startAt || '').slice(0, 10);
  if (!startKey) return [];
  const endStr = ev.endAt || ev.startAt;
  let endKey = endStr.slice(0, 10);
  const endsAtMidnight = endStr.slice(11, 16) === '00:00';
  if (endKey > startKey && (ev.isAllDay || endsAtMidnight)) endKey = shiftISODate(endKey, -1);
  if (endKey < startKey) endKey = startKey;

  const keys = [];
  for (let k = startKey; k <= endKey; k = shiftISODate(k, 1)) keys.push(k);
  return keys;
}
