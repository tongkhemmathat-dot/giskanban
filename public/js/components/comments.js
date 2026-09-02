// js/components/comments.js — "💬 ความคิดเห็น" block mounted inside
// card-modal.js (docs/06-ui-spec.md §5, docs/07-roadmap.md 5.1). Same
// self-contained mount/render/destroy shape as subtasks.js.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc, avatarHTML } from './card.js';

function commentHTML(c) {
  return `
  <div class="flex gap-2 mb-2" data-comment-id="${c.id}">
    ${avatarHTML(c.author)}
    <div class="bg-slate-50 rounded-lg px-3 py-1.5 flex-1">
      <div class="text-xs font-medium flex items-center justify-between gap-2">
        <span>${esc(c.author.name)} <span class="text-slate-400 font-normal">${esc(c.createdAt || '')}</span></span>
        <button type="button" data-delete-comment class="text-slate-300 hover:text-rose-500 shrink-0" aria-label="ลบความคิดเห็นนี้">✕</button>
      </div>
      <div class="text-sm">${esc(c.body)}</div>
    </div>
  </div>`;
}

function blockHTML(list) {
  return `
  <div class="font-medium text-sm mb-2">💬 ความคิดเห็น</div>
  <div data-comment-list>${list.map(commentHTML).join('') || '<div class="text-xs text-slate-400 mb-2">ยังไม่มีความคิดเห็น</div>'}</div>
  <div class="flex gap-2 mt-2">
    <textarea data-new-comment rows="1" placeholder="แสดงความคิดเห็น..." class="flex-1 text-sm border border-slate-200 rounded-md p-2"></textarea>
    <button type="button" data-send-comment class="text-xs bg-indigo-600 text-white px-3 rounded-md hover:bg-indigo-700">ส่ง</button>
  </div>`;
}

/** mountCommentsBlock(container, { cardId, comments }) -> { destroy() } */
export function mountCommentsBlock(container, { cardId, comments }) {
  const state = { comments };

  function render() {
    container.innerHTML = blockHTML(state.comments);
    bind();
  }

  async function send() {
    if (!store.state.me) {
      toast.show('กรุณาเลือก "ฉันคือ" ก่อนแสดงความคิดเห็น');
      return;
    }
    const ta = container.querySelector('[data-new-comment]');
    const body = ta.value.trim();
    if (!body) return;
    try {
      const comment = await api.post(`/cards/${cardId}/comments`, { authorName: store.state.me, body });
      state.comments = [...state.comments, comment];
      store.bumpCardCount(cardId, 'comments', 1);
      render();
    } catch (err) {
      toast.show(`ส่งความคิดเห็นไม่สำเร็จ: ${err.message}`);
    }
  }

  async function remove(cid) {
    try {
      await api.del(`/comments/${cid}`);
      state.comments = state.comments.filter((c) => c.id !== cid);
      store.bumpCardCount(cardId, 'comments', -1);
      render();
    } catch (err) {
      toast.show(`ลบความคิดเห็นไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    container.querySelector('[data-send-comment]')?.addEventListener('click', send);
    container.querySelectorAll('[data-delete-comment]').forEach((el) => {
      el.addEventListener('click', () => remove(Number(el.closest('[data-comment-id]').dataset.commentId)));
    });
  }

  render();

  return { destroy() {} };
}
