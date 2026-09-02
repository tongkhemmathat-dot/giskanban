// js/views/mytasks.view.js — "งานที่ฉันสร้าง" / "งานที่ฉันรับผิดชอบ"
// (docs/07-roadmap.md 4.10). Pure client-side filter over store.state.cards —
// no new API calls. Same mount/subscribe/unmount lifecycle as board.view.js.
import { store } from '../store.js';
import { cardHTML } from '../components/card.js';
import { openCardModal } from '../components/card-modal.js';

function sectionHTML(title, cards) {
  return `
  <div class="mb-6">
    <div class="font-medium text-sm mb-2">${title} (${cards.length})</div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
      ${cards.map((c) => `<div>${cardHTML(c)}</div>`).join('') || '<div class="text-xs text-slate-400">ไม่มี</div>'}
    </div>
  </div>`;
}

function render(root) {
  const me = store.state.me;
  if (!me) {
    root.innerHTML = `<div class="text-sm text-slate-500">กรุณาเลือก "ฉันคือ" ที่แถบด้านบนก่อน เพื่อดูงานของคุณ</div>`;
    return;
  }
  const created = store.state.cards.filter((c) => c.creator?.name === me);
  const assigned = store.state.cards.filter((c) => (c.assignees || []).some((a) => a.name === me));
  root.innerHTML = sectionHTML('📝 งานที่ฉันสร้าง', created) + sectionHTML('✅ งานที่ฉันรับผิดชอบ', assigned);
}

function onClick(e) {
  const cardEl = e.target.closest('.card-item');
  if (cardEl) openCardModal(Number(cardEl.dataset.cardId));
}

export function mountMyTasks(root) {
  const rerender = () => render(root);
  const unsubscribe = store.subscribe(rerender);
  root.addEventListener('click', onClick);
  rerender();

  return function unmount() {
    unsubscribe();
    root.removeEventListener('click', onClick);
  };
}
