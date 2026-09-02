// js/views/members.view.js — team roster + per-member stats (docs/07-roadmap.md
// 4.11) + management actions (backlog: edit name/short/color, activate/
// deactivate, delete). Member data itself comes straight from store.state
// (already in bootstrap, unlike templates.view.js which needs its own fetch)
// — only the "which row is being edited" UI state is local, closure-based
// same shape as templates.view.js/subtasks.js. Every mutation routes through
// api.js then store.upsertMemberLocal/removeMemberLocal so the header's
// meSelect and every assignee picker elsewhere stay in sync without a full
// bootstrap re-fetch.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { esc, avatarHTML } from '../components/card.js';

function isDoneListId(listId) {
  return store.state.lists.find((l) => l.id === listId)?.isDone === 1;
}

export function mountMembers(root) {
  const state = { editingId: null, creating: false };

  function createRowHTML() {
    return `
    <tr class="border-b border-slate-50 dark:border-slate-700">
      <td colspan="4" class="px-4 py-2">
        <form data-create-member-form class="flex flex-wrap items-center gap-2">
          <input data-field="name" required maxlength="100" placeholder="ชื่อสมาชิกใหม่" autofocus class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-sm px-2 py-1 w-52">
          <button type="button" data-cancel-create class="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
          <button type="submit" class="text-xs px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">เพิ่ม</button>
        </form>
      </td>
    </tr>`;
  }

  function editRowHTML(m) {
    return `
    <tr class="border-b border-slate-50 dark:border-slate-700" data-member-id="${m.id}">
      <td colspan="4" class="px-4 py-2">
        <form data-member-form class="flex flex-wrap items-center gap-2">
          <input type="color" data-field="color" value="${esc(m.color || '#0d9488')}" title="สี" class="w-8 h-8 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5">
          <input data-field="name" required maxlength="100" value="${esc(m.name)}" placeholder="ชื่อ" class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-sm px-2 py-1 w-40">
          <input data-field="short" required maxlength="10" value="${esc(m.short || '')}" placeholder="ย่อ" class="border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-md text-sm px-2 py-1 w-16">
          <label class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" data-field="isActive" ${m.isActive ? 'checked' : ''}> ใช้งานอยู่
          </label>
          <div class="flex gap-2 ml-auto">
            <button type="button" data-cancel-edit class="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
            <button type="submit" class="text-xs px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">บันทึก</button>
          </div>
        </form>
      </td>
    </tr>`;
  }

  function rowHTML(m) {
    if (state.editingId === m.id) return editRowHTML(m);

    const createdCount = store.state.cards.filter((c) => c.creator?.id === m.id).length;
    const pendingCount = store.state.cards.filter(
      (c) => (c.assignees || []).some((a) => a.id === m.id) && !isDoneListId(c.listId),
    ).length;

    return `
    <tr class="border-b border-slate-50 dark:border-slate-700 dark:text-slate-200" data-member-id="${m.id}">
      <td class="px-4 py-2 flex items-center gap-2">
        ${avatarHTML(m, 'w-7 h-7 text-xs')}<span>${esc(m.name)}</span>
        ${!m.isActive ? '<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">ไม่ใช้งาน</span>' : ''}
      </td>
      <td>${createdCount}</td>
      <td>${pendingCount}</td>
      <td class="px-4 py-2 text-right whitespace-nowrap">
        <button type="button" data-edit-member class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mr-3">แก้ไข</button>
        <button type="button" data-toggle-active class="text-xs text-amber-600 dark:text-amber-400 hover:underline mr-3">${m.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
        <button type="button" data-delete-member class="text-xs text-rose-600 dark:text-rose-400 hover:underline">ลบ</button>
      </td>
    </tr>`;
  }

  function render() {
    root.innerHTML = `
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-lg font-semibold dark:text-slate-100">สมาชิก</h2>
      ${!state.creating ? '<button type="button" data-open-create class="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-indigo-700">+ เพิ่มสมาชิกใหม่</button>' : ''}
    </div>
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 dark:text-slate-400 text-xs border-b border-slate-100 dark:border-slate-700">
            <th class="px-4 py-2">สมาชิก</th><th>สร้างแล้ว</th><th>งานค้าง</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${state.creating ? createRowHTML() : ''}
          ${store.state.members.map(rowHTML).join('')}
        </tbody>
      </table>
    </div>`;
    bind();
  }

  function readForm(form) {
    return {
      name: form.querySelector('[data-field="name"]').value.trim(),
      short: form.querySelector('[data-field="short"]').value.trim(),
      color: form.querySelector('[data-field="color"]').value,
      isActive: form.querySelector('[data-field="isActive"]').checked,
    };
  }

  async function handleCreate(form) {
    const name = form.querySelector('[data-field="name"]').value.trim();
    if (!name) return toast.show('กรุณากรอกชื่อสมาชิก');
    try {
      const member = await api.post('/members', { name });
      state.creating = false;
      store.upsertMemberLocal(member);
      toast.show(`เพิ่มสมาชิก "${member.name}" แล้ว`);
    } catch (err) {
      toast.show(`เพิ่มสมาชิกไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleUpdate(id, form) {
    const fields = readForm(form);
    if (!fields.name) return toast.show('กรุณากรอกชื่อสมาชิก');
    try {
      const member = await api.patch(`/members/${id}`, fields);
      state.editingId = null;
      store.upsertMemberLocal(member);
      toast.show('บันทึกข้อมูลสมาชิกแล้ว');
    } catch (err) {
      toast.show(`บันทึกไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleToggleActive(m) {
    try {
      const member = await api.patch(`/members/${m.id}`, { isActive: !m.isActive });
      store.upsertMemberLocal(member);
      toast.show(member.isActive ? `เปิดใช้งาน "${member.name}" แล้ว` : `ปิดใช้งาน "${member.name}" แล้ว`);
    } catch (err) {
      toast.show(`ดำเนินการไม่สำเร็จ: ${err.message}`);
    }
  }

  async function handleDelete(m) {
    if (!window.confirm(`ยืนยันลบสมาชิก "${m.name}"? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await api.del(`/members/${m.id}`);
      store.removeMemberLocal(m.id);
      toast.show('ลบสมาชิกแล้ว');
    } catch (err) {
      // Server refuses (409 CONFLICT) when this member is still a card's
      // creator — its own message already tells the user to deactivate
      // instead (server/services/member.service.js), so just surface it.
      toast.show(`ลบไม่สำเร็จ: ${err.message}`);
    }
  }

  function bind() {
    root.querySelector('[data-open-create]')?.addEventListener('click', () => {
      state.creating = true;
      render();
    });

    root.querySelector('[data-cancel-create]')?.addEventListener('click', () => {
      state.creating = false;
      render();
    });

    root.querySelector('[data-create-member-form]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCreate(e.target);
    });

    root.querySelectorAll('[data-edit-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingId = Number(btn.closest('[data-member-id]').dataset.memberId);
        render();
      });
    });

    root.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingId = null;
        render();
      });
    });

    root.querySelectorAll('[data-member-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(form.closest('[data-member-id]').dataset.memberId);
        handleUpdate(id, form);
      });
    });

    root.querySelectorAll('[data-toggle-active]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-member-id]').dataset.memberId);
        const member = store.state.members.find((m) => m.id === id);
        if (member) handleToggleActive(member);
      });
    });

    root.querySelectorAll('[data-delete-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.closest('[data-member-id]').dataset.memberId);
        const member = store.state.members.find((m) => m.id === id);
        if (member) handleDelete(member);
      });
    });
  }

  const unsubscribe = store.subscribe(render);
  render();

  return function unmount() {
    unsubscribe();
  };
}
