// js/views/recurring.view.js — "ใบงานประจำ (recurring) สำหรับงาน PM"
// (docs/07-roadmap.md backlog). Each rule creates a real card on its own
// schedule (server/services/recurring.service.js's runDueRecurring(), ticked
// from server/index.js) — this page is just CRUD + a manual "สร้างตอนนี้"
// trigger over /api/recurring-cards.
//
// Not mirrored into store.js (unlike templates.view.js's addTemplateLocal/
// etc.) — no other view/component reads recurring rules, so there's nothing
// else to keep in sync. Same closure-based mount/render/bind shape as
// templates.view.js and subtasks.js's mountSubtasksBlock.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc, TYPE_META, PRIORITY_META } from '../components/card.js';

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function scheduleLabel(rule) {
  if (rule.frequency === 'weekly') return `ทุกวัน${DAY_NAMES[rule.dayOfWeek]}`;
  return `ทุกวันที่ ${rule.dayOfMonth} ของเดือน`;
}

function memberOptionsHTML(selected) {
  return store.state.members.map((m) => `<option value="${esc(m.name)}" ${selected === m.name ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

function listOptionsHTML(selected) {
  return store.state.lists.map((l) => `<option value="${l.id}" ${selected === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
}

function templateOptionsHTML(selected) {
  const opts = store.state.templates.map((t) => `<option value="${esc(t.slug)}" ${selected === t.slug ? 'selected' : ''}>${esc(t.name)} (${t.itemCount} ขั้นตอน)</option>`).join('');
  return `<option value="">ไม่ใช้แม่แบบ</option>${opts}`;
}

function dayOfWeekOptionsHTML(selected) {
  return DAY_NAMES.map((name, i) => `<option value="${i}" ${selected === i ? 'selected' : ''}>${esc(name)}</option>`).join('');
}

const inputCls = 'w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-sm px-2 py-1.5 mt-1';

function formHTML(rule, { submitLabel, formId }) {
  const r = rule ?? {};
  const frequency = r.frequency ?? 'weekly';
  return `
  <form data-recurring-form="${formId}" class="bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-800 p-4 space-y-3 md:col-span-2">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ชื่อกฎ *</label>
        <input data-field="name" required value="${esc(r.name ?? '')}" class="${inputCls}">
      </div>
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ชื่อใบงานที่จะสร้าง *</label>
        <input data-field="title" required value="${esc(r.title ?? '')}" class="${inputCls}">
      </div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <label class="text-xs font-medium dark:text-slate-300">คอลัมน์ปลายทาง *</label>
        <select data-field="listId" required class="${inputCls}">${listOptionsHTML(r.listId)}</select>
      </div>
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ประเภทงาน</label>
        <select data-field="type" class="${inputCls}">
          ${Object.entries(TYPE_META).map(([k, v]) => `<option value="${k}" ${(r.type ?? 'maintenance') === k ? 'selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ความสำคัญ</label>
        <select data-field="priority" class="${inputCls}">
          ${Object.entries(PRIORITY_META).map(([k, v]) => `<option value="${k}" ${(r.priority ?? 'medium') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-xs font-medium dark:text-slate-300">แม่แบบขั้นตอน</label>
        <select data-field="templateSlug" class="${inputCls}">${templateOptionsHTML(r.templateSlug)}</select>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ผู้สร้าง (ในใบงานที่สร้างขึ้น) *</label>
        <select data-field="creatorName" required class="${inputCls}">
          <option value="">— เลือกชื่อ —</option>${memberOptionsHTML(r.creatorName)}
        </select>
      </div>
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ผู้รับผิดชอบ (ไม่เลือก = ผู้สร้าง)</label>
        <select data-field="assigneeName" class="${inputCls}">
          <option value="">— ไม่ระบุ —</option>${memberOptionsHTML(r.assigneeName)}
        </select>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 items-end">
      <div>
        <label class="text-xs font-medium dark:text-slate-300">ความถี่ *</label>
        <select data-field="frequency" class="${inputCls}">
          <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>รายสัปดาห์</option>
          <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>รายเดือน</option>
        </select>
      </div>
      <div data-when-weekly ${frequency !== 'weekly' ? 'hidden' : ''}>
        <label class="text-xs font-medium dark:text-slate-300">ทุกวัน</label>
        <select data-field="dayOfWeek" class="${inputCls}">${dayOfWeekOptionsHTML(r.dayOfWeek ?? 1)}</select>
      </div>
      <div data-when-monthly ${frequency !== 'monthly' ? 'hidden' : ''}>
        <label class="text-xs font-medium dark:text-slate-300">วันที่ (1-28)</label>
        <input data-field="dayOfMonth" type="number" min="1" max="28" value="${r.dayOfMonth ?? 1}" class="${inputCls}">
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" data-cancel-form class="text-sm px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
      <button type="submit" class="text-sm px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">${esc(submitLabel)}</button>
    </div>
  </form>`;
}

/** mountRecurring(root) -> unmount() */
export function mountRecurring(root) {
  const state = { rules: [], loading: true, creating: false, editingId: null };

  function ruleCardHTML(rule) {
    if (state.editingId === rule.id) {
      return formHTML(rule, { submitLabel: 'บันทึก', formId: `edit-${rule.id}` });
    }
    return `
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 ${rule.isActive ? '' : 'opacity-60'}" data-rule-id="${rule.id}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div>
          <div class="font-medium text-sm dark:text-slate-100">${esc(rule.name)} ${rule.isActive ? '' : '<span class="text-[10px] text-slate-400">(ปิดใช้งาน)</span>'}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">${esc(rule.title)} → ${esc(store.getList(rule.listId)?.name ?? '?')}</div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" data-run-now class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">สร้างตอนนี้</button>
          <button type="button" data-toggle-active class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">${rule.isActive ? 'ปิด' : 'เปิด'}</button>
          <button type="button" data-edit-rule class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">แก้ไข</button>
          <button type="button" data-delete-rule class="text-xs text-rose-600 dark:text-rose-400 hover:underline">ลบ</button>
        </div>
      </div>
      <div class="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
        <div>🔁 ${esc(scheduleLabel(rule))} · ครั้งถัดไป ${esc(rule.nextRunAt ?? '—')}</div>
        <div>ผู้สร้าง: ${esc(rule.creatorName)}${rule.assigneeName ? ` · ผู้รับผิดชอบ: ${esc(rule.assigneeName)}` : ''}</div>
        ${rule.lastRunAt ? `<div class="text-slate-400 dark:text-slate-500">สร้างล่าสุด: ${esc(rule.lastRunAt)}</div>` : ''}
      </div>
    </div>`;
  }

  function bodyHTML() {
    if (state.loading) {
      return '<div class="text-sm text-slate-400 dark:text-slate-500">กำลังโหลด…</div>';
    }
    return `
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-lg font-semibold dark:text-slate-100">ใบงานประจำ (PM)</h2>
      ${!state.creating ? '<button type="button" data-open-create class="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-indigo-700">+ สร้างกฎใหม่</button>' : ''}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${state.creating ? formHTML(null, { submitLabel: 'สร้าง', formId: 'create' }) : ''}
      ${state.rules.map(ruleCardHTML).join('') || (state.creating ? '' : '<div class="text-sm text-slate-400 dark:text-slate-500">ยังไม่มีกฎใบงานประจำ</div>')}
    </div>`;
  }

  function render() {
    root.innerHTML = bodyHTML();
    bind();
  }

  function readForm(form) {
    const val = (name) => form.querySelector(`[data-field="${name}"]`)?.value;
    return {
      name: val('name').trim(),
      title: val('title').trim(),
      listId: Number(val('listId')),
      type: val('type'),
      priority: val('priority'),
      templateSlug: val('templateSlug') || undefined,
      creatorName: val('creatorName'),
      assigneeName: val('assigneeName') || undefined,
      frequency: val('frequency'),
      dayOfWeek: val('frequency') === 'weekly' ? Number(val('dayOfWeek')) : undefined,
      dayOfMonth: val('frequency') === 'monthly' ? Number(val('dayOfMonth')) : undefined,
    };
  }

  async function handleCreate(form) {
    const payload = readForm(form);
    if (!payload.name) return toast.show('กรุณากรอกชื่อกฎ');
    if (!payload.title) return toast.show('กรุณากรอกชื่อใบงาน');
    if (!payload.creatorName) return toast.show('กรุณาเลือกผู้สร้าง');
    try {
      const rule = await api.post('/recurring-cards', payload);
      state.rules.push(rule);
      state.creating = false;
      render();
      toast.show(`สร้างกฎ "${rule.name}" แล้ว`);
    } catch (err) {
      toast.show(`สร้างไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleUpdate(id, form) {
    const payload = readForm(form);
    if (!payload.name) return toast.show('กรุณากรอกชื่อกฎ');
    if (!payload.title) return toast.show('กรุณากรอกชื่อใบงาน');
    try {
      const rule = await api.patch(`/recurring-cards/${id}`, payload);
      state.rules = state.rules.map((r) => (r.id === id ? rule : r));
      state.editingId = null;
      render();
      toast.show('บันทึกแล้ว');
    } catch (err) {
      toast.show(`บันทึกไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleToggleActive(rule) {
    try {
      const updated = await api.patch(`/recurring-cards/${rule.id}`, { isActive: !rule.isActive });
      state.rules = state.rules.map((r) => (r.id === rule.id ? updated : r));
      render();
    } catch (err) {
      toast.show(`เปลี่ยนสถานะไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`ยืนยันลบกฎ "${name}"? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await api.del(`/recurring-cards/${id}`);
      state.rules = state.rules.filter((r) => r.id !== id);
      render();
      toast.show('ลบแล้ว');
    } catch (err) {
      toast.show(`ลบไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleRunNow(rule) {
    try {
      const card = await api.post(`/recurring-cards/${rule.id}/run-now`);
      store.addCardLocal(card);
      const rules = await api.get('/recurring-cards');
      state.rules = rules.items;
      render();
      toast.show(`สร้างใบงาน ${card.code} เรียบร้อย`);
    } catch (err) {
      toast.show(`สร้างใบงานไม่สำเร็จ: ${err.message}`);
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

    root.querySelectorAll('[data-recurring-form] [data-field="frequency"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const form = sel.closest('form');
        const weekly = sel.value === 'weekly';
        form.querySelector('[data-when-weekly]').hidden = !weekly;
        form.querySelector('[data-when-monthly]').hidden = weekly;
      });
    });

    root.querySelector('[data-recurring-form="create"]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreate(e.target);
    });

    root.querySelectorAll('form[data-recurring-form^="edit-"]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(form.dataset.recurringForm.replace('edit-', ''));
        handleUpdate(id, form);
      });
    });

    root.querySelectorAll('[data-edit-rule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingId = Number(btn.closest('[data-rule-id]').dataset.ruleId);
        render();
      });
    });

    root.querySelectorAll('[data-delete-rule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-rule-id]').dataset.ruleId);
        const rule = state.rules.find((r) => r.id === id);
        handleDelete(id, rule?.name || '');
      });
    });

    root.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-rule-id]').dataset.ruleId);
        handleToggleActive(state.rules.find((r) => r.id === id));
      });
    });

    root.querySelectorAll('[data-run-now]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-rule-id]').dataset.ruleId);
        handleRunNow(state.rules.find((r) => r.id === id));
      });
    });
  }

  render(); // shows the loading state immediately

  api
    .get('/recurring-cards')
    .then((res) => {
      state.rules = res.items;
    })
    .catch((err) => {
      toast.show(`โหลดใบงานประจำไม่สำเร็จ: ${err.message}`);
      state.rules = [];
    })
    .finally(() => {
      state.loading = false;
      render();
    });

  return function unmount() {};
}
