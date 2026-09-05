// js/views/board.view.js — the 6-column Kanban board (docs/06-ui-spec.md §1, §4)
// + drag & drop between/within columns via SortableJS (docs/07-roadmap.md 4.4-4.5).
//
// Rendering is driven entirely by store.js state: mountBoard() subscribes and
// re-renders the whole board on every store change, so renderBoard() itself
// only needs to be a pure function of `store.state` (idempotent — same state
// in, same DOM out, no leaked listeners because old nodes are discarded
// wholesale each render, same pattern as public/mockup.html).

import { store, midPosition, GAP } from '../store.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { cardHTML, esc, staleDays } from '../components/card.js';
import { openCreateModal } from '../components/create-modal.js';
import { openCardModal } from '../components/card-modal.js';

let wasDragged = false;
let sortableInstances = [];

// Bulk select (docs/07-roadmap.md backlog: "bulk action บนบอร์ด") — view-only
// UI state, same precedent as wasDragged/sortableInstances above: not
// everything belongs in store.js, just what other views/components need to
// react to. No new backend endpoint: this loops the existing single-card
// move/assignee endpoints, which is plenty fast for a 5-15 person team's board.
let selectMode = false;
const selectedIds = new Set();
let rerenderBoard = () => {};

// docs/06-ui-spec.md §1's single search box covers title/site/device/code/creator
// (docs/07-roadmap.md 4.9). The quick-filter chips below (backlog idea) are a
// second, independent filter dimension that ANDs with this search box.
function matchesSearch(card, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [card.title, card.site, card.deviceRef, card.code, card.creator?.name]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

// One-at-a-time quick filter (docs/07-roadmap.md backlog: "ปุ่มกรองด่วนบน
// board") — click again to clear. Pure frontend: every field it reads
// (priority/slaStatus/creator/assignees/lastActivityAt) is already in every
// card from GET /api/bootstrap, no new endpoint or query param needed.
let quickFilter = null; // null | 'mine' | 'critical' | 'overdue' | 'stale'
const QUICK_FILTERS = [
  { key: 'mine', label: '👤 ของฉัน' },
  { key: 'critical', label: '🔴 วิกฤต' },
  { key: 'overdue', label: '⏰ เกินกำหนด' },
  { key: 'stale', label: '🕸 ค้างนาน' },
];

function matchesQuickFilter(card) {
  if (quickFilter === 'mine') {
    const me = store.state.me;
    return !!me && (card.creator?.name === me || (card.assignees || []).some((a) => a.name === me));
  }
  if (quickFilter === 'critical') return card.priority === 'critical';
  if (quickFilter === 'overdue') return card.slaStatus === 'overdue';
  if (quickFilter === 'stale') return staleDays(card) != null;
  return true;
}

function cardsForList(listId) {
  const query = store.state.searchQuery;
  return store.state.cards
    .filter((c) => c.listId === listId && matchesSearch(c, query) && matchesQuickFilter(c))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

// คำอธิบายภาษาไทยของแต่ละคอลัมน์ ผูกกับ slug ที่ seed ไว้คงที่ (server/db/seed.js)
// ใช้เป็น subtitle ใต้ชื่อคอลัมน์ ไม่แก้ชื่อจริงใน DB
const LIST_DESCRIPTIONS = {
  backlog: 'งานที่รอเข้าคิว ยังไม่เริ่มทำ',
  todo: 'งานที่พร้อมเริ่มทำได้เลย',
  doing: 'กำลังดำเนินการอยู่',
  waiting: 'รอฝั่งผู้ให้บริการ/หน่วยงานภายนอก',
  review: 'ทำเสร็จแล้ว รอตรวจสอบ',
  done: 'เสร็จสมบูรณ์',
};

function columnHTML(list) {
  const cards = cardsForList(list.id);
  const count = cards.length;
  const overLimit = Boolean(list.wipLimit) && count > list.wipLimit;
  const description = LIST_DESCRIPTIONS[list.slug];

  // Responsive column width per docs/06-ui-spec.md §10: mobile (<768px)
  // near-viewport-width + scroll-snap so columns page one at a time,
  // tablet (768-1279px) fixed 260px, desktop (>=1280px) the original 288px.
  return `
  <div class="flex-shrink-0 w-[85vw] md:w-[260px] xl:w-72 snap-start bg-slate-200/60 dark:bg-slate-800/60 rounded-xl flex flex-col max-h-full">
    <div class="px-3 py-2">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-slate-700 dark:text-slate-200 text-sm">${esc(list.name)}</span>
        <span class="text-xs font-medium ${overLimit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}">${count}${list.wipLimit ? `/${list.wipLimit}` : ''}</span>
      </div>
      ${description ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${esc(description)}</div>` : ''}
    </div>
    <div class="col-body flex-1 overflow-y-auto px-2 pb-1" data-list-id="${list.id}">${cards.map((c) => cardHTML(c, { selectable: selectMode, selected: selectedIds.has(c.id) })).join('')}</div>
    <button type="button" data-add-list-id="${list.id}" class="add-card-btn mx-2 mb-2 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded py-1.5 text-left px-2">+ เพิ่มใบงาน</button>
  </div>`;
}

function destroySortables() {
  sortableInstances.forEach((s) => {
    try {
      s.destroy();
    } catch {
      // element already gone — nothing to do
    }
  });
  sortableInstances = [];
}

function initSortable(root) {
  destroySortables();
  root.querySelectorAll('.col-body').forEach((el) => {
    const instance = Sortable.create(el, {
      group: 'board',
      animation: 150,
      // Required to make drag & drop work reliably — confirmed by hand-testing
      // in public/mockup.html. Do not remove.
      forceFallback: true,
      fallbackTolerance: 3,
      onStart: () => {
        wasDragged = true;
      },
      onEnd: (evt) => {
        handleDrop(evt);
        setTimeout(() => {
          wasDragged = false;
        }, 50);
      },
    });
    sortableInstances.push(instance);
  });
}

// Supervisor guardrail (docs/05-business-rules.md §4.3 backlog note): warn —
// never block, per CLAUDE.md's low-friction philosophy — before a card lands
// in a `isDone` column with its checklist incomplete or missing entirely,
// since that's exactly the kind of "closed but not actually finished" work a
// หัวหน้า can't easily catch after the fact. Shared by handleDrop (single
// drag) and handleBulkMove (one combined confirm for the whole batch) below.
function incompleteSubtasksWarning(card) {
  const prog = card.progress || { done: 0, total: 0 };
  if (prog.total === 0) return `"${card.title}" ยังไม่มีขั้นตอนการทำงานเลย`;
  if (prog.done < prog.total) return `"${card.title}" ยังทำไม่ครบทุกขั้นตอน (${prog.done}/${prog.total})`;
  return null;
}

async function handleDrop(evt) {
  const cardId = Number(evt.item.dataset.cardId);
  const newListId = Number(evt.to.dataset.listId);
  const oldListId = Number(evt.from.dataset.listId);
  const siblingIds = [...evt.to.children]
    .map((el) => Number(el.dataset.cardId))
    .filter((id) => Number.isFinite(id));

  const card = store.getCard(cardId);
  if (!card) return;
  const cardTitle = card.title;

  if (oldListId !== newListId && store.getList(newListId)?.isDone) {
    const warning = incompleteSubtasksWarning(card);
    if (warning && !window.confirm(`${warning} ยืนยันย้ายไป ${store.getList(newListId)?.name} หรือไม่?`)) {
      rerenderBoard(); // undo Sortable's own DOM move — store state never changed
      return;
    }
  }

  const idx = siblingIds.indexOf(cardId);
  const prevCard = idx > 0 ? store.getCard(siblingIds[idx - 1]) : null;
  const nextCard = idx >= 0 && idx < siblingIds.length - 1 ? store.getCard(siblingIds[idx + 1]) : null;
  const newPosition = midPosition(prevCard ? prevCard.position : null, nextCard ? nextCard.position : null);

  // Optimistic update — store.moveCardLocal() mutates + emits, which re-renders
  // the board through the subscription set up in mountBoard().
  const prevSnapshot = store.moveCardLocal(cardId, newListId, newPosition);

  try {
    await api.patch(`/cards/${cardId}/move`, {
      listId: newListId,
      position: newPosition,
      actorName: store.state.me || 'ไม่ระบุ',
    });
    if (oldListId !== newListId) {
      const newList = store.getList(newListId);
      toast.show(`ย้าย "${cardTitle}" ไป ${newList ? newList.name : ''} แล้ว`);
    }
  } catch (err) {
    // Roll back to where it was before the optimistic move.
    if (prevSnapshot) store.moveCardLocal(cardId, prevSnapshot.listId, prevSnapshot.position);
    toast.show(`ย้ายใบงานไม่สำเร็จ: ${err.message || 'เกิดข้อผิดพลาด'}`);
  }
}

function quickFilterBarHTML() {
  return QUICK_FILTERS.map((f) => {
    const active = quickFilter === f.key;
    return `<button type="button" data-quick-filter="${f.key}" class="text-xs rounded-full px-2.5 py-1 border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}">${f.label}</button>`;
  }).join('');
}

function toolbarHTML() {
  if (!selectMode) {
    return `
    <div class="flex flex-wrap items-center gap-1.5 mb-2">
      <button type="button" data-enter-select class="text-xs border border-slate-300 dark:border-slate-600 dark:text-slate-200 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700">☑️ เลือกหลายใบ</button>
      <span class="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></span>
      ${quickFilterBarHTML()}
    </div>`;
  }
  const listOptions = store.state.lists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  const memberOptions = store.state.members.map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
  return `
  <div class="flex flex-wrap items-center gap-2 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm">
    <span class="font-medium dark:text-slate-100">เลือกแล้ว ${selectedIds.size} ใบ</span>
    <select data-bulk-list class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-xs px-2 py-1"><option value="">ย้ายไปคอลัมน์...</option>${listOptions}</select>
    <button type="button" data-bulk-move-btn class="text-xs border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 rounded-md px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-900" ${selectedIds.size ? '' : 'disabled'}>ย้าย</button>
    <select data-bulk-member class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-xs px-2 py-1"><option value="">มอบหมายให้...</option>${memberOptions}</select>
    <button type="button" data-bulk-assign-btn class="text-xs border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 rounded-md px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-900" ${selectedIds.size ? '' : 'disabled'}>มอบหมาย</button>
    <button type="button" data-exit-select class="text-xs text-slate-500 dark:text-slate-400 hover:underline ml-auto">ยกเลิก</button>
  </div>`;
}

// Appends to the end of the target list, spacing later ids further out so a
// multi-card move lands in selection order — same GAP convention as
// midPosition()/handleDrop() above, no reorder-within-batch logic needed.
function endOfListPosition(listId, offset) {
  const cards = store.state.cards.filter((c) => c.listId === listId);
  const maxPos = cards.length ? Math.max(...cards.map((c) => c.position ?? 0)) : null;
  return midPosition(maxPos, null) + offset * GAP;
}

async function handleBulkMove(listId) {
  const ids = [...selectedIds];
  const targetList = store.getList(listId);

  if (targetList?.isDone) {
    const incompleteCount = ids.filter((id) => incompleteSubtasksWarning(store.getCard(id))).length;
    if (incompleteCount > 0 && !window.confirm(`มี ${incompleteCount} ใบงานที่ยังทำไม่ครบทุกขั้นตอน ยืนยันย้ายไป ${targetList.name} ทั้งหมดหรือไม่?`)) {
      return;
    }
  }

  let okCount = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const position = endOfListPosition(listId, i);
      await api.patch(`/cards/${id}/move`, { listId, position, actorName: store.state.me || 'ไม่ระบุ' });
      store.moveCardLocal(id, listId, position);
      okCount++;
    } catch (err) {
      toast.show(`ย้าย ${store.getCard(id)?.code ?? id} ไม่สำเร็จ: ${err.message}`);
    }
  }
  if (okCount) toast.show(`ย้าย ${okCount} ใบงานไป ${targetList?.name ?? ''} แล้ว`);
  selectedIds.clear();
  rerenderBoard();
}

async function handleBulkAssign(memberName) {
  const ids = [...selectedIds];
  let okCount = 0;
  for (const id of ids) {
    try {
      const res = await api.post(`/cards/${id}/assignees`, { memberName, actorName: store.state.me || undefined });
      store.updateCardLocal(id, { assignees: res.assignees });
      okCount++;
    } catch (err) {
      toast.show(`มอบหมาย ${store.getCard(id)?.code ?? id} ไม่สำเร็จ: ${err.message}`);
    }
  }
  if (okCount) toast.show(`มอบหมายให้ ${memberName} แล้ว ${okCount} ใบงาน`);
  selectedIds.clear();
  rerenderBoard();
}

function onBoardClick(e) {
  const filterBtn = e.target.closest('[data-quick-filter]');
  if (filterBtn) {
    const key = filterBtn.dataset.quickFilter;
    quickFilter = quickFilter === key ? null : key; // click again to clear
    rerenderBoard();
    return;
  }
  if (e.target.closest('[data-enter-select]')) {
    selectMode = true;
    rerenderBoard();
    return;
  }
  if (e.target.closest('[data-exit-select]')) {
    selectMode = false;
    selectedIds.clear();
    rerenderBoard();
    return;
  }
  if (e.target.closest('[data-bulk-move-btn]')) {
    const listId = Number(document.querySelector('[data-bulk-list]')?.value);
    if (listId && selectedIds.size) handleBulkMove(listId);
    return;
  }
  if (e.target.closest('[data-bulk-assign-btn]')) {
    const memberName = document.querySelector('[data-bulk-member]')?.value;
    if (memberName && selectedIds.size) handleBulkAssign(memberName);
    return;
  }

  const addBtn = e.target.closest('.add-card-btn');
  if (addBtn) {
    openCreateModal(Number(addBtn.dataset.addListId));
    return;
  }
  const cardEl = e.target.closest('.card-item');
  if (cardEl) {
    if (wasDragged) {
      wasDragged = false;
      return;
    }
    const cardId = Number(cardEl.dataset.cardId);
    if (selectMode) {
      if (selectedIds.has(cardId)) selectedIds.delete(cardId);
      else selectedIds.add(cardId);
      rerenderBoard();
      return;
    }
    openCardModal(cardId);
  }
}

/** Pure render of the board into `root`, driven only by store.state + local select state. */
function renderBoard(root) {
  const lists = store.state.lists;
  root.innerHTML = `${toolbarHTML()}<div class="flex gap-3 overflow-x-auto h-full pb-2 snap-x snap-mandatory md:snap-none">${lists.map(columnHTML).join('')}</div>`;
  if (selectMode) destroySortables(); // dragging and multi-select don't mix
  else initSortable(root);
}

/**
 * Mounts the board view into `root`, subscribing to store changes.
 * Returns an unmount function that the router should call before navigating
 * away, so we don't leak Sortable instances / store subscriptions.
 */
export function mountBoard(root) {
  selectMode = false;
  selectedIds.clear();
  const rerender = () => renderBoard(root);
  rerenderBoard = rerender;
  const unsubscribe = store.subscribe(rerender);
  root.addEventListener('click', onBoardClick);
  rerender();

  return function unmount() {
    unsubscribe();
    root.removeEventListener('click', onBoardClick);
    destroySortables();
  };
}
