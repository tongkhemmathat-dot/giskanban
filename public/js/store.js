// js/store.js — single source of truth for client state (docs/02-architecture.md §3).
// Views/components read `store.state` and call `store.subscribe(fn)` to react;
// they never hold their own copy of server data, and never mutate `state`
// directly from outside this file.

// Same spacing scheme as server/utils/position.js (docs/05-business-rules.md §5).
// NOTE: docs/04-api.md's bootstrap example does not show a numeric `position`
// field on card objects, even though docs/03-database.md's cards table has one
// and the reference query orders `ORDER BY c.list_id, c.position`. We assume
// the bootstrap `cards` array already arrives pre-sorted per list. If a card
// is missing `position` we derive a stable local one (GAP, 2*GAP, ...) from
// that incoming order so drag & drop can still compute a correct insert-point
// with `midPosition()` below. If the real API does send `position`, we prefer
// it as-is. This should be re-verified once the API branch is merged.
export const GAP = 65536;

export function midPosition(prev, next) {
  if (prev == null && next == null) return GAP;
  if (prev == null) return next / 2;
  if (next == null) return prev + GAP;
  return (prev + next) / 2;
}

const state = {
  status: 'idle', // idle | loading | ready | error
  error: null,
  board: null,
  lists: [],
  members: [],
  labels: [],
  templates: [],
  cards: [],
  me: readMe(),
};

function readMe() {
  try {
    return localStorage.getItem('jc_me') || '';
  } catch {
    return '';
  }
}

const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error('store listener threw', e);
    }
  }
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(status, error = null) {
  state.status = status;
  state.error = error;
  emit();
}

function setBootstrap(data) {
  state.board = data?.board ?? null;
  state.lists = Array.isArray(data?.lists) ? data.lists : [];
  state.members = Array.isArray(data?.members) ? data.members : [];
  state.labels = Array.isArray(data?.labels) ? data.labels : [];
  state.templates = Array.isArray(data?.templates) ? data.templates : [];

  const seqByList = new Map();
  state.cards = (Array.isArray(data?.cards) ? data.cards : []).map((c) => {
    if (typeof c.position === 'number') return { ...c };
    const n = (seqByList.get(c.listId) ?? 0) + 1;
    seqByList.set(c.listId, n);
    return { ...c, position: n * GAP };
  });

  state.status = 'ready';
  state.error = null;
  emit();
}

function setMe(name) {
  state.me = name || '';
  try {
    localStorage.setItem('jc_me', state.me);
  } catch {
    // ignore (private browsing / storage disabled)
  }
  emit();
}

function getCard(id) {
  return state.cards.find((c) => c.id === id) || null;
}

function getList(id) {
  return state.lists.find((l) => l.id === id) || null;
}

// Optimistically move a card to a new list/position. Returns the previous
// { listId, position } so the caller can roll back on API failure.
function moveCardLocal(cardId, newListId, newPosition) {
  const card = getCard(cardId);
  if (!card) return null;
  const prev = { listId: card.listId, position: card.position };
  card.listId = newListId;
  card.position = newPosition;
  emit();
  return prev;
}

function upsertMemberLocal(member) {
  if (!member) return;
  const idx = state.members.findIndex((m) => m.id === member.id || m.name === member.name);
  if (idx >= 0) state.members[idx] = { ...state.members[idx], ...member };
  else state.members.push(member);
  emit();
}

export const store = {
  state,
  subscribe,
  setStatus,
  setBootstrap,
  setMe,
  getCard,
  getList,
  moveCardLocal,
  upsertMemberLocal,
};
