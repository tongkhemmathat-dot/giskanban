// js/components/welcome-modal.js — first-visit "คุณคือใคร" prompt shown once
// per boot when no "ฉันคือ" is remembered yet. Same identity mechanism as the
// header select (app.js's meSelect, store.js's setMe/jc_me localStorage key)
// — this is only a friendlier nudge toward it, not a login gate: skippable
// via ✕/Esc/backdrop with no effect, and it reappears on the next visit only
// because nothing was actually chosen yet (CLAUDE.md #1: no login/auth).
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc } from './card.js';

let onKeydown = null;
let rootClickHandler = null;

function close() {
  const root = document.getElementById('modal-root');
  if (rootClickHandler) {
    root.removeEventListener('click', rootClickHandler);
    rootClickHandler = null;
  }
  root.innerHTML = '';
  if (onKeydown) {
    document.removeEventListener('keydown', onKeydown);
    onKeydown = null;
  }
}

function pick(name) {
  store.setMe(name);
  close();
}

async function addNewMember() {
  const name = window.prompt('ชื่อของคุณ:');
  if (!name || !name.trim()) return;
  try {
    const member = await api.post('/members', { name: name.trim() });
    store.upsertMemberLocal(member);
    pick(member.name);
  } catch (err) {
    toast.show(`เพิ่มชื่อไม่สำเร็จ: ${err.message}`);
  }
}

function memberButtonHTML(m) {
  return `
  <button type="button" data-pick-me="${esc(m.name)}" class="w-full text-sm text-left px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-100 flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${esc(m.color || '#94a3b8')}"></span>${esc(m.name)}
  </button>`;
}

function modalHTML() {
  return `
  <div class="fixed inset-0 modal-backdrop flex items-center justify-center z-40 p-4" data-close-on-backdrop>
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-5">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h2 class="text-lg font-semibold dark:text-slate-100">คุณคือใคร?</h2>
        <button type="button" data-close-modal class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none" aria-label="ปิด">✕</button>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">เลือกชื่อของคุณไว้ครั้งเดียว ระบบจะจำไว้เติมชื่อผู้ทำรายการให้อัตโนมัติ (ข้ามได้ ไม่บังคับ)</p>
      <div class="space-y-1.5 max-h-64 overflow-y-auto">${store.state.members.map(memberButtonHTML).join('')}</div>
      <button type="button" data-add-new class="w-full text-sm mt-3 px-3 py-2 rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">+ ชื่อของฉันไม่อยู่ในนี้</button>
    </div>
  </div>`;
}

export function maybeShowWelcomeModal() {
  if (store.state.me || !store.state.members.length) return;
  const root = document.getElementById('modal-root');
  root.innerHTML = modalHTML();

  onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);

  rootClickHandler = (e) => {
    if (e.target.hasAttribute('data-close-on-backdrop') || e.target.closest('[data-close-modal]')) {
      close();
    } else if (e.target.closest('[data-add-new]')) {
      addNewMember();
    } else {
      const btn = e.target.closest('[data-pick-me]');
      if (btn) pick(btn.dataset.pickMe);
    }
  };
  root.addEventListener('click', rootClickHandler);
}
