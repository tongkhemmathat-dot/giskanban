// js/components/card.js — HTML for a single Kanban card (docs/06-ui-spec.md §3-4).
//
// `projectCode` ("เลขโครงการ", format E<YY>-NNNN, optional/nullable) is a
// documented field (docs/03-database.md `cards.project_code`, docs/04-api.md
// §2/§4 `card.projectCode`, docs/06-ui-spec.md §4) — rendered with a 🗂 icon
// right after the device line, shown only when present, same as site/deviceRef.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

export const TYPE_META = {
  incident: { icon: '🚨', label: 'Incident', chip: 'bg-rose-50 text-rose-600 border-rose-200' },
  service_request: { icon: '🛠', label: 'Service', chip: 'bg-sky-50 text-sky-600 border-sky-200' },
  change: { icon: '🔄', label: 'Change', chip: 'bg-violet-50 text-violet-600 border-violet-200' },
  maintenance: { icon: '🧰', label: 'PM', chip: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

export const PRIORITY_META = {
  critical: { label: 'Critical', dot: 'bg-rose-600' },
  high: { label: 'High', dot: 'bg-orange-500' },
  medium: { label: 'Medium', dot: 'bg-amber-400' },
  low: { label: 'Low', dot: 'bg-slate-400' },
};

export function avatarHTML(person, size = 'w-6 h-6 text-[10px]') {
  if (!person) return '';
  const initials = (person.short || person.name || '').slice(0, 2);
  const color = person.color || '#6366f1';
  return `<div class="${size} rounded-full flex items-center justify-center text-white font-medium shrink-0" style="background:${esc(color)}" title="${esc(person.name || '')}">${esc(initials)}</div>`;
}

function slaChipHTML(card) {
  if (card.slaStatus === 'overdue') {
    return '<span class="text-rose-600 text-[11px] font-medium flex items-center gap-1">⏰ เกินกำหนด</span>';
  }
  if (card.slaStatus === 'at_risk') {
    return '<span class="text-orange-500 text-[11px] font-medium flex items-center gap-1">⚠ ใกล้ครบ</span>';
  }
  return '';
}

/** Returns the HTML for one card. Pure function of `card` — safe to call repeatedly (idempotent). */
export function cardHTML(card) {
  const t = TYPE_META[card.type] || TYPE_META.service_request;
  const p = PRIORITY_META[card.priority] || PRIORITY_META.medium;
  const prog = card.progress || { done: 0, total: 0, pct: 0 };
  const counts = card.counts || { comments: 0, attachments: 0 };
  const bar = prog.pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500';
  const assignees = Array.isArray(card.assignees) ? card.assignees : [];

  return `
  <div class="card-item bg-white rounded-lg border border-slate-200 p-3 mb-2 relative" data-card-id="${card.id}">
    <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r ${p.dot}"></div>
    <div class="flex items-center justify-between mb-1 pl-2">
      <span class="text-[11px] px-1.5 py-0.5 rounded border ${t.chip}">${t.icon} ${esc(t.label)}</span>
      ${slaChipHTML(card)}
    </div>
    <div class="font-medium text-slate-800 pl-2 mb-1 leading-snug">${esc(card.title)}</div>
    ${card.site || card.customer ? `<div class="text-[11px] text-slate-500 pl-2">📍 ${esc(card.site || '')}${card.site && card.customer ? ' · ' : ''}${esc(card.customer || '')}</div>` : ''}
    ${card.deviceRef ? `<div class="text-[11px] text-slate-500 pl-2">🖥 ${esc(card.deviceRef)}</div>` : ''}
    ${card.projectCode ? `<div class="text-[11px] text-slate-500 pl-2">🗂 ${esc(card.projectCode)}</div>` : ''}
    <div class="text-[11px] text-slate-600 pl-2 mt-1 flex items-center gap-1">✍️ ผู้สร้าง: <span class="font-medium">${esc(card.creator?.name || '—')}</span></div>
    ${prog.total > 0 ? `
      <div class="pl-2 mt-2">
        <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>ขั้นตอน ${prog.done}/${prog.total}</span><span>${prog.pct}%</span>
        </div>
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${bar} progress-bar-fill" style="width:${prog.pct}%"></div></div>
      </div>` : ''}
    <div class="flex items-center justify-between mt-2 pl-2">
      <div class="flex items-center gap-2 text-[11px] text-slate-500">
        <span>${esc(card.code)}</span>
        ${prog.total ? `<span>☑${prog.done}/${prog.total}</span>` : ''}
        ${counts.comments ? `<span>💬${counts.comments}</span>` : ''}
        ${counts.attachments ? `<span>📎${counts.attachments}</span>` : ''}
      </div>
      <div class="flex -space-x-1">${assignees.map((a) => avatarHTML(a)).join('')}</div>
    </div>
  </div>`;
}
