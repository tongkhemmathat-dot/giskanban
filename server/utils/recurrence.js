// server/utils/recurrence.js — pure date math for recurring_cards
// (docs/07-roadmap.md backlog: "ใบงานประจำ (recurring) สำหรับงาน PM").
// DB columns store plain UTC 'YYYY-MM-DD HH:MM:SS' strings (nowSqlite()'s
// convention), but "ทุกวันจันทร์" / "ทุกวันที่ 15" and the RUN_HOUR below are
// all in the team's local time — Thailand, ICT (UTC+7, no DST) — since that's
// the only timezone this NOC-internal app's users are in (docs/01-overview.md:
// "ผู้ใช้: ทีมภายใน... ใช้งานผ่านเครือข่ายองค์กร"). Every date-math step here
// happens in an ICT "wall clock" frame (built via Date.UTC on ICT-shifted
// fields) and only converts back to real UTC at the very end, in toSqlite().
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // ICT = UTC+7

// Arbitrary early-morning slot new cards get created at, same idea as
// notify.service.js's NOTIFY_HOUR default (8) but earlier so a PM job card
// exists before the day's SLA clock (docs/05-business-rules.md §2) starts
// mattering. In ICT, i.e. 06:00 น. เวลาไทย.
const RUN_HOUR = 6;

function toIctWall(utcDate) {
  return new Date(utcDate.getTime() + TZ_OFFSET_MS);
}

function ictWallToSqlite(wallDate) {
  const utcDate = new Date(wallDate.getTime() - TZ_OFFSET_MS);
  return utcDate.toISOString().slice(0, 19).replace('T', ' ');
}

// computeNextRun('weekly', { dayOfWeek: 1 }, from) -> next Monday 06:00 ICT
// strictly after `from`, returned as a UTC sqlite string. computeNextRun(
// 'monthly', { dayOfMonth: 15 }, from) -> next 15th 06:00 ICT strictly after
// `from`. dayOfMonth is restricted to 1-28 by recurring.schema.js so it
// always exists in every month -- no end-of-month clamping to write here.
export function computeNextRun(frequency, { dayOfWeek, dayOfMonth }, from = new Date()) {
  const fromWall = toIctWall(from);
  const nextWall = new Date(Date.UTC(fromWall.getUTCFullYear(), fromWall.getUTCMonth(), fromWall.getUTCDate(), RUN_HOUR, 0, 0));
  if (nextWall <= fromWall) nextWall.setUTCDate(nextWall.getUTCDate() + 1);

  const targetDay = frequency === 'weekly' ? dayOfWeek : dayOfMonth;
  const getDay = frequency === 'weekly' ? (d) => d.getUTCDay() : (d) => d.getUTCDate();
  while (getDay(nextWall) !== targetDay) nextWall.setUTCDate(nextWall.getUTCDate() + 1);

  return ictWallToSqlite(nextWall);
}
