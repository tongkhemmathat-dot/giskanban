// server/utils/ics.js — minimal RFC 5545 (iCalendar) parser for the team
// calendar feature (server/services/calendar.service.js). Each member pastes
// their own "published calendar" .ics link (Outlook: Settings → Calendar →
// Shared calendars → Publish a calendar) instead of doing Microsoft Graph
// OAuth — no Azure AD app registration needed at all.
//
// This is a BOUNDED, pragmatic parser, not a full RFC 5545 implementation:
//   - Recurrence (RRULE): only FREQ=DAILY/WEEKLY/MONTHLY, INTERVAL, COUNT,
//     UNTIL, and BYDAY (weekday list, WEEKLY only) are honored. MONTHLY
//     recurs on DTSTART's day-of-month (months too short for that day are
//     skipped, never clamped). Any other FREQ (e.g. YEARLY) or BYDAY on
//     MONTHLY/BYSETPOS/BYMONTHDAY falls back to just the series' first
//     occurrence. This covers the common NOC-team patterns (daily standup,
//     weekly sync, monthly review) without the scope of a real RRULE engine.
//   - Timezones: resolved from the file's own VTIMEZONE STANDARD sub-block
//     TZOFFSETTO (year-round, not DST-aware) — good enough for Thailand/SEA
//     tenants (no DST); an event whose TZID isn't declared in the file falls
//     back to UTC.
import { AppError } from './AppError.js';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MAX_RRULE_STEPS = 2000; // safety cap against runaway/malformed rules

function toSqlite(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function unfold(icsText) {
  const rawLines = String(icsText).replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length) {
      lines.push(line);
    }
  }
  return lines;
}

function parseLine(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const [name, ...paramParts] = line.slice(0, colonIdx).split(';');
  const params = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value: line.slice(colonIdx + 1) };
}

// Collects the content lines of each top-level `BEGIN:<name>...END:<name>`
// block. Nested blocks with a *different* name (e.g. STANDARD inside
// VTIMEZONE) just pass through as ordinary content lines of the outer block —
// callers extract those with a second pass.
function extractBlocks(lines, name) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    if (line === `BEGIN:${name}`) {
      current = [];
    } else if (line === `END:${name}`) {
      if (current) blocks.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return blocks;
}

function unescapeText(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseOffset(offsetStr) {
  const m = /^([+-])(\d{2})(\d{2})/.exec(offsetStr || '');
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function buildTzOffsetMap(lines) {
  const tzMap = new Map();
  for (const block of extractBlocks(lines, 'VTIMEZONE')) {
    let tzid = null;
    for (const raw of block) {
      const p = parseLine(raw);
      if (p?.name === 'TZID') {
        tzid = p.value;
        break;
      }
    }
    const standardBlocks = extractBlocks(block, 'STANDARD');
    if (tzid && standardBlocks.length) {
      for (const raw of standardBlocks[0]) {
        const p = parseLine(raw);
        if (p?.name === 'TZOFFSETTO') {
          tzMap.set(tzid, parseOffset(p.value));
          break;
        }
      }
    }
  }
  return tzMap;
}

// Parses a DTSTART/DTEND/EXDATE-shaped value ("YYYYMMDD", "YYYYMMDDTHHMMSS",
// or "...Z") into a UTC Date, resolving TZID against `tzMap` (falls back to
// UTC+0 if unknown). Returns null for a value that doesn't match any of the
// three shapes.
function parseDateTimeValue(value, params, tzMap) {
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const mo = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    return { date: new Date(Date.UTC(y, mo, d, 0, 0, 0)), isAllDay: true };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const wallUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (z) return { date: new Date(wallUtcMs), isAllDay: false };

  const offsetMinutes = params.TZID && tzMap.has(params.TZID) ? tzMap.get(params.TZID) : 0;
  return { date: new Date(wallUtcMs - offsetMinutes * 60_000), isAllDay: false };
}

function parseDuration(value) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value || '');
  if (!m) return 3_600_000; // unparseable — default to 1 hour rather than a 0-length event
  const [, days, hours, minutes, seconds] = m;
  return (
    (Number(days) || 0) * 86_400_000 +
    (Number(hours) || 0) * 3_600_000 +
    (Number(minutes) || 0) * 60_000 +
    (Number(seconds) || 0) * 1000
  );
}

function parseRRuleParams(rrule) {
  const params = {};
  for (const part of rrule.split(';')) {
    const [k, v] = part.split('=');
    if (k) params[k] = v;
  }
  return params;
}

// Returns UTC start Dates for each occurrence, bounded by COUNT/UNTIL when
// present, else stopped once comfortably past `windowEnd` — see module
// comment for exactly which RRULE fields are honored.
function expandRRule(rruleStr, dtstart, windowEnd) {
  const { FREQ: freq, BYDAY: byday, COUNT, UNTIL } = parseRRuleParams(rruleStr);
  const interval = Number(parseRRuleParams(rruleStr).INTERVAL) || 1;
  const count = COUNT ? Number(COUNT) : null;
  const until = UNTIL ? parseDateTimeValue(UNTIL, {}, new Map())?.date : null;
  const occurrences = [];

  if (freq === 'DAILY') {
    for (let i = 0; i < MAX_RRULE_STEPS; i += 1) {
      const occ = new Date(dtstart.getTime() + i * interval * 86_400_000);
      if (count != null && i >= count) break;
      if (until && occ > until) break;
      occurrences.push(occ);
      if (occ > windowEnd && until == null && count == null) break;
    }
  } else if (freq === 'WEEKLY') {
    const days = byday ? byday.split(',').map((c) => DAY_CODES.indexOf(c.slice(-2))).filter((n) => n >= 0) : [dtstart.getUTCDay()];
    days.sort((a, b) => a - b);
    const weekStart = new Date(dtstart);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    let emitted = 0;
    outer: for (let w = 0; w < MAX_RRULE_STEPS; w += 1) {
      const thisWeekStart = new Date(weekStart.getTime() + w * interval * 7 * 86_400_000);
      for (const dow of days) {
        const occ = new Date(thisWeekStart);
        occ.setUTCDate(occ.getUTCDate() + dow);
        occ.setUTCHours(dtstart.getUTCHours(), dtstart.getUTCMinutes(), dtstart.getUTCSeconds(), 0);
        if (occ < dtstart) continue;
        if (until && occ > until) break outer;
        if (count != null && emitted >= count) break outer;
        occurrences.push(occ);
        emitted += 1;
      }
      if (thisWeekStart > windowEnd && until == null && count == null) break;
    }
  } else if (freq === 'MONTHLY') {
    const dayOfMonth = dtstart.getUTCDate();
    let emitted = 0;
    for (let m = 0; m < MAX_RRULE_STEPS; m += interval) {
      const occ = new Date(Date.UTC(dtstart.getUTCFullYear(), dtstart.getUTCMonth() + m, dayOfMonth, dtstart.getUTCHours(), dtstart.getUTCMinutes(), dtstart.getUTCSeconds()));
      if (occ.getUTCDate() !== dayOfMonth) continue; // month too short for this day — skip, don't clamp
      if (until && occ > until) break;
      if (count != null && emitted >= count) break;
      occurrences.push(occ);
      emitted += 1;
      if (occ > windowEnd && until == null && count == null) break;
    }
  } else {
    // Unsupported FREQ (e.g. YEARLY) — fall back to a single occurrence.
    occurrences.push(new Date(dtstart));
  }

  return occurrences;
}

function parseEvents(lines) {
  return extractBlocks(lines, 'VEVENT').map((block) => {
    const ev = { exdates: [] };
    for (const raw of block) {
      const p = parseLine(raw);
      if (!p) continue;
      switch (p.name) {
        case 'UID':
          ev.uid = p.value;
          break;
        case 'SUMMARY':
          ev.summary = unescapeText(p.value);
          break;
        case 'LOCATION':
          ev.location = unescapeText(p.value);
          break;
        case 'DTSTART':
          ev.dtstart = { params: p.params, value: p.value };
          break;
        case 'DTEND':
          ev.dtend = { params: p.params, value: p.value };
          break;
        case 'DURATION':
          ev.duration = p.value;
          break;
        case 'RRULE':
          ev.rrule = p.value;
          break;
        case 'EXDATE':
          for (const v of p.value.split(',')) ev.exdates.push({ params: p.params, value: v });
          break;
        default:
          break;
      }
    }
    return ev;
  });
}

/**
 * parseIcsEvents(icsText, { windowStart, windowEnd }) -> [{ uid, subject,
 * startAt, endAt, isAllDay, location }] — startAt/endAt as sqlite UTC
 * 'YYYY-MM-DD HH:MM:SS' strings, one row per occurrence overlapping the
 * window (recurring events are expanded, see module comment for coverage).
 */
export function parseIcsEvents(icsText, { windowStart, windowEnd }) {
  if (!/BEGIN:VCALENDAR/i.test(icsText)) {
    throw new AppError('INVALID_ICS', 'ไฟล์ที่ลิงก์นี้ชี้ไปไม่ใช่ปฏิทิน iCalendar (.ics) ที่ถูกต้อง', 400);
  }

  const lines = unfold(icsText);
  const tzMap = buildTzOffsetMap(lines);
  const results = [];

  for (const ev of parseEvents(lines)) {
    if (!ev.dtstart) continue;
    const start = parseDateTimeValue(ev.dtstart.value, ev.dtstart.params, tzMap);
    if (!start) continue;

    let end;
    if (ev.dtend) {
      end = parseDateTimeValue(ev.dtend.value, ev.dtend.params, tzMap);
    } else if (ev.duration) {
      end = { date: new Date(start.date.getTime() + parseDuration(ev.duration)) };
    } else if (start.isAllDay) {
      end = { date: new Date(start.date.getTime() + 86_400_000) };
    } else {
      end = { date: new Date(start.date.getTime() + 3_600_000) };
    }
    // Some ICS producers set DTEND=DTSTART on an all-day event (inclusive
    // single day) instead of the RFC 5545-correct DTSTART+1 (exclusive) —
    // treat that degenerate zero/negative span as "at least one full day"
    // so the event doesn't get window-filtered out as if it had no duration.
    if (start.isAllDay && end.date.getTime() <= start.date.getTime()) {
      end = { date: new Date(start.date.getTime() + 86_400_000) };
    }
    const durationMs = end.date.getTime() - start.date.getTime();

    const exSet = new Set(
      ev.exdates.map((e) => parseDateTimeValue(e.value, e.params, tzMap)).filter(Boolean).map((p) => p.date.getTime()),
    );

    const occurrenceStarts = ev.rrule ? expandRRule(ev.rrule, start.date, windowEnd) : [start.date];

    for (const occStart of occurrenceStarts) {
      if (exSet.has(occStart.getTime())) continue;
      const occEnd = new Date(occStart.getTime() + durationMs);
      if (occEnd <= windowStart || occStart >= windowEnd) continue;
      results.push({
        uid: `${ev.uid || 'unknown'}_${occStart.getTime()}`,
        subject: ev.summary || '(ไม่มีหัวข้อ)',
        startAt: toSqlite(occStart),
        endAt: toSqlite(occEnd),
        isAllDay: start.isAllDay,
        location: ev.location || null,
      });
    }
  }

  return results;
}
