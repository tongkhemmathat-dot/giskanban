// js/views/dashboard.view.js — KPI tiles + 2 charts + risky-cards table
// (docs/06-ui-spec.md §9, docs/07-roadmap.md 4.12). Pure client-side
// aggregation over store.state — no backend /reports endpoints exist yet
// (docs/07-roadmap.md 5.6), so every number here is computed from the same
// bootstrap data already in store.js. Chart.js is loaded globally via the
// CDN <script> in public/index.html, same as Sortable.
import { store } from '../store.js';
import { esc } from '../components/card.js';
import { openCardModal } from '../components/card-modal.js';

function isDoneList(listId) {
  return store.state.lists.find((l) => l.id === listId)?.isDone === 1;
}

function kpiHTML(label, value, color) {
  return `<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"><div class="text-xs text-slate-500 dark:text-slate-400 mb-1">${esc(label)}</div><div class="text-2xl font-semibold text-${color}-600 dark:text-${color}-400">${value}</div></div>`;
}

function riskyRowHTML(c) {
  const prog = c.progress || { done: 0, total: 0 };
  const statusHTML =
    c.slaStatus === 'overdue'
      ? '<span class="text-rose-600 dark:text-rose-400">เกินกำหนด</span>'
      : '<span class="text-orange-500 dark:text-orange-400">ใกล้ครบ</span>';
  return `
  <tr class="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer dark:text-slate-300" data-card-id="${c.id}">
    <td class="px-4 py-2">${esc(c.code)}</td>
    <td>${esc(c.title)}</td>
    <td>${esc(c.creator?.name || '—')}</td>
    <td>${(c.assignees || []).map((a) => esc(a.name)).join(', ') || '—'}</td>
    <td>${prog.total ? `${prog.done}/${prog.total}` : '—'}</td>
    <td>${c.dueDate ? esc(c.dueDate.slice(0, 10)) : '—'}</td>
    <td>${statusHTML}</td>
  </tr>`;
}

function bodyHTML() {
  const doneCount = store.state.cards.filter((c) => isDoneList(c.listId)).length;
  const open = store.state.cards.length - doneCount;
  const doing = store.state.cards.filter((c) => store.state.lists.find((l) => l.id === c.listId)?.slug === 'doing').length;
  const overdue = store.state.cards.filter((c) => c.slaStatus === 'overdue').length;
  const risky = store.state.cards.filter((c) => c.slaStatus === 'overdue' || c.slaStatus === 'at_risk');

  return `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
    ${kpiHTML('งานเปิดอยู่', open, 'indigo')}
    ${kpiHTML('กำลังดำเนินการ', doing, 'sky')}
    ${kpiHTML('เกินกำหนด', overdue, 'rose')}
    ${kpiHTML('ปิดแล้ว', doneCount, 'emerald')}
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="text-sm font-medium mb-2 dark:text-slate-100">ภาระงานรายคน (ผู้รับผิดชอบ)</div>
      <canvas id="chartWorkload" height="160"></canvas>
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="text-sm font-medium mb-2 dark:text-slate-100">จำนวนใบงานที่แต่ละคนสร้าง</div>
      <canvas id="chartCreator" height="160"></canvas>
    </div>
  </div>
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
    <div class="px-4 py-2 font-medium text-sm border-b border-slate-100 dark:border-slate-700 dark:text-slate-100">งานเกินกำหนด + ใกล้ครบ</div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-700">
            <th class="px-4 py-2">Code</th><th>งาน</th><th>ผู้สร้าง</th><th>ผู้รับผิดชอบ</th><th>ความคืบหน้า</th><th>กำหนด</th><th>สถานะ</th>
          </tr>
        </thead>
        <tbody>${risky.map(riskyRowHTML).join('') || '<tr><td class="px-4 py-3 text-slate-400 dark:text-slate-500" colspan="7">ไม่มีงานเกินกำหนดหรือใกล้ครบ 🎉</td></tr>'}</tbody>
      </table>
    </div>
  </div>`;
}

let chartWorkload = null;
let chartCreator = null;

function destroyCharts() {
  chartWorkload?.destroy();
  chartCreator?.destroy();
  chartWorkload = null;
  chartCreator = null;
}

// Chart.js draws its own tick labels/gridlines on <canvas> — they don't
// inherit CSS, so dark mode needs explicit colors here or they default to
// near-black text that's unreadable on a dark card (backlog: dark mode).
function chartThemeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    tick: isDark ? '#cbd5e1' : '#475569', // slate-300 / slate-600
    grid: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)',
  };
}

function initCharts(root) {
  destroyCharts();
  const wCtx = root.querySelector('#chartWorkload');
  const cCtx = root.querySelector('#chartCreator');
  if (!wCtx || !cCtx) return;

  const members = store.state.members;
  const workload = members.map(
    (m) => store.state.cards.filter((c) => (c.assignees || []).some((a) => a.id === m.id) && !isDoneList(c.listId)).length,
  );
  const created = members.map((m) => store.state.cards.filter((c) => c.creator?.id === m.id).length);
  const { tick, grid } = chartThemeColors();

  chartWorkload = new Chart(wCtx, {
    type: 'bar',
    data: { labels: members.map((m) => m.name), datasets: [{ data: workload, backgroundColor: '#6366f1', borderRadius: 4 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: tick }, grid: { color: grid } },
        x: { ticks: { color: tick }, grid: { color: grid } },
      },
    },
  });
  chartCreator = new Chart(cCtx, {
    type: 'bar',
    data: { labels: members.map((m) => m.name), datasets: [{ data: created, backgroundColor: '#10b981', borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, color: tick }, grid: { color: grid } },
        y: { ticks: { color: tick }, grid: { color: grid } },
      },
    },
  });
}

function render(root) {
  root.innerHTML = bodyHTML();
  initCharts(root);
}

function onClick(e) {
  const row = e.target.closest('[data-card-id]');
  if (row) openCardModal(Number(row.dataset.cardId));
}

export function mountDashboard(root) {
  const rerender = () => render(root);
  const unsubscribe = store.subscribe(rerender);
  root.addEventListener('click', onClick);
  rerender();

  return function unmount() {
    unsubscribe();
    root.removeEventListener('click', onClick);
    destroyCharts();
  };
}
