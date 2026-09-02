// js/components/card-modal.js — the 2-column card detail modal
// (docs/06-ui-spec.md §5, docs/07-roadmap.md 4.7). Built once per open() from
// a full GET /api/cards/:id fetch (bootstrap's card shape has no
// subtasks/activities); each field edit PATCHes and merges the response back
// into store.js so the board card behind the modal stays in sync. Comments/
// attachments/time-logs render as placeholders — their APIs are Phase 5.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc, avatarHTML, TYPE_META, PRIORITY_META } from './card.js';
import { mountSubtasksBlock } from './subtasks.js';
import { mountCommentsBlock } from './comments.js';
import { mountAttachmentsBlock } from './attachments.js';
import { mountTimeLogsBlock } from './time-logs.js';
import { mountLabelsBlock } from './labels.js';

const ACTIVITY_TEXT = {
  card_created: () => 'สร้างใบงาน',
  card_moved: (m) => `ย้ายจาก ${esc(m?.from)} ไป ${esc(m?.to)}`,
  card_updated: () => 'แก้ไขข้อมูลใบงาน',
  assignee_added: (m) => `${esc(m?.memberName)} รับงาน`,
  assignee_removed: (m) => `${esc(m?.memberName)} ถอนตัว`,
  subtask_added: (m) => `เพิ่มขั้นตอน ${m?.count ?? ''} ข้อ`,
  subtask_done: (m) => `ติ๊กเสร็จ "${esc(m?.title)}"`,
  subtask_undone: (m) => `ติ๊กกลับ "${esc(m?.title)}"`,
  template_applied: (m) => `ใช้แม่แบบ "${esc(m?.templateName)}" (${m?.count ?? 0} ข้อ)`,
  comment_added: () => 'แสดงความคิดเห็น',
  attachment_added: (m) => `แนบไฟล์ "${esc(m?.filename)}"`,
  time_logged: (m) => `บันทึกเวลา ${m?.hours ?? ''} ชม.`,
};

function activitiesHTML(activities) {
  if (!activities?.length) return '<div class="text-[11px] text-slate-400">ยังไม่มีกิจกรรม</div>';
  return activities
    .slice(0, 5)
    .map((a) => {
      const describe = ACTIVITY_TEXT[a.action];
      const text = describe ? describe(a.meta) : esc(a.action);
      return `<div class="text-[11px] text-slate-500 mb-0.5">${esc(a.createdAt || '')} — ${esc(a.actorName || 'ระบบ')} ${text}</div>`;
    })
    .join('');
}

function assigneeChipsHTML(assignees) {
  if (!assignees?.length) return '<span class="text-xs text-slate-400">ยังไม่มีผู้รับผิดชอบ</span>';
  return assignees
    .map(
      (a) => `
    <span class="bg-white border border-slate-200 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
      ${avatarHTML(a, 'w-4 h-4 text-[8px]')}${esc(a.name)}
      <button type="button" data-remove-assignee="${a.id}" class="text-slate-300 hover:text-rose-500 ml-0.5" aria-label="ถอน ${esc(a.name)}">✕</button>
    </span>`,
    )
    .join('');
}

function toggleAssigneeLabel(assignees) {
  return (assignees || []).some((a) => a.name === store.state.me) ? '↩ ถอนตัว' : '✋ รับงานนี้';
}

function modalHTML(card) {
  const t = TYPE_META[card.type] || TYPE_META.service_request;
  return `
  <div class="fixed inset-0 modal-backdrop flex items-center justify-center z-40 p-0 md:p-4" data-close-on-backdrop>
    <div class="bg-white md:rounded-xl shadow-2xl w-full h-full md:h-auto md:max-w-4xl md:max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div class="flex items-center gap-2">
          <span class="text-[11px] px-1.5 py-0.5 rounded border ${t.chip}">${t.icon} ${esc(t.label)}</span>
          <span class="text-xs text-slate-400">${esc(card.code)}</span>
        </div>
        <button type="button" data-close-modal class="text-slate-400 hover:text-slate-700 text-lg leading-none" aria-label="ปิด">✕</button>
      </div>
      <div class="flex flex-col md:flex-row">
        <div class="flex-1 p-5 md:w-2/3">
          <h2 class="text-lg font-semibold mb-2" contenteditable="true" data-field="title">${esc(card.title)}</h2>
          <textarea class="w-full text-sm border border-slate-200 rounded-md p-2 mb-4 text-slate-600" rows="2" data-field="description" placeholder="รายละเอียด">${esc(card.description || '')}</textarea>

          <div class="mb-5" data-subtasks-root></div>

          <div class="mb-5" data-comments-root></div>
          <div data-attachments-root></div>
        </div>

        <div class="bg-slate-50 p-5 md:w-1/3 space-y-4">
          <div>
            <div class="text-xs text-slate-500 mb-1">✍️ ผู้สร้างใบงาน</div>
            <div class="bg-white border border-indigo-100 rounded-lg px-3 py-2 flex items-center gap-2">
              ${avatarHTML(card.creator)}<span class="font-medium text-sm">${esc(card.creator?.name || '—')}</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">ผู้รับผิดชอบ</div>
            <div data-assignees-list class="flex flex-wrap gap-1 mb-1">${assigneeChipsHTML(card.assignees)}</div>
            <button type="button" data-toggle-assignee class="text-xs text-indigo-600 hover:underline" ${!store.state.me ? 'disabled title="เลือก ฉันคือ ก่อน"' : ''}>
              ${toggleAssigneeLabel(card.assignees)}
            </button>
          </div>
          <div data-labels-root></div>
          <div>
            <div class="text-xs text-slate-500 mb-1">ความสำคัญ</div>
            <select data-field="priority" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5">
              ${Object.entries(PRIORITY_META).map(([k, v]) => `<option value="${k}" ${card.priority === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
            </select>
          </div>
          <div class="text-xs space-y-1.5">
            <div class="flex items-center justify-between gap-2"><span class="text-slate-500 shrink-0">กำหนดเสร็จ:</span><input type="datetime-local" data-field="dueDate" value="${card.dueDate || ''}" class="border border-slate-200 rounded px-1.5 py-0.5 text-xs min-w-0"></div>
            <div><span class="text-slate-500">SLA ครบกำหนด:</span> <span data-sla-due>${esc(card.slaDueAt || '—')}</span></div>
            <div class="flex items-center justify-between gap-2"><span class="text-slate-500 shrink-0">Site:</span><input data-field="site" value="${esc(card.site || '')}" class="border border-slate-200 rounded px-1.5 py-0.5 text-xs w-32 min-w-0"></div>
            <div class="flex items-center justify-between gap-2"><span class="text-slate-500 shrink-0">Device:</span><input data-field="deviceRef" value="${esc(card.deviceRef || '')}" class="border border-slate-200 rounded px-1.5 py-0.5 text-xs w-32 min-w-0"></div>
            <div class="flex items-center justify-between gap-2"><span class="text-slate-500 shrink-0">ลูกค้า:</span><input data-field="customer" value="${esc(card.customer || '')}" class="border border-slate-200 rounded px-1.5 py-0.5 text-xs w-32 min-w-0"></div>
            <div class="flex items-center justify-between gap-2"><span class="text-slate-500 shrink-0">เลขโครงการ:</span><input data-field="projectCode" value="${esc(card.projectCode || '')}" placeholder="E26-1234" class="border border-slate-200 rounded px-1.5 py-0.5 text-xs w-32 min-w-0 uppercase"></div>
          </div>
          <div data-timelogs-root></div>
          <div>
            <div class="text-xs text-slate-500 mb-1">📜 กิจกรรมล่าสุด</div>
            <div data-activities>${activitiesHTML(card.activities)}</div>
          </div>
          <button type="button" data-delete-card class="text-xs text-rose-600 hover:underline">🗑 ลบใบงาน</button>
        </div>
      </div>
    </div>
  </div>`;
}

function refreshAssignees(root, card) {
  const list = root.querySelector('[data-assignees-list]');
  if (list) list.innerHTML = assigneeChipsHTML(card.assignees);
  const btn = root.querySelector('[data-toggle-assignee]');
  if (btn) btn.textContent = toggleAssigneeLabel(card.assignees);
}

async function patchField(cardId, root, field, value) {
  try {
    const updated = await api.patch(`/cards/${cardId}`, { [field]: value, actorName: store.state.me || undefined });
    store.updateCardLocal(cardId, updated);
    const slaEl = root.querySelector('[data-sla-due]');
    if (slaEl) slaEl.textContent = updated.slaDueAt || '—';
    return updated;
  } catch (err) {
    toast.show(`บันทึกไม่สำเร็จ: ${err.message}`);
    return null;
  }
}

function bindEvents(root, card, close) {
  // Named (not inline) so closeCardModal() can remove exactly this listener —
  // #modal-root is a persistent node (only its innerHTML is replaced on
  // open/close), so an un-removed delegated listener here would accumulate
  // across every open() call, each firing with its own stale `card` closure.
  rootClickHandler = (e) => {
    if (e.target.hasAttribute('data-close-on-backdrop') || e.target.closest('[data-close-modal]')) {
      close();
      return;
    }

    if (e.target.closest('[data-delete-card]')) {
      if (!window.confirm('ยืนยันลบใบงานนี้? การกระทำนี้ย้อนกลับไม่ได้')) return;
      api
        .del(`/cards/${card.id}`)
        .then(() => {
          store.removeCardLocal(card.id);
          close();
          toast.show('ลบใบงานแล้ว');
        })
        .catch((err) => toast.show(`ลบไม่สำเร็จ: ${err.message}`));
      return;
    }

    const removeBtn = e.target.closest('[data-remove-assignee]');
    if (removeBtn) {
      api
        .del(`/cards/${card.id}/assignees/${Number(removeBtn.dataset.removeAssignee)}`)
        .then((res) => {
          card.assignees = res.assignees;
          refreshAssignees(root, card);
          store.updateCardLocal(card.id, { assignees: res.assignees });
        })
        .catch((err) => toast.show(`ถอนตัวไม่สำเร็จ: ${err.message}`));
      return;
    }

    if (e.target.closest('[data-toggle-assignee]')) {
      if (!store.state.me) return;
      const mine = (card.assignees || []).find((a) => a.name === store.state.me);
      const req = mine
        ? api.del(`/cards/${card.id}/assignees/${mine.id}`)
        : api.post(`/cards/${card.id}/assignees`, { memberName: store.state.me });
      req
        .then((res) => {
          card.assignees = res.assignees;
          refreshAssignees(root, card);
          store.updateCardLocal(card.id, { assignees: res.assignees });
        })
        .catch((err) => toast.show(`ดำเนินการไม่สำเร็จ: ${err.message}`));
    }
  };
  root.addEventListener('click', rootClickHandler);

  root.querySelector('[data-field="title"]').addEventListener('blur', function onTitleBlur() {
    const value = this.innerText.trim();
    if (!value) {
      this.innerText = card.title;
      return;
    }
    const el = this;
    patchField(card.id, root, 'title', value).then((updated) => {
      if (updated) card.title = updated.title;
      else el.innerText = card.title; // PATCH failed — revert the visible edit
    });
  });

  root.querySelector('[data-field="description"]').addEventListener('blur', function onDescriptionBlur() {
    patchField(card.id, root, 'description', this.value.trim() || null);
  });

  root.querySelector('[data-field="priority"]').addEventListener('change', function onPriorityChange() {
    patchField(card.id, root, 'priority', this.value);
  });

  for (const field of ['site', 'deviceRef', 'customer', 'projectCode']) {
    root.querySelector(`[data-field="${field}"]`).addEventListener('blur', function onFieldBlur() {
      patchField(card.id, root, field, this.value.trim() || null);
    });
  }

  root.querySelector('[data-field="dueDate"]').addEventListener('change', function onDueDateChange() {
    patchField(card.id, root, 'dueDate', this.value || null);
  });
}

let mountedHandles = [];
let rootClickHandler = null;

function onKeydown(e) {
  if (e.key === 'Escape') closeCardModal();
}

function closeCardModal() {
  mountedHandles.forEach((h) => h.destroy());
  mountedHandles = [];
  const root = document.getElementById('modal-root');
  if (rootClickHandler) {
    root.removeEventListener('click', rootClickHandler);
    rootClickHandler = null;
  }
  root.innerHTML = '';
  document.removeEventListener('keydown', onKeydown);
}

export async function openCardModal(cardId) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="fixed inset-0 modal-backdrop flex items-center justify-center z-40 p-4"><div class="text-white text-sm">กำลังโหลด…</div></div>`;

  let card;
  try {
    card = await api.get(`/cards/${cardId}`);
  } catch (err) {
    root.innerHTML = '';
    toast.show(`โหลดใบงานไม่สำเร็จ: ${err.message}`);
    return;
  }

  root.innerHTML = modalHTML(card);
  bindEvents(root, card, closeCardModal);
  document.addEventListener('keydown', onKeydown);

  mountedHandles = [
    mountSubtasksBlock(root.querySelector('[data-subtasks-root]'), {
      cardId: card.id,
      subtasks: card.subtasks,
      progress: card.progress,
      templates: store.state.templates,
    }),
    mountCommentsBlock(root.querySelector('[data-comments-root]'), { cardId: card.id, comments: card.comments }),
    mountAttachmentsBlock(root.querySelector('[data-attachments-root]'), { cardId: card.id, attachments: card.attachments }),
    mountTimeLogsBlock(root.querySelector('[data-timelogs-root]'), { cardId: card.id, timeLogs: card.timeLogs }),
    mountLabelsBlock(root.querySelector('[data-labels-root]'), { cardId: card.id, labels: card.labels }),
  ];
}
