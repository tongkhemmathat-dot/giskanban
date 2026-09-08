// js/views/calendar.view.js — ปฏิทินรวมของทีม (docs/07-roadmap.md backlog):
// รวมอีเวนต์ Outlook/M365 ของทุกสมาชิกที่เชื่อมต่อไว้ (server/services/
// calendar.service.js) เป็นมุมมองรายสัปดาห์เดียวให้หัวหน้าทีมดู. เชื่อมต่อ/
// ยกเลิกการเชื่อมต่อทำที่หน้า Members (members.view.js) — หน้านี้อ่านอย่าง
// เดียว. ไม่แตะ store.js (เหมือน recurring.view.js) เพราะไม่มีหน้าอื่นต้อง
// ใช้ข้อมูลปฏิทินร่วมด้วย.
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc } from '../components/card.js';

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

/** mountCalendar(root) -> unmount() */
export function mountCalendar(root) {
  const state = {
    weekStart: startOfWeek(new Date()),
    events: [],
    connections: [],
    hiddenMembers: new Set(),
    loading: true,
  };

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
    <div class="text-xs rounded-md px-2 py-1 border-l-2 bg-slate-50 dark:bg-slate-900/60" style="border-color:${esc(ev.memberColor || '#94a3b8')}">
      <div class="font-medium text-slate-700 dark:text-slate-200 truncate" title="${esc(ev.subject)}">${esc(ev.subject)}</div>
      <div class="text-slate-400 dark:text-slate-500">${esc(fmtTimeRange(ev))} · ${esc(ev.memberName)}</div>
    </div>`;
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

  function bind() {
    root.querySelector('[data-week-prev]')?.addEventListener('click', () => changeWeek(-1));
    root.querySelector('[data-week-next]')?.addEventListener('click', () => changeWeek(1));
    root.querySelector('[data-week-today]')?.addEventListener('click', () => {
      state.weekStart = startOfWeek(new Date());
      state.loading = true;
      render();
      loadWeek();
    });

    root.querySelectorAll('[data-member-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.memberChip);
        if (state.hiddenMembers.has(id)) state.hiddenMembers.delete(id);
        else state.hiddenMembers.add(id);
        render();
      });
    });
  }

  render(); // shows the loading state immediately
  loadWeek();

  return function unmount() {};
}
