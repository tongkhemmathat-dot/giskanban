// js/components/labels.js — "🏷 ป้ายกำกับ" block mounted inside card-modal.js
// (docs/07-roadmap.md 5.5). Same self-contained mount/render/destroy shape
// as comments.js/time-logs.js. Placed between assignees and priority in
// card-modal.js's right column — labels are card classification metadata,
// same tier as assignees.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc } from './card.js';

function chipHTML(l) {
  return `
  <span class="rounded-full px-2 py-0.5 text-xs flex items-center gap-1 font-medium" style="background:${esc(l.color)}22;color:${esc(l.color)}" data-label-id="${l.id}">
    ${esc(l.name)}
    <button type="button" data-detach-label class="hover:opacity-60" aria-label="ลบป้ายกำกับ ${esc(l.name)}">✕</button>
  </span>`;
}

function pickerHTML(available) {
  return `
  <select data-label-picker class="text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1.5 py-1 mt-1" aria-label="เพิ่มป้ายกำกับ">
    <option value="">+ ป้ายกำกับ</option>
    ${available.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}
    <option value="__new__">+ สร้างใหม่…</option>
  </select>`;
}

function blockHTML(labels) {
  const attachedIds = new Set(labels.map((l) => l.id));
  const available = store.state.labels.filter((l) => !attachedIds.has(l.id));
  return `
  <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">🏷 ป้ายกำกับ</div>
  <div data-label-chips class="flex flex-wrap gap-1 mb-1">${labels.map(chipHTML).join('')}</div>
  ${pickerHTML(available)}`;
}

/** mountLabelsBlock(container, { cardId, labels }) -> { destroy() } */
export function mountLabelsBlock(container, { cardId, labels }) {
  const state = { labels };

  function render() {
    container.innerHTML = blockHTML(state.labels);
    store.updateCardLocal(cardId, { labels: state.labels });
    bind();
  }

  async function attach(labelId) {
    try {
      const res = await api.post(`/cards/${cardId}/labels`, { labelId });
      state.labels = res.labels;
      render();
    } catch (err) {
      toast.show(`เพิ่มป้ายกำกับไม่สำเร็จ: ${err.message}`);
    }
  }

  async function createAndAttach(name) {
    try {
      const label = await api.post('/labels', { name });
      store.state.labels = [...store.state.labels, label]; // so it's available for other cards this session
      await attach(label.id);
    } catch (err) {
      toast.show(`สร้างป้ายกำกับไม่สำเร็จ: ${err.message}`);
    }
  }

  async function detach(labelId) {
    try {
      const res = await api.del(`/cards/${cardId}/labels/${labelId}`);
      state.labels = res.labels;
      render();
    } catch (err) {
      toast.show(`ลบป้ายกำกับไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    container.querySelectorAll('[data-detach-label]').forEach((el) => {
      el.addEventListener('click', () => detach(Number(el.closest('[data-label-id]').dataset.labelId)));
    });
    container.querySelector('[data-label-picker]')?.addEventListener('change', function onPickerChange() {
      const value = this.value;
      this.value = '';
      if (!value) return;
      if (value === '__new__') {
        const name = window.prompt('ชื่อป้ายกำกับใหม่:');
        if (name && name.trim()) createAndAttach(name.trim());
        return;
      }
      attach(Number(value));
    });
  }

  render();

  return { destroy() {} };
}
