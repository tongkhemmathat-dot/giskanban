// js/components/subtasks.js — the subtasks block mounted inside card-modal.js
// (docs/06-ui-spec.md §6, docs/07-roadmap.md 4.8). Fully self-contained: owns
// its own render + API calls + Sortable instance, and pushes progress/list
// changes into store.js so the board card behind the modal stays in sync —
// card-modal.js never has to know about subtask internals.
import { store, midPosition } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc } from './card.js';

function subtaskRowHTML(s) {
  const trailing = s.isDone
    ? `<span class="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">โดย ${esc(s.doneBy || '')}</span>`
    : s.assignee
      ? `<span class="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">${esc(s.assignee.name)}</span>`
      : '';
  // Always visible (not hover-only) when overdue — same reasoning as
  // card.js's slaChipHTML: actionable status the user needs to see without
  // hovering. isOverdue is server-computed (server/services/subtask.service.js).
  const overdueBadge = s.isOverdue
    ? `<span class="text-[11px] text-rose-600 dark:text-rose-400 shrink-0" title="เลยกำหนด ${esc(s.dueDate || '')}">⏰</span>`
    : '';
  return `
  <div class="subtask-row flex items-center gap-2 py-1.5 group" data-sub-id="${s.id}">
    <span class="cursor-grab text-slate-300 dark:text-slate-600 handle" aria-hidden="true">⠿</span>
    <input type="checkbox" ${s.isDone ? 'checked' : ''} data-toggle class="w-4 h-4 accent-indigo-600 shrink-0" aria-label="ติ๊กเสร็จ ${esc(s.title)}">
    <span class="flex-1 text-sm ${s.isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'dark:text-slate-200'}" data-edit-title>${esc(s.title)}</span>
    ${overdueBadge}
    ${trailing}
    <div class="subtask-actions opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
      <input type="datetime-local" data-due-date value="${s.dueDate || ''}" class="text-[10px] border border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1 py-0.5 w-32" aria-label="กำหนดเสร็จของขั้นตอน ${esc(s.title)}" title="กำหนดเสร็จ">
      <button type="button" data-delete class="text-slate-400 dark:text-slate-500 hover:text-rose-500 text-xs" aria-label="ลบขั้นตอน ${esc(s.title)}">🗑</button>
    </div>
  </div>`;
}

function blockHTML(progress, subtasks, templates) {
  const bar = progress.pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500';
  return `
  <div class="flex items-center justify-between mb-2">
    <span class="font-medium text-sm dark:text-slate-100">✅ ขั้นตอนการทำงาน ${progress.total ? `· ${progress.done}/${progress.total} · ${progress.pct}%` : ''}</span>
    <select data-template class="text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1.5 py-1" aria-label="ใช้แม่แบบขั้นตอน">
      <option value="">＋ ใช้แม่แบบ</option>
      ${templates.map((t) => `<option value="${esc(t.slug)}">${esc(t.name)}</option>`).join('')}
    </select>
  </div>
  ${progress.total ? `<div class="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2"><div class="h-full ${bar} progress-bar-fill" style="width:${progress.pct}%"></div></div>` : ''}
  <div data-subtask-list>${subtasks.map(subtaskRowHTML).join('')}</div>
  <textarea data-new-subtask placeholder="พิมพ์ขั้นตอนแล้วกด Enter · วางหลายบรรทัดพร้อมกันได้" class="w-full text-sm border border-dashed border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md p-2 mt-2" rows="2"></textarea>
  <button type="button" data-add-subtask class="mt-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">เพิ่ม</button>`;
}

/**
 * mountSubtasksBlock(container, { cardId, subtasks, progress, templates })
 * Renders + wires the whole "✅ ขั้นตอนการทำงาน" block into `container` and
 * keeps itself in sync with the server on every action. Returns
 * `{ destroy() }` — card-modal.js must call it when the modal closes so the
 * Sortable instance doesn't outlive its (about-to-be-removed) DOM.
 */
export function mountSubtasksBlock(container, { cardId, subtasks, progress, templates }) {
  let state = { subtasks, progress };
  let sortable = null;

  function destroySortable() {
    if (sortable) {
      try {
        sortable.destroy();
      } catch {
        // element already gone — nothing to do
      }
      sortable = null;
    }
  }

  // Required to make drag & drop work reliably (same finding as
  // board.view.js's initSortable — do not remove forceFallback/tolerance).
  function initSortable() {
    destroySortable();
    const listEl = container.querySelector('[data-subtask-list]');
    if (!listEl) return;
    sortable = Sortable.create(listEl, {
      handle: '.handle',
      animation: 150,
      forceFallback: true,
      fallbackTolerance: 3,
      onEnd: () => {
        const orderedIds = [...listEl.children].map((el) => Number(el.dataset.subId));
        state.subtasks = orderedIds.map((id) => state.subtasks.find((s) => s.id === id)).filter(Boolean);
        reorder(orderedIds);
      },
    });
  }

  function render() {
    container.innerHTML = blockHTML(state.progress, state.subtasks, templates);
    bind();
  }

  function syncStore(patch) {
    store.updateCardLocal(cardId, patch);
  }

  async function addTitles(raw) {
    if (!raw.split(/\r?\n/).some((line) => line.trim())) return;
    try {
      const res = await api.post(`/cards/${cardId}/subtasks`, { titles: raw.split(/\r?\n/), actorName: store.state.me || undefined });
      state.subtasks = [...state.subtasks, ...res.items];
      state.progress = res.progress;
      syncStore({ progress: state.progress });
      render();
    } catch (err) {
      toast.show(`เพิ่มขั้นตอนไม่สำเร็จ: ${err.message}`);
    }
  }

  async function toggle(sid) {
    if (!store.state.me) {
      toast.show('กรุณาเลือก "ฉันคือ" ก่อนติ๊กขั้นตอน');
      render(); // revert the checkbox — the browser already flipped it visually
      return;
    }
    try {
      const res = await api.patch(`/subtasks/${sid}/toggle`, { actorName: store.state.me });
      state.subtasks = state.subtasks.map((s) => (s.id === sid ? res.subtask : s));
      state.progress = res.progress;
      syncStore({ progress: state.progress, listId: res.card.listId });
      render();

      if (res.movedTo?.reason === 'first_subtask_done') {
        toast.show(`ย้ายไป ${res.movedTo.listName} แล้ว`);
      } else if (res.movedTo?.reason === 'all_done_suggest_review') {
        toast.show('ครบทุกขั้นตอนแล้ว 🎉', 'ย้ายไป Review', () => moveToReview());
      }
    } catch (err) {
      toast.show(`อัปเดตขั้นตอนไม่สำเร็จ: ${err.message}`);
    }
  }

  async function moveToReview() {
    const reviewList = store.state.lists.find((l) => l.slug === 'review');
    if (!reviewList) return;
    // Append to the end of Review, same as a manual drag (board.view.js's handleDrop).
    const lastPosition = store.state.cards
      .filter((c) => c.listId === reviewList.id)
      .reduce((max, c) => Math.max(max, c.position ?? 0), 0);
    const position = midPosition(lastPosition || null, null);
    try {
      await api.patch(`/cards/${cardId}/move`, { listId: reviewList.id, position, actorName: store.state.me || undefined });
      syncStore({ listId: reviewList.id, position });
      toast.show(`ย้ายไป ${reviewList.name} แล้ว`);
    } catch (err) {
      toast.show(`ย้ายไม่สำเร็จ: ${err.message}`);
    }
  }

  function editTitle(sid, el) {
    const current = state.subtasks.find((s) => s.id === sid);
    if (!current) return;
    const input = document.createElement('input');
    input.value = current.title;
    input.className = 'flex-1 text-sm border border-indigo-300 dark:border-indigo-600 dark:bg-slate-800 dark:text-slate-100 rounded px-1';
    el.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const value = input.value.trim();
      if (!value || value === current.title) {
        render();
        return;
      }
      try {
        const updated = await api.patch(`/subtasks/${sid}`, { title: value });
        state.subtasks = state.subtasks.map((s) => (s.id === sid ? updated : s));
      } catch (err) {
        toast.show(`แก้ไขไม่สำเร็จ: ${err.message}`);
      }
      render();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  }

  async function setDueDate(sid, dueDate) {
    try {
      const updated = await api.patch(`/subtasks/${sid}`, { dueDate });
      state.subtasks = state.subtasks.map((s) => (s.id === sid ? updated : s));
      render();
    } catch (err) {
      toast.show(`ตั้งกำหนดเสร็จไม่สำเร็จ: ${err.message}`);
      render(); // revert the input to the last known-good value
    }
  }

  async function remove(sid) {
    try {
      const res = await api.del(`/subtasks/${sid}`);
      state.subtasks = state.subtasks.filter((s) => s.id !== sid);
      state.progress = res.progress;
      syncStore({ progress: state.progress });
      render();
    } catch (err) {
      toast.show(`ลบขั้นตอนไม่สำเร็จ: ${err.message}`);
    }
  }

  async function applyTemplate(slug) {
    if (!slug) return;
    try {
      const res = await api.post(`/cards/${cardId}/subtasks/apply-template`, { templateSlug: slug, actorName: store.state.me || undefined });
      state.subtasks = res.items;
      state.progress = res.progress;
      syncStore({ progress: state.progress });
      render();
      toast.show(`เพิ่มขั้นตอนจากแม่แบบแล้ว ${res.added} ข้อ`);
    } catch (err) {
      toast.show(`ใช้แม่แบบไม่สำเร็จ: ${err.message}`);
    }
  }

  async function reorder(orderedIds) {
    try {
      const res = await api.patch(`/cards/${cardId}/subtasks/reorder`, { orderedIds });
      state.subtasks = res.items;
    } catch (err) {
      toast.show(`จัดลำดับไม่สำเร็จ: ${err.message}`);
      render(); // revert to last known-good order
    }
  }

  function bind() {
    container.querySelector('[data-template]')?.addEventListener('change', function onTemplateChange() {
      const slug = this.value;
      applyTemplate(slug);
    });
    container.querySelector('[data-add-subtask]')?.addEventListener('click', () => {
      addTitles(container.querySelector('[data-new-subtask]').value);
    });
    container.querySelector('[data-new-subtask]')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addTitles(e.target.value);
      }
    });
    container.querySelectorAll('[data-toggle]').forEach((el) => {
      el.addEventListener('change', () => toggle(Number(el.closest('[data-sub-id]').dataset.subId)));
    });
    container.querySelectorAll('[data-edit-title]').forEach((el) => {
      el.addEventListener('dblclick', () => editTitle(Number(el.closest('[data-sub-id]').dataset.subId), el));
    });
    container.querySelectorAll('[data-delete]').forEach((el) => {
      el.addEventListener('click', () => remove(Number(el.closest('[data-sub-id]').dataset.subId)));
    });
    container.querySelectorAll('[data-due-date]').forEach((el) => {
      el.addEventListener('change', () => setDueDate(Number(el.closest('[data-sub-id]').dataset.subId), el.value || null));
    });
    initSortable();
  }

  render();

  return {
    destroy() {
      destroySortable();
    },
  };
}
