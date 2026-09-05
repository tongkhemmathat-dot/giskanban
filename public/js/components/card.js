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
  incident: { icon: '🚨', label: 'Incident', chip: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
  service_request: { icon: '🛠', label: 'Service', chip: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
  change: { icon: '🔄', label: 'Change', chip: 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' },
  maintenance: { icon: '🧰', label: 'PM', chip: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
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
  const color = person.color || '#0d9488';
  return `<div class="${size} rounded-full flex items-center justify-center text-white font-medium shrink-0" style="background:${esc(color)}" title="${esc(person.name || '')}">${esc(initials)}</div>`;
}

// Dynamic per-label colors can't be static Tailwind classes, so this uses
// inline style like avatarHTML does for member colors — background is the
// label color at ~13% opacity (hex alpha suffix) so text stays legible
// without needing a separate light/dark text-color lookup per label.
function labelChipsHTML(labels) {
  if (!labels?.length) return '';
  return `<div class="flex flex-wrap gap-1 pl-2 mb-1">${labels
    .map((l) => `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style="background:${esc(l.color)}22;color:${esc(l.color)}">${esc(l.name)}</span>`)
    .join('')}</div>`;
}

function slaChipHTML(card) {
  if (card.slaStatus === 'overdue') {
    return '<span class="text-rose-600 dark:text-rose-400 text-[11px] font-medium flex items-center gap-1">⏰ เกินกำหนด</span>';
  }
  if (card.slaStatus === 'at_risk') {
    return '<span class="text-orange-500 dark:text-orange-400 text-[11px] font-medium flex items-center gap-1">⚠ ใกล้ครบ</span>';
  }
  if (card.slaStatus === 'paused') {
    return '<span class="text-slate-400 dark:text-slate-500 text-[11px] font-medium flex items-center gap-1">⏸ พัก SLA</span>';
  }
  return '';
}

/**
 * Returns the HTML for one card. Pure function of `card` (+ optional bulk-
 * select state) — safe to call repeatedly (idempotent). `selectable` is the
 * board's multi-select mode (docs/07-roadmap.md backlog: "bulk action บน
 * board"); the checkbox is `pointer-events-none` because board.view.js's
 * click handler owns the toggle (clicking anywhere on the card while
 * selectable, not just the box) — letting the native checkbox also react
 * would double-toggle it.
 */
export function cardHTML(card, { selectable = false, selected = false } = {}) {
  const t = TYPE_META[card.type] || TYPE_META.service_request;
  const p = PRIORITY_META[card.priority] || PRIORITY_META.medium;
  const prog = card.progress || { done: 0, total: 0, pct: 0 };
  const counts = card.counts || { comments: 0, attachments: 0 };
  const bar = prog.pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500';
  const assignees = Array.isArray(card.assignees) ? card.assignees : [];

  return `
  <div class="card-item bg-white dark:bg-slate-800 rounded-lg border ${selected ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-slate-200 dark:border-slate-700'} p-3 mb-2 relative" data-card-id="${card.id}">
    ${selectable ? `<input type="checkbox" ${selected ? 'checked' : ''} class="absolute -top-1.5 -left-1.5 w-4 h-4 accent-indigo-600 pointer-events-none z-10" aria-hidden="true" tabindex="-1">` : ''}
    <div class="absolute left-0 top-3 bottom-3 w-1 rounded-r ${p.dot}"></div>
    <div class="flex items-center justify-between mb-1 pl-2">
      <span class="text-[11px] px-1.5 py-0.5 rounded border ${t.chip}">${t.icon} ${esc(t.label)}</span>
      ${slaChipHTML(card)}
    </div>
    <div class="font-medium text-slate-800 dark:text-slate-100 pl-2 mb-1 leading-snug">${esc(card.title)}</div>
    ${labelChipsHTML(card.labels)}
    ${card.site || card.customer ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 pl-2">📍 ${esc(card.site || '')}${card.site && card.customer ? ' · ' : ''}${esc(card.customer || '')}</div>` : ''}
    ${card.deviceRef ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 pl-2">🖥 ${esc(card.deviceRef)}</div>` : ''}
    ${card.projectCode ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 pl-2">🗂 ${esc(card.projectCode)}</div>` : ''}
    <div class="text-[11px] text-slate-600 dark:text-slate-300 pl-2 mt-1 flex items-center gap-1">✍️ ผู้สร้าง: <span class="font-medium">${esc(card.creator?.name || '—')}</span></div>
    ${prog.total > 0 ? `
      <div class="pl-2 mt-2">
        <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
          <span>ขั้นตอน ${prog.done}/${prog.total}</span><span>${prog.pct}%</span>
        </div>
        <div class="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full ${bar} progress-bar-fill" style="width:${prog.pct}%"></div></div>
      </div>` : ''}
    <div class="flex items-center justify-between mt-2 pl-2">
      <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>${esc(card.code)}</span>
        ${prog.total ? `<span>☑${prog.done}/${prog.total}</span>` : ''}
        ${counts.comments ? `<span>💬${counts.comments}</span>` : ''}
        ${counts.attachments ? `<span>📎${counts.attachments}</span>` : ''}
      </div>
      <div class="flex -space-x-1">${assignees.map((a) => avatarHTML(a)).join('')}</div>
    </div>
  </div>`;
}
