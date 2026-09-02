// js/components/attachments.js — "📎 ไฟล์แนบ" block mounted inside
// card-modal.js (docs/06-ui-spec.md §5, docs/07-roadmap.md 5.2). Same
// self-contained mount/render/destroy shape as subtasks.js.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc } from './card.js';

// Mirrors server's .env.example MAX_UPLOAD_MB — client-side pre-check only
// (avoids an obviously-doomed upload round trip), server stays the source of truth.
const MAX_UPLOAD_MB = 10;

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function attachmentHTML(a) {
  return `
  <div class="flex items-center gap-2 mb-1 text-sm" data-attachment-id="${a.id}">
    <a href="/api/attachments/${a.id}/download" class="flex-1 hover:underline truncate">📄 ${esc(a.filename)}</a>
    <span class="text-xs text-slate-400 shrink-0">${formatSize(a.size)} · โดย ${esc(a.uploader?.name || '—')}</span>
    <button type="button" data-delete-attachment class="text-slate-400 hover:text-rose-500 text-xs shrink-0" aria-label="ลบไฟล์แนบ ${esc(a.filename)}">🗑</button>
  </div>`;
}

function blockHTML(list) {
  return `
  <div class="font-medium text-sm mb-2">📎 ไฟล์แนบ</div>
  <div data-attachment-list>${list.map(attachmentHTML).join('') || '<div class="text-xs text-slate-400 mb-2">ยังไม่มีไฟล์แนบ</div>'}</div>
  <input type="file" data-file-input class="hidden">
  <button type="button" data-add-attachment class="text-xs border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50">+ แนบไฟล์</button>`;
}

/** mountAttachmentsBlock(container, { cardId, attachments }) -> { destroy() } */
export function mountAttachmentsBlock(container, { cardId, attachments }) {
  const state = { attachments };

  function render() {
    container.innerHTML = blockHTML(state.attachments);
    bind();
  }

  async function upload(file) {
    if (!store.state.me) {
      toast.show('กรุณาเลือก "ฉันคือ" ก่อนแนบไฟล์');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.show(`ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_UPLOAD_MB}MB)`);
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('uploaderName', store.state.me);
    try {
      const attachment = await api.post(`/cards/${cardId}/attachments`, formData);
      state.attachments = [...state.attachments, attachment];
      store.bumpCardCount(cardId, 'attachments', 1);
      render();
    } catch (err) {
      toast.show(`แนบไฟล์ไม่สำเร็จ: ${err.message}`);
    }
  }

  async function remove(id) {
    try {
      await api.del(`/attachments/${id}`);
      state.attachments = state.attachments.filter((a) => a.id !== id);
      store.bumpCardCount(cardId, 'attachments', -1);
      render();
    } catch (err) {
      toast.show(`ลบไฟล์แนบไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    const fileInput = container.querySelector('[data-file-input]');
    container.querySelector('[data-add-attachment]')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) upload(file);
    });
    container.querySelectorAll('[data-delete-attachment]').forEach((el) => {
      el.addEventListener('click', () => remove(Number(el.closest('[data-attachment-id]').dataset.attachmentId)));
    });
  }

  render();

  return { destroy() {} };
}
