// js/app.js — hash router + boot (docs/02-architecture.md §3, docs/07-roadmap.md 4.1).
// Boots by calling GET /api/bootstrap through api.js and populating store.js,
// then renders whichever route is active. #/dashboard, #/mytasks, #/members
// are placeholders here — Agent 5 builds those views on top of this shell.

import { store } from './store.js';
import { api } from './api.js';
import { toast } from './components/toast.js';
import { mountBoard } from './views/board.view.js';
import { mountMyTasks } from './views/mytasks.view.js';
import { mountMembers } from './views/members.view.js';
import { mountDashboard } from './views/dashboard.view.js';
import { openCreateModal } from './components/create-modal.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

const ROUTES = ['#/board', '#/dashboard', '#/mytasks', '#/members'];
const DEFAULT_ROUTE = '#/board';

const mainEl = document.getElementById('main-content');
let currentUnmount = null;

function currentHash() {
  return ROUTES.includes(location.hash) ? location.hash : DEFAULT_ROUTE;
}

function updateActiveNav(hash) {
  document.querySelectorAll('#sidebarNav .nav-link').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === hash);
  });
}

function renderLoading() {
  mainEl.innerHTML = `<div class="h-full flex items-center justify-center text-slate-500 text-sm">กำลังโหลดข้อมูล…</div>`;
}

function renderBootError() {
  mainEl.innerHTML = `
  <div class="h-full flex flex-col items-center justify-center text-center gap-3">
    <div class="text-rose-600 font-medium">โหลดข้อมูลไม่สำเร็จ</div>
    <div class="text-xs text-slate-500 max-w-sm">${esc(store.state.error?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')}</div>
    <button type="button" id="retryBootBtn" class="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">ลองใหม่</button>
  </div>`;
  document.getElementById('retryBootBtn')?.addEventListener('click', boot);
}

function renderRoute() {
  if (currentUnmount) {
    currentUnmount();
    currentUnmount = null;
  }

  const hash = currentHash();
  updateActiveNav(hash);

  if (store.state.status === 'loading' || store.state.status === 'idle') {
    renderLoading();
    return;
  }
  if (store.state.status === 'error') {
    renderBootError();
    return;
  }

  if (hash === '#/board') {
    currentUnmount = mountBoard(mainEl);
  } else if (hash === '#/dashboard') {
    currentUnmount = mountDashboard(mainEl);
  } else if (hash === '#/mytasks') {
    currentUnmount = mountMyTasks(mainEl);
  } else if (hash === '#/members') {
    currentUnmount = mountMembers(mainEl);
  }
}

function populateMemberSelect() {
  const sel = document.getElementById('meSelect');
  if (!sel) return;
  const current = store.state.me;
  sel.innerHTML =
    '<option value="">— เลือกชื่อ —</option>' +
    store.state.members.map((m) => `<option value="${esc(m.name)}" ${current === m.name ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function bindShellEvents() {
  document.getElementById('meSelect')?.addEventListener('change', function onChange() {
    store.setMe(this.value);
  });

  document.getElementById('addMemberBtn')?.addEventListener('click', async () => {
    const name = window.prompt('ชื่อสมาชิกใหม่:');
    if (!name || !name.trim()) return;
    try {
      const member = await api.post('/members', { name: name.trim() });
      store.upsertMemberLocal(member);
      populateMemberSelect();
      const sel = document.getElementById('meSelect');
      if (sel) sel.value = member.name;
      store.setMe(member.name);
    } catch (err) {
      toast.show(`เพิ่มสมาชิกไม่สำเร็จ: ${err.message}`);
    }
  });

  document.getElementById('createCardBtn')?.addEventListener('click', () => {
    openCreateModal();
  });

  let searchDebounce;
  document.getElementById('searchInput')?.addEventListener('input', function onSearchInput() {
    clearTimeout(searchDebounce);
    const value = this.value;
    searchDebounce = setTimeout(() => store.setSearchQuery(value), 250);
  });

  window.addEventListener('hashchange', renderRoute);
}

async function boot() {
  store.setStatus('loading');
  renderRoute();
  try {
    const data = await api.get('/bootstrap');
    store.setBootstrap(data);
    populateMemberSelect();
  } catch (err) {
    store.setStatus('error', err);
  }
  renderRoute();
}

function init() {
  bindShellEvents();
  if (!location.hash) location.hash = DEFAULT_ROUTE;
  boot();
}

init();
