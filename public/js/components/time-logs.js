// js/components/time-logs.js — "⏱ บันทึกเวลา" block mounted inside
// card-modal.js (docs/06-ui-spec.md §5, docs/07-roadmap.md 5.3). Same
// self-contained mount/render/destroy shape as subtasks.js. `memberName` is
// implicitly store.state.me — not a picker — same reasoning as subtasks'
// `doneBy` (docs/05-business-rules.md §4.2).
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc } from './card.js';

function rowHTML(t) {
  return `
  <div class="text-xs mb-0.5 flex items-center justify-between gap-2 group" data-timelog-id="${t.id}">
    <span>${esc(t.member.name)} · ${t.hours} ชม.${t.note ? ' — ' + esc(t.note) : ''}</span>
    <button type="button" data-delete-timelog class="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 shrink-0" aria-label="ลบรายการบันทึกเวลานี้">✕</button>
  </div>`;
}

function formHTML() {
  return `
  <div class="flex items-center gap-1 mt-1">
    <input type="number" data-hours step="0.25" min="0.25" max="24" placeholder="ชม." class="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-xs">
    <input type="text" data-note placeholder="หมายเหตุ" class="flex-1 border border-slate-200 rounded px-1.5 py-0.5 text-xs min-w-0">
    <button type="button" data-save-timelog class="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700 shrink-0">บันทึก</button>
  </div>`;
}

function blockHTML(list, formOpen) {
  const total = list.reduce((sum, t) => sum + t.hours, 0);
  return `
  <div class="text-xs text-slate-500 mb-1">⏱ บันทึกเวลา (${total} ชม.)</div>
  <div data-timelog-list>${list.map(rowHTML).join('')}</div>
  ${formOpen ? formHTML() : '<button type="button" data-open-timelog-form class="text-xs text-indigo-600 hover:underline mt-1">+ บันทึกเวลา</button>'}`;
}

/** mountTimeLogsBlock(container, { cardId, timeLogs }) -> { destroy() } */
export function mountTimeLogsBlock(container, { cardId, timeLogs }) {
  const state = { timeLogs, formOpen: false };

  function render() {
    container.innerHTML = blockHTML(state.timeLogs, state.formOpen);
    bind();
  }

  async function save() {
    if (!store.state.me) {
      toast.show('กรุณาเลือก "ฉันคือ" ก่อนบันทึกเวลา');
      return;
    }
    const hours = Number(container.querySelector('[data-hours]').value);
    const note = container.querySelector('[data-note]').value.trim();
    if (!hours || hours <= 0 || hours > 24) {
      toast.show('กรุณากรอกจำนวนชั่วโมงระหว่าง 0-24');
      return;
    }
    try {
      const log = await api.post(`/cards/${cardId}/time-logs`, { memberName: store.state.me, hours, note: note || undefined });
      state.timeLogs = [...state.timeLogs, log];
      state.formOpen = false;
      render();
    } catch (err) {
      toast.show(`บันทึกเวลาไม่สำเร็จ: ${err.message}`);
    }
  }

  async function remove(tid) {
    try {
      await api.del(`/time-logs/${tid}`);
      state.timeLogs = state.timeLogs.filter((t) => t.id !== tid);
      render();
    } catch (err) {
      toast.show(`ลบรายการไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    container.querySelector('[data-open-timelog-form]')?.addEventListener('click', () => {
      state.formOpen = true;
      render();
    });
    container.querySelector('[data-save-timelog]')?.addEventListener('click', save);
    container.querySelectorAll('[data-delete-timelog]').forEach((el) => {
      el.addEventListener('click', () => remove(Number(el.closest('[data-timelog-id]').dataset.timelogId)));
    });
  }

  render();

  return { destroy() {} };
}
