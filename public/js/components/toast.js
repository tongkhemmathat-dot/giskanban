// js/components/toast.js — bottom-center toast (docs/06-ui-spec.md §11).
// Auto-hides after ~5s, optional single action button. Mirrors mockup.html's
// showToast() behavior.

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center';
    document.body.appendChild(root);
  }
  return root;
}

function show(message, actionLabel, actionFn) {
  const root = ensureRoot();
  const el = document.createElement('div');
  el.className = 'bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 text-sm';
  el.innerHTML =
    `<span>${esc(message)}</span>` +
    (actionLabel ? `<button type="button" class="toast-action text-indigo-300 font-medium hover:text-indigo-200 shrink-0">${esc(actionLabel)}</button>` : '');

  if (actionLabel && typeof actionFn === 'function') {
    el.querySelector('.toast-action').addEventListener('click', () => {
      actionFn();
      el.remove();
    });
  }

  root.appendChild(el);
  setTimeout(() => el.remove(), 5000);
  return el;
}

export const toast = { show };
