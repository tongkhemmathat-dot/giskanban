// js/views/templates.view.js — "หน้าจัดการแม่แบบจากในเว็บ"
// (docs/07-roadmap.md backlog). The templates CRUD API has existed since
// Phase 3.7 (server/services/template.service.js) but had no UI beyond
// picking/applying one in create-modal.js/subtasks.js — this is that
// missing management page.
//
// store.state.templates (from GET /api/bootstrap) deliberately omits each
// template's `items` array to keep the boot payload light (docs/04-api.md
// §2's bootstrap example only shows id/name/slug/itemCount) — so this view
// can't render from the store directly like members.view.js does. Instead
// it keeps its own locally-fetched full list (via GET /api/templates, which
// does include `items`) and mirrors every mutation out to
// store.addTemplateLocal/updateTemplateLocal/removeTemplateLocal so
// create-modal.js's and subtasks.js's "เลือกแม่แบบ" pickers (which only
// need the reduced shape) stay live. Closure-based mount/render/bind shape,
// same as subtasks.js's mountSubtasksBlock — chosen over module-level state
// because this view owns real async-loaded data, not just a store mirror.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc } from '../components/card.js';

function itemsToLines(items) {
  return items.join('\n');
}

// No prefix-stripping here on purpose (unlike subtask.schema.js's
// splitTitles) — template items are a curated, reusable checklist, not
// pasted ad-hoc text, so createTemplateSchema/updateTemplateSchema expect
// clean strings as-is (docs/04-api.md §6).
function linesToItems(raw) {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formHTML({ name = '', items = '', submitLabel, formId }) {
  return `
  <form data-template-form="${formId}" class="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
    <div>
      <label class="text-xs font-medium">ชื่อแม่แบบ *</label>
      <input data-field="name" required value="${esc(name)}" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1">
    </div>
    <div>
      <label class="text-xs font-medium">ขั้นตอน (บรรทัดละ 1 ข้อ) *</label>
      <textarea data-field="items" required rows="6" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1" placeholder="ทำ backup&#10;ติดตั้งเวอร์ชันใหม่&#10;ทดสอบ">${esc(items)}</textarea>
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" data-cancel-form class="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">ยกเลิก</button>
      <button type="submit" class="text-sm px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">${esc(submitLabel)}</button>
    </div>
  </form>`;
}

/** mountTemplates(root) -> unmount() */
export function mountTemplates(root) {
  const state = { templates: [], loading: true, creating: false, editingId: null };

  function templateCardHTML(t) {
    if (state.editingId === t.id) {
      return formHTML({ name: t.name, items: itemsToLines(t.items), submitLabel: 'บันทึก', formId: `edit-${t.id}` });
    }
    return `
    <div class="bg-white rounded-xl border border-slate-200 p-4" data-template-id="${t.id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div>
          <div class="font-medium text-sm">${esc(t.name)}</div>
          <div class="text-xs text-slate-400">${t.itemCount} ขั้นตอน</div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" data-edit-template class="text-xs text-indigo-600 hover:underline">แก้ไข</button>
          <button type="button" data-delete-template class="text-xs text-rose-600 hover:underline">ลบ</button>
        </div>
      </div>
      <ol class="text-xs text-slate-600 list-decimal list-inside space-y-0.5">
        ${t.items.map((item) => `<li>${esc(item)}</li>`).join('')}
      </ol>
    </div>`;
  }

  function bodyHTML() {
    if (state.loading) {
      return '<div class="text-sm text-slate-400">กำลังโหลด…</div>';
    }
    return `
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold">แม่แบบขั้นตอน</h2>
      ${!state.creating ? '<button type="button" data-open-create class="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-indigo-700">+ สร้างแม่แบบใหม่</button>' : ''}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${state.creating ? formHTML({ submitLabel: 'สร้าง', formId: 'create' }) : ''}
      ${state.templates.map(templateCardHTML).join('') || (state.creating ? '' : '<div class="text-sm text-slate-400">ยังไม่มีแม่แบบ</div>')}
    </div>`;
  }

  function render() {
    root.innerHTML = bodyHTML();
    bind();
  }

  function readForm(form) {
    const name = form.querySelector('[data-field="name"]').value.trim();
    const items = linesToItems(form.querySelector('[data-field="items"]').value);
    return { name, items };
  }

  async function handleCreate(form) {
    const { name, items } = readForm(form);
    if (!name) return toast.show('กรุณากรอกชื่อแม่แบบ');
    if (!items.length) return toast.show('กรุณากรอกขั้นตอนอย่างน้อย 1 ข้อ');
    try {
      const template = await api.post('/templates', { name, items });
      state.templates.push(template);
      state.creating = false;
      store.addTemplateLocal(template);
      render();
      toast.show(`สร้างแม่แบบ "${template.name}" แล้ว`);
    } catch (err) {
      toast.show(`สร้างแม่แบบไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleUpdate(id, form) {
    const { name, items } = readForm(form);
    if (!name) return toast.show('กรุณากรอกชื่อแม่แบบ');
    if (!items.length) return toast.show('กรุณากรอกขั้นตอนอย่างน้อย 1 ข้อ');
    try {
      const template = await api.patch(`/templates/${id}`, { name, items });
      state.templates = state.templates.map((t) => (t.id === id ? template : t));
      state.editingId = null;
      store.updateTemplateLocal(id, template);
      render();
      toast.show('บันทึกแม่แบบแล้ว');
    } catch (err) {
      toast.show(`บันทึกไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`ยืนยันลบแม่แบบ "${name}"? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await api.del(`/templates/${id}`);
      state.templates = state.templates.filter((t) => t.id !== id);
      store.removeTemplateLocal(id);
      render();
      toast.show('ลบแม่แบบแล้ว');
    } catch (err) {
      toast.show(`ลบไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    root.querySelector('[data-open-create]')?.addEventListener('click', () => {
      state.creating = true;
      render();
    });

    root.querySelectorAll('[data-cancel-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.creating = false;
        state.editingId = null;
        render();
      });
    });

    root.querySelector('[data-template-form="create"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreate(e.target);
    });

    root.querySelectorAll('form[data-template-form^="edit-"]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(form.dataset.templateForm.replace('edit-', ''));
        handleUpdate(id, form);
      });
    });

    root.querySelectorAll('[data-edit-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingId = Number(btn.closest('[data-template-id]').dataset.templateId);
        render();
      });
    });

    root.querySelectorAll('[data-delete-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-template-id]').dataset.templateId);
        const template = state.templates.find((t) => t.id === id);
        handleDelete(id, template?.name || '');
      });
    });
  }

  render(); // shows the loading state immediately

  api
    .get('/templates')
    .then((res) => {
      state.templates = res.items;
    })
    .catch((err) => {
      toast.show(`โหลดแม่แบบไม่สำเร็จ: ${err.message}`);
      state.templates = [];
    })
    .finally(() => {
      state.loading = false;
      render();
    });

  return function unmount() {};
}
