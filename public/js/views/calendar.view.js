// js/views/calendar.view.js — ปฏิทินรวมของทีม (docs/07-roadmap.md backlog):
// รวมอีเวนต์ Outlook/M365 ของทุกสมาชิกที่เชื่อมต่อไว้ (server/services/
// calendar.service.js) เป็นมุมมองรายสัปดาห์เดียวให้หัวหน้าทีมดู. เชื่อมต่อ/
// ยกเลิกการเชื่อมต่อทำที่หน้า Members (members.view.js) — หน้านี้อ่านอย่าง
// เดียว. ไม่แตะ store.js เอง (เหมือน recurring.view.js) เพราะไม่มีหน้าอื่นต้อง
// ใช้ข้อมูลปฏิทินร่วมด้วย — แต่เรียก openCreateModal() (create-modal.js) ได้
// ตรงๆ เพราะ store ถูก populate ไว้ทั้งแอปตั้งแต่ app.js's boot() แล้ว
// (ไม่ต้องรอหน้านี้โหลดเอง).
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc } from '../components/card.js';
import { openCreateModal } from '../components/create-modal.js';

const DAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // shift back to Monday
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDayHeader(d) {
  return `${DAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

function fmtWeekRangeLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startLabel = `${weekStart.getDate()}${sameMonth ? '' : ' ' + MONTH_SHORT[weekStart.getMonth()]}`;
  return `${startLabel} – ${weekEnd.getDate()} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
}

function fmtTimeRange(ev) {
  if (ev.isAllDay) return 'ทั้งวัน';
  const time = (s) => (s || '').slice(11, 16);
  return `${time(ev.startAt)}–${time(ev.endAt)}`;
}

function fmtEventDateTimeFull(ev) {
  const start = new Date((ev.startAt || '').replace(' ', 'T'));
  const dayLabel = `${DAY_LABELS[(start.getDay() + 6) % 7]} ${start.getDate()} ${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()}`;
  return ev.isAllDay ? `${dayLabel} (ทั้งวัน)` : `${dayLabel} · ${fmtTimeRange(ev)} น.`;
}

/** mountCalendar(root) -> unmount() */
export function mountCalendar(root) {
  const state = {
    weekStart: startOfWeek(new Date()),
    events: [],
    connections: [],
    hiddenMembers: new Set(),
    loading: true,
    syncing: false,
  };

  // รายงาน CSV ของสัปดาห์ที่กำลังดูอยู่ (ช่วงเดียวกับที่ loadWeek() ดึงมาแสดง)
  // — หัวหน้าทีมขอรายงานงานของแต่ละคนจากปฏิทิน เพราะบางงานเป็นการประชุมที่
  // ไม่ได้สร้างเป็นใบงานในระบบ.
  function exportUrl() {
    const start = fmtISODate(state.weekStart);
    const end = fmtISODate(addDays(state.weekStart, 6));
    return `/api/calendar/events/export?start=${start}&end=${end}`;
  }

  function eventsByDay() {
    const byDay = new Map();
    for (const d of Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i))) {
      byDay.set(fmtISODate(d), []);
    }
    for (const ev of state.events) {
      if (state.hiddenMembers.has(ev.memberId)) continue;
      const key = (ev.startAt || '').slice(0, 10);
      if (byDay.has(key)) byDay.get(key).push(ev);
    }
    for (const list of byDay.values()) list.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
    return byDay;
  }

  function filterChipsHTML() {
    if (!state.connections.length) return '';
    return state.connections
      .map((c) => {
        const active = !state.hiddenMembers.has(c.memberId);
        return `
        <button type="button" data-member-chip="${c.memberId}" class="text-xs px-2 py-1 rounded-full border flex items-center gap-1.5 shrink-0
          ${active ? 'border-slate-300 dark:border-slate-600 dark:text-slate-200' : 'opacity-40 border-slate-200 dark:border-slate-700 dark:text-slate-500'}">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${esc(c.memberColor || '#94a3b8')}"></span>${esc(c.memberName)}
        </button>`;
      })
      .join('');
  }

  function needsReconnectHTML() {
    const stale = state.connections.filter((c) => c.status === 'needs_reconnect');
    if (!stale.length) return '';
    const names = stale.map((c) => esc(c.memberName)).join(', ');
    return `
    <div class="mb-3 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
      ⚠️ ปฏิทินของ ${names} ต้องเชื่อมต่อใหม่ — ไปที่หน้า <a href="#/members" class="underline">สมาชิก</a>
    </div>`;
  }

  function eventChipHTML(ev) {
    return `
    <button type="button" data-event-idx="${ev._idx}" class="w-full text-left text-xs rounded-md px-2 py-1 border-l-2 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800" style="border-color:${esc(ev.memberColor || '#94a3b8')}">
      <div class="font-medium text-slate-700 dark:text-slate-200 truncate" title="${esc(ev.subject)}">${esc(ev.subject)}</div>
      <div class="text-slate-400 dark:text-slate-500">${esc(fmtTimeRange(ev))} · ${esc(ev.memberName)}</div>
    </button>`;
  }

  function dayColumnHTML(day, events) {
    const isToday = fmtISODate(day) === fmtISODate(new Date());
    return `
    <div class="flex flex-col gap-1.5 min-h-[8rem]">
      <div class="text-xs font-medium text-center pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-700 ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}">
        ${esc(fmtDayHeader(day))}
      </div>
      ${events.map(eventChipHTML).join('') || '<div class="text-xs text-slate-300 dark:text-slate-600 text-center pt-2">—</div>'}
    </div>`;
  }

  function gridHTML() {
    const byDay = eventsByDay();
    const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
    return `
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div class="grid grid-cols-7 gap-3">
        ${days.map((d) => dayColumnHTML(d, byDay.get(fmtISODate(d)))).join('')}
      </div>
    </div>`;
  }

  function emptyStateHTML() {
    return `
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center">
      <div class="text-sm text-slate-500 dark:text-slate-400 mb-3">ยังไม่มีสมาชิกเชื่อมต่อปฏิทิน Outlook</div>
      <a href="#/members" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">ไปที่หน้าสมาชิกเพื่อเชื่อมต่อ →</a>
    </div>`;
  }

  function bodyHTML() {
    if (state.loading) {
      return '<div class="text-sm text-slate-400 dark:text-slate-500">กำลังโหลด…</div>';
    }
    return `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold dark:text-slate-100">ปฏิทินทีม</h2>
      <div class="flex items-center gap-2">
        <button type="button" data-week-prev class="text-sm px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">‹</button>
        <button type="button" data-week-today class="text-sm px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">วันนี้</button>
        <span class="text-sm text-slate-600 dark:text-slate-300 w-40 text-center">${esc(fmtWeekRangeLabel(state.weekStart))}</span>
        <button type="button" data-week-next class="text-sm px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">›</button>
        ${state.connections.length ? `
        <button type="button" data-sync-now ${state.syncing ? 'disabled' : ''} class="text-sm px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
          ${state.syncing ? 'กำลังซิงก์…' : '↻ ซิงก์'}
        </button>
        <a href="${exportUrl()}" class="text-sm border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-slate-200" aria-label="ส่งออก CSV">📥 Export CSV</a>` : ''}
      </div>
    </div>
    ${state.connections.length ? `<div class="mb-3 flex flex-wrap gap-2">${filterChipsHTML()}</div>` : ''}
    ${needsReconnectHTML()}
    ${state.connections.length ? gridHTML() : emptyStateHTML()}`;
  }

  function render() {
    root.innerHTML = bodyHTML();
    bind();
  }

  async function loadWeek() {
    const start = fmtISODate(state.weekStart);
    const end = fmtISODate(addDays(state.weekStart, 6));
    try {
      const [connectionsRes, eventsRes] = await Promise.all([api.get('/calendar/connections'), api.get(`/calendar/events?start=${start}&end=${end}`)]);
      state.connections = connectionsRes.items;
      state.events = eventsRes.items;
      state.events.forEach((ev, i) => (ev._idx = i)); // stable per-render key so an event chip can look itself back up
    } catch (err) {
      toast.show(`โหลดปฏิทินไม่สำเร็จ: ${err.message}`);
      state.connections = [];
      state.events = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  function changeWeek(deltaWeeks) {
    state.weekStart = addDays(state.weekStart, deltaWeeks * 7);
    state.loading = true;
    render();
    loadWeek();
  }

  // CALENDAR_POLL_MINUTES's background auto-sync (server/index.js) can't run
  // reliably on Vercel's serverless runtime — no persistent process to host
  // the timer — so this is the only way events actually refresh there.
  async function syncNow() {
    state.syncing = true;
    render();
    try {
      const { synced, failed } = await api.post('/calendar/sync');
      toast.show(failed ? `ซิงก์แล้ว ${synced} คน, ล้มเหลว ${failed} คน` : `ซิงก์ปฏิทินสำเร็จ (${synced} คน)`);
      await loadWeek(); // loadWeek() also clears state.loading/renders
    } catch (err) {
      toast.show(`ซิงก์ไม่สำเร็จ: ${err.message}`);
    } finally {
      state.syncing = false;
      render();
    }
  }

  function bind() {
    root.querySelector('[data-week-prev]')?.addEventListener('click', () => changeWeek(-1));
    root.querySelector('[data-week-next]')?.addEventListener('click', () => changeWeek(1));
    root.querySelector('[data-week-today]')?.addEventListener('click', () => {
      state.weekStart = startOfWeek(new Date());
      state.loading = true;
      render();
      loadWeek();
    });
    root.querySelector('[data-sync-now]')?.addEventListener('click', syncNow);

    root.querySelectorAll('[data-member-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.memberChip);
        if (state.hiddenMembers.has(id)) state.hiddenMembers.delete(id);
        else state.hiddenMembers.add(id);
        render();
      });
    });

    root.querySelectorAll('[data-event-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ev = state.events[Number(btn.dataset.eventIdx)];
        if (ev) showEventDetail(ev);
      });
    });
  }

  // Event detail popup — separate #modal-root user from create-modal.js's
  // own open/close, with the same pattern (own keydown/backdrop-click
  // handlers, explicit cleanup) so the two never leak listeners into each
  // other when "+ สร้างใบงาน" swaps one for the other in the same root.
  let detailHandlers = null;

  function closeEventDetail() {
    if (!detailHandlers) return;
    document.removeEventListener('keydown', detailHandlers.onKeydown);
    document.getElementById('modal-root').removeEventListener('click', detailHandlers.onClick);
    document.getElementById('modal-root').innerHTML = '';
    detailHandlers = null;
  }

  function createCardFromEvent(ev) {
    closeEventDetail();
    openCreateModal(undefined, {
      title: ev.subject,
      description: ev.location ? `จากปฏิทิน — ${ev.location}` : 'จากปฏิทิน',
      dueDate: ev.isAllDay ? undefined : ev.startAt,
      assigneeNames: [ev.memberName],
    });
  }

  function showEventDetail(ev) {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = `
    <div class="fixed inset-0 modal-backdrop flex items-center justify-center z-40 p-4" data-close-on-backdrop>
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-5">
        <div class="flex items-start justify-between gap-2 mb-3">
          <h3 class="text-base font-semibold dark:text-slate-100 break-words">${esc(ev.subject)}</h3>
          <button type="button" data-close-modal class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none shrink-0" aria-label="ปิด">✕</button>
        </div>
        <div class="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${esc(ev.memberColor || '#94a3b8')}"></span>${esc(ev.memberName)}
          </div>
          <div>🕐 ${esc(fmtEventDateTimeFull(ev))}</div>
          ${ev.location ? `<div>📍 ${esc(ev.location)}</div>` : ''}
        </div>
        <div class="flex justify-end gap-2 pt-4 mt-3 border-t border-slate-100 dark:border-slate-700">
          <button type="button" data-close-modal class="text-sm px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">ปิด</button>
          <button type="button" data-create-from-event class="text-sm px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">+ สร้างใบงาน</button>
        </div>
      </div>
    </div>`;

    const onKeydown = (e) => {
      if (e.key === 'Escape') closeEventDetail();
    };
    const onClick = (e) => {
      if (e.target.hasAttribute('data-close-on-backdrop') || e.target.closest('[data-close-modal]')) {
        closeEventDetail();
      } else if (e.target.closest('[data-create-from-event]')) {
        createCardFromEvent(ev);
      }
    };
    document.addEventListener('keydown', onKeydown);
    modalRoot.addEventListener('click', onClick);
    detailHandlers = { onKeydown, onClick };
  }

  render(); // shows the loading state immediately
  loadWeek();

  return function unmount() {
    closeEventDetail();
  };
}
