// js/views/members.view.js — team roster + per-member stats (docs/07-roadmap.md
// 4.11). Pure client-side aggregation over store.state.cards — no new API calls.
import { store } from '../store.js';
import { esc, avatarHTML } from '../components/card.js';

function isDoneListId(listId) {
  return store.state.lists.find((l) => l.id === listId)?.isDone === 1;
}

function rowHTML(m) {
  const createdCount = store.state.cards.filter((c) => c.creator?.id === m.id).length;
  const pendingCount = store.state.cards.filter(
    (c) => (c.assignees || []).some((a) => a.id === m.id) && !isDoneListId(c.listId),
  ).length;
  return `
  <tr class="border-b border-slate-50 dark:border-slate-700 dark:text-slate-200">
    <td class="px-4 py-2 flex items-center gap-2">${avatarHTML(m, 'w-7 h-7 text-xs')}<span>${esc(m.name)}</span></td>
    <td>${createdCount}</td>
    <td>${pendingCount}</td>
  </tr>`;
}

function render(root) {
  root.innerHTML = `
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-700">
          <th class="px-4 py-2">สมาชิก</th><th>สร้างแล้ว</th><th>งานค้าง</th>
        </tr>
      </thead>
      <tbody>${store.state.members.map(rowHTML).join('')}</tbody>
    </table>
  </div>`;
}

export function mountMembers(root) {
  const rerender = () => render(root);
  const unsubscribe = store.subscribe(rerender);
  rerender();

  return function unmount() {
    unsubscribe();
  };
}
