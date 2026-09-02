// js/app.js — hash router + boot (docs/02-architecture.md §3, docs/07-roadmap.md 4.1).
// Boots by calling GET /api/bootstrap through api.js and populating store.js,
// then renders whichever route is active. #/dashboard, #/mytasks, #/members
// are placeholders here — Agent 5 builds those views on top of this shell.

import { store } from './store.js';
import { api } from './api.js';
import { mountBoard } from './views/board.view.js';
import { mountMyTasks } from './views/mytasks.view.js';
import { mountMembers } from './views/members.view.js';
import { mountDashboard } from './views/dashboard.view.js';
import { mountTemplates } from './views/templates.view.js';
import { openCreateModal } from './components/create-modal.js';
import { initTheme, toggleTheme, getTheme } from './theme.js';
import { initTextSize, toggleTextSize, getTextSize } from './textsize.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

const ROUTES = ['#/board', '#/dashboard', '#/mytasks', '#/members', '#/templates'];
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
  mainEl.innerHTML = `<div class="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">กำลังโหลดข้อมูล…</div>`;
}

function renderBootError() {
  mainEl.innerHTML = `
  <div class="h-full flex flex-col items-center justify-center text-center gap-3">
    <div class="text-rose-600 dark:text-rose-400 font-medium">โหลดข้อมูลไม่สำเร็จ</div>
    <div class="text-xs text-slate-500 dark:text-slate-400 max-w-sm">${esc(store.state.error?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')}</div>
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
  } else if (hash === '#/templates') {
    currentUnmount = mountTemplates(mainEl);
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

  document.getElementById('createCardBtn')?.addEventListener('click', () => {
    openCreateModal();
  });

  let searchDebounce;
  document.getElementById('searchInput')?.addEventListener('input', function onSearchInput() {
    clearTimeout(searchDebounce);
    const value = this.value;
    searchDebounce = setTimeout(() => {
      store.setSearchQuery(value);
      updateExportCsvLink(value);
    }, 250);
  });

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    toggleTheme();
    updateThemeToggleIcon();
  });

  document.getElementById('textSizeToggleBtn')?.addEventListener('click', () => {
    toggleTextSize();
    updateTextSizeToggleState();
  });

  window.addEventListener('hashchange', renderRoute);
  // Re-render the current route so already-mounted views pick up the new
  // theme/text-size immediately — mainly for dashboard.view.js's Chart.js
  // canvases, which read these at chart-creation time and otherwise
  // wouldn't know to redraw.
  window.addEventListener('themechange', renderRoute);
  window.addEventListener('textsizechange', renderRoute);
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = getTheme() === 'dark' ? '☀️' : '🌙';
}

function updateTextSizeToggleState() {
  const btn = document.getElementById('textSizeToggleBtn');
  if (!btn) return;
  const large = getTextSize() === 'large';
  btn.setAttribute('aria-pressed', String(large));
  btn.classList.toggle('bg-indigo-600', large);
  btn.classList.toggle('text-white', large);
  btn.classList.toggle('border-indigo-600', large);
}

// Keeps the "📥 Export CSV" link's target in sync with the current search,
// so exporting after searching the board exports exactly the filtered set
// visible on screen (docs/06-ui-spec.md §1's single search box is the only
// filter this app's UI exposes — GET /api/cards/export accepts the rest of
// listCardsQuerySchema's filters too, just none of them have UI here yet).
function updateExportCsvLink(query) {
  const link = document.getElementById('exportCsvLink');
  if (!link) return;
  link.href = query ? `/api/cards/export?q=${encodeURIComponent(query)}` : '/api/cards/export';
}

async function boot() {
  store.setStatus('loading');
  renderRoute();
  try {
    const data = await api.get('/bootstrap');
    store.setBootstrap(data); // triggers populateMemberSelect via the store.subscribe in init()
  } catch (err) {
    store.setStatus('error', err);
  }
  renderRoute();
}

function init() {
  initTheme();
  updateThemeToggleIcon();
  initTextSize();
  updateTextSizeToggleState();
  bindShellEvents();
  // Member management (add/edit/deactivate/delete) now lives entirely on
  // #/members, not the header — this keeps "ฉันคือ" in sync with it without
  // members.view.js needing to know the header select even exists.
  store.subscribe(populateMemberSelect);
  if (!location.hash) location.hash = DEFAULT_ROUTE;
  boot();
}

init();
