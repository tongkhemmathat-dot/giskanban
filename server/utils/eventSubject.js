// Parses "<โครงการ และ/หรือ รหัสโครงการ> : <เนื้องาน>" out of a calendar
// event subject (docs/07-roadmap.md backlog: calendar CSV export split into
// รหัสโครงการ/โครงการ/เนื้องาน columns instead of one raw "หัวข้อ" string).
//
// Real calendar subjects aren't consistent about it: the code and project
// name can appear in either order ("DPT E25-5036 : ..." or "E25-5036 DPT :
// ..."), and sometimes there's no code at all ("DPT : ..."). So the rule is
// deliberately loose: split on the first ':' into a prefix/task, then look
// for a project-code-shaped token (same shape as server/schemas/card.schema.js's
// PROJECT_CODE_RE — E + 2-digit year + '-' + 4 digits, e.g. E25-5036)
// anywhere in the prefix and pull it out; whatever's left of the prefix is
// the project name, regardless of which side the code was on. A subject
// with no ':' at all (most ordinary meetings) falls back to task = the
// whole subject, projectCode/project left blank — no information is lost.
const CODE_RE = /E\d{2}-\d{4}/;

export function parseEventSubject(subject) {
  const s = String(subject ?? '');
  const colonIdx = s.indexOf(':');
  if (colonIdx === -1) return { projectCode: '', project: '', task: s.trim() };

  const prefix = s.slice(0, colonIdx).trim();
  const task = s.slice(colonIdx + 1).trim();

  const codeMatch = prefix.match(CODE_RE);
  if (!codeMatch) return { projectCode: '', project: prefix, task };

  const projectCode = codeMatch[0];
  const project = (prefix.slice(0, codeMatch.index) + prefix.slice(codeMatch.index + projectCode.length)).replace(/\s+/g, ' ').trim();
  return { projectCode, project, task };
}
