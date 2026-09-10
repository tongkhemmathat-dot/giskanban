// Parses "<โครงการ> <รหัสโครงการ> : <เนื้องาน>" out of a calendar event
// subject (docs/07-roadmap.md backlog: calendar CSV export split into
// รหัสโครงการ/โครงการ/เนื้องาน columns instead of one raw "หัวข้อ" string).
// Same project code shape as server/schemas/card.schema.js's PROJECT_CODE_RE
// (E + 2-digit year + '-' + 4 digits, e.g. E25-5036) — most Outlook meeting
// subjects for project work follow this convention, e.g.
// "DPT E25-5036 : Copy Data ที่เครื่อง DB DPT" -> project "DPT",
// projectCode "E25-5036", task "Copy Data ที่เครื่อง DB DPT". A subject that
// doesn't match (most meetings have no project code at all) falls back to
// task = the whole original subject, projectCode/project left blank — no
// information is lost either way.
const SUBJECT_RE = /^(.+?)\s+(E\d{2}-\d{4})\s*:\s*(.+)$/;

export function parseEventSubject(subject) {
  const s = String(subject ?? '');
  const match = s.match(SUBJECT_RE);
  if (!match) return { projectCode: '', project: '', task: s };
  const [, project, projectCode, task] = match;
  return { projectCode, project: project.trim(), task: task.trim() };
}
