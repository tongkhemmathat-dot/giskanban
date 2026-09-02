// js/components/create-modal.js — "สร้างใบงานใหม่" modal
// (docs/06-ui-spec.md §7, docs/07-roadmap.md 4.6). Field order/markup mirrors
// public/mockup.html's openCreateModal(), wired through api.js/store.js
// instead of the mockup's global CARDS array. Client-side validation is kept
// minimal (just `required`) — the server's zod schema is already the source
// of truth for everything else (docs/04-api.md §4), so failures surface
// through the same normalized `err.message`/`err.details` api.js already
// produces rather than duplicating the rules here.
import { store } from '../store.js';
import { api } from '../api.js';
import { toast } from './toast.js';
import { esc, TYPE_META, PRIORITY_META } from './card.js';

// Mirrors server/utils/sla.js's SLA_HOURS — shown as a hint only, the real
// due-date math always happens server-side (docs/05-business-rules.md §2).
const SLA_HOURS = { critical: 4, high: 24, medium: 72, low: 168 };

function memberOptionsHTML(selectedName) {
  return store.state.members
    .map((m) => `<option value="${esc(m.name)}" ${selectedName === m.name ? 'selected' : ''}>${esc(m.name)}</option>`)
    .join('');
}

function siteDatalistHTML() {
  const sites = [...new Set(store.state.cards.map((c) => c.site).filter(Boolean))];
  return sites.map((s) => `<option value="${esc(s)}">`).join('');
}

function modalHTML() {
  return `
  <div class="fixed inset-0 modal-backdrop flex items-center justify-center z-40 p-0 md:p-4" data-close-on-backdrop>
    <div class="bg-white md:rounded-xl shadow-2xl w-full h-full md:h-auto md:max-w-lg md:max-h-[90vh] overflow-y-auto p-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">สร้างใบงานใหม่</h2>
        <button type="button" data-close-modal class="text-slate-400 hover:text-slate-700 text-lg leading-none" aria-label="ปิด">✕</button>
      </div>
      <form id="createCardForm" class="space-y-3">
        <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
          <label class="text-xs font-medium text-indigo-700" for="cCreator">✍️ ผู้สร้างใบงาน *</label>
          <div class="flex gap-2 mt-1">
            <select id="cCreator" required class="flex-1 border border-slate-300 rounded-md text-sm px-2 py-1.5">
              <option value="">— เลือกชื่อ —</option>
              ${memberOptionsHTML(store.state.me)}
            </select>
            <button type="button" id="cAddMember" class="text-xs border border-indigo-300 text-indigo-600 rounded-md px-2 hover:bg-indigo-100">+ ชื่อใหม่</button>
          </div>
        </div>
        <div>
          <label class="text-xs font-medium" for="cTitle">ชื่องาน *</label>
          <input id="cTitle" required class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1" placeholder="เช่น Upgrade ArcGIS Enterprise 12.1">
        </div>
        <div>
          <label class="text-xs font-medium" for="cDesc">รายละเอียด</label>
          <textarea id="cDesc" rows="2" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium" for="cType">ประเภทงาน</label>
            <select id="cType" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1">
              ${Object.entries(TYPE_META).map(([k, v]) => `<option value="${k}">${v.icon} ${esc(v.label)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-medium" for="cPriority">ความสำคัญ</label>
            <select id="cPriority" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1">
              ${Object.entries(PRIORITY_META).map(([k, v]) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
            </select>
            <div id="cSlaHint" class="text-[11px] text-slate-400 mt-0.5">SLA: ภายใน ${SLA_HOURS.medium} ชั่วโมง</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium" for="cSite">Site</label>
            <input id="cSite" list="cSiteList" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1">
            <datalist id="cSiteList">${siteDatalistHTML()}</datalist>
          </div>
          <div><label class="text-xs font-medium" for="cCustomer">ลูกค้า</label><input id="cCustomer" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-xs font-medium" for="cDevice">อุปกรณ์</label><input id="cDevice" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1"></div>
          <div><label class="text-xs font-medium" for="cDue">กำหนดเสร็จ</label><input id="cDue" type="datetime-local" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1"></div>
        </div>
        <div>
          <label class="text-xs font-medium" for="cProjectCode">เลขโครงการ <span class="text-slate-400 font-normal">(ไม่บังคับ)</span></label>
          <input id="cProjectCode" placeholder="E26-1234" maxlength="8" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5 mt-1 uppercase">
          <div class="text-[11px] text-slate-400 mt-0.5">รูปแบบ E + ปี 2 หลัก + "-" + เลข 4 หลัก เช่น E26-1234</div>
        </div>
        <div>
          <label class="text-xs font-medium" for="cSubtasks">ขั้นตอนการทำงาน</label>
          <select id="cTemplate" class="w-full border border-slate-300 rounded-md text-xs px-2 py-1 mt-1 mb-1">
            <option value="">ไม่ใช้แม่แบบ</option>
            ${store.state.templates.map((t) => `<option value="${esc(t.slug)}">${esc(t.name)} (${t.itemCount} ขั้นตอน)</option>`).join('')}
          </select>
          <textarea id="cSubtasks" rows="3" placeholder="1. ทำ backup&#10;2. ติดตั้งเวอร์ชันใหม่&#10;3. ทดสอบ" class="w-full border border-slate-300 rounded-md text-sm px-2 py-1.5"></textarea>
          <div class="text-[11px] text-slate-400 mt-0.5">วางรายการที่มีเลขนำหน้าได้เลย ระบบตัด "1." "-" ให้อัตโนมัติ</div>
        </div>
        <div>
          <label class="text-xs font-medium">ผู้รับผิดชอบ (ไม่เลือก = ผู้สร้าง)</label>
          <div class="flex flex-wrap gap-2 mt-1">
            ${store.state.members
              .map(
                (m) => `
              <label class="text-xs border border-slate-200 rounded-full px-2 py-1 flex items-center gap-1 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" value="${esc(m.name)}" class="c-assignee accent-indigo-600"> ${esc(m.name)}
              </label>`,
              )
              .join('')}
          </div>
        </div>
        <div id="cError" class="text-xs text-rose-600 hidden"></div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" data-close-modal class="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">ยกเลิก</button>
          <button type="submit" id="cSubmit" class="text-sm px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">สร้างใบงาน</button>
        </div>
      </form>
    </div>
  </div>`;
}

function showError(message) {
  const el = document.getElementById('cError');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

async function handleAddMember() {
  const name = window.prompt('ชื่อสมาชิกใหม่:');
  if (!name || !name.trim()) return;
  try {
    const member = await api.post('/members', { name: name.trim() });
    store.upsertMemberLocal(member);
    const sel = document.getElementById('cCreator');
    if (sel) sel.innerHTML = '<option value="">— เลือกชื่อ —</option>' + memberOptionsHTML(member.name);
  } catch (err) {
    toast.show(`เพิ่มสมาชิกไม่สำเร็จ: ${err.message}`);
  }
}

async function handleSubmit(e, listId, close) {
  e.preventDefault();
  document.getElementById('cError').classList.add('hidden');

  const creatorName = document.getElementById('cCreator').value;
  const title = document.getElementById('cTitle').value.trim();
  if (!creatorName) return showError('กรุณาเลือกผู้สร้างใบงาน');
  if (!title) return showError('กรุณากรอกชื่องาน');

  const payload = {
    listId,
    title,
    description: document.getElementById('cDesc').value.trim() || undefined,
    type: document.getElementById('cType').value,
    priority: document.getElementById('cPriority').value,
    site: document.getElementById('cSite').value.trim() || undefined,
    customer: document.getElementById('cCustomer').value.trim() || undefined,
    deviceRef: document.getElementById('cDevice').value.trim() || undefined,
    projectCode: document.getElementById('cProjectCode').value.trim() || undefined,
    dueDate: document.getElementById('cDue').value || undefined,
    creatorName,
    assigneeNames: [...document.querySelectorAll('.c-assignee:checked')].map((el) => el.value),
    subtaskTitles: document.getElementById('cSubtasks').value.split(/\r?\n/),
    templateSlug: document.getElementById('cTemplate').value || undefined,
  };

  const submitBtn = document.getElementById('cSubmit');
  submitBtn.disabled = true;
  try {
    const card = await api.post('/cards', payload);
    store.addCardLocal(card);
    close();
    toast.show(`สร้างใบงาน ${card.code} เรียบร้อย`);
  } catch (err) {
    showError(err.message || 'สร้างใบงานไม่สำเร็จ');
    submitBtn.disabled = false;
  }
}

let rootClickHandler = null;

function onKeydown(e) {
  if (e.key === 'Escape') closeCreateModal();
}

function closeCreateModal() {
  const root = document.getElementById('modal-root');
  if (rootClickHandler) {
    root.removeEventListener('click', rootClickHandler);
    rootClickHandler = null;
  }
  root.innerHTML = '';
  document.removeEventListener('keydown', onKeydown);
}

export function openCreateModal(listId) {
  const root = document.getElementById('modal-root');
  const targetListId = listId ?? store.state.lists.find((l) => l.slug === 'backlog')?.id ?? store.state.lists[0]?.id;
  root.innerHTML = modalHTML();
  document.addEventListener('keydown', onKeydown);

  // Named (not inline) so closeCreateModal() can remove exactly this listener
  // — #modal-root is a persistent node (only its innerHTML is replaced on
  // open/close), so an un-removed listener here would accumulate across
  // every openCreateModal() call.
  rootClickHandler = (e) => {
    if (e.target.hasAttribute('data-close-on-backdrop') || e.target.closest('[data-close-modal]')) {
      closeCreateModal();
    }
  };
  root.addEventListener('click', rootClickHandler);

  document.getElementById('cPriority').addEventListener('change', function onPriorityChange() {
    document.getElementById('cSlaHint').textContent = `SLA: ภายใน ${SLA_HOURS[this.value]} ชั่วโมง`;
  });
  document.getElementById('cAddMember').addEventListener('click', handleAddMember);
  document.getElementById('createCardForm').addEventListener('submit', (e) => handleSubmit(e, targetListId, closeCreateModal));
}
