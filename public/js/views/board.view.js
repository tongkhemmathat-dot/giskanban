// js/views/board.view.js — the 6-column Kanban board (docs/06-ui-spec.md §1, §4)
// + drag & drop between/within columns via SortableJS (docs/07-roadmap.md 4.4-4.5).
//
// Rendering is driven entirely by store.js state: mountBoard() subscribes and
// re-renders the whole board on every store change, so renderBoard() itself
// only needs to be a pure function of `store.state` (idempotent — same state
// in, same DOM out, no leaked listeners because old nodes are discarded
// wholesale each render, same pattern as public/mockup.html).

import { store, midPosition } from '../store.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { cardHTML, esc } from '../components/card.js';

let wasDragged = false;
let sortableInstances = [];

function cardsForList(listId) {
  return store.state.cards
    .filter((c) => c.listId === listId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function columnHTML(list) {
  const cards = cardsForList(list.id);
  const count = cards.length;
  const overLimit = Boolean(list.wipLimit) && count > list.wipLimit;

  return `
  <div class="flex-shrink-0 w-72 bg-slate-200/60 rounded-xl flex flex-col max-h-full">
    <div class="px-3 py-2 flex items-center justify-between">
      <span class="font-semibold text-slate-700 text-sm">${esc(list.name)}</span>
      <span class="text-xs font-medium ${overLimit ? 'text-rose-600' : 'text-slate-500'}">${count}${list.wipLimit ? `/${list.wipLimit}` : ''}</span>
    </div>
    <div class="col-body flex-1 overflow-y-auto px-2 pb-1" data-list-id="${list.id}">${cards.map(cardHTML).join('')}</div>
    <button type="button" data-add-list-id="${list.id}" class="add-card-btn mx-2 mb-2 text-xs text-slate-500 hover:text-indigo-600 hover:bg-white rounded py-1.5 text-left px-2">+ เพิ่มใบงาน</button>
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

function onBoardClick(e) {
  const addBtn = e.target.closest('.add-card-btn');
  if (addBtn) {
    // create-modal.js is out of scope for this stage (Agent 5 builds it).
    toast.show('ฟังก์ชันสร้างใบงานยังไม่พร้อมใช้งาน — รอเชื่อมต่อ create-modal');
    return;
  }
  const cardEl = e.target.closest('.card-item');
  if (cardEl) {
    if (wasDragged) {
      wasDragged = false;
      return;
    }
    // card-modal.js is out of scope for this stage (Agent 5 builds it).
    toast.show('รายละเอียดใบงานยังไม่พร้อมใช้งาน — รอเชื่อมต่อ card-modal');
  }
}

/** Pure render of the board into `root`, driven only by store.state. */
function renderBoard(root) {
  const lists = store.state.lists;
  root.innerHTML = `<div class="flex gap-3 overflow-x-auto h-full pb-2">${lists.map(columnHTML).join('')}</div>`;
  initSortable(root);
}

/**
 * Mounts the board view into `root`, subscribing to store changes.
 * Returns an unmount function that the router should call before navigating
 * away, so we don't leak Sortable instances / store subscriptions.
 */
export function mountBoard(root) {
  const rerender = () => renderBoard(root);
  const unsubscribe = store.subscribe(rerender);
  root.addEventListener('click', onBoardClick);
  rerender();

  return function unmount() {
    unsubscribe();
    root.removeEventListener('click', onBoardClick);
    destroySortables();
  };
}
