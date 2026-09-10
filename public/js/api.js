// js/api.js — the ONLY file allowed to call fetch() (docs/10-conventions.md §6.2).
// Every view/component must go through the `api` object exported here.
//
// Error contract (docs/04-api.md §1): non-2xx responses return
//   { error: { code, message, details? } }
// We normalize that into a plain JS Error with .code / .status / .details
// attached, so callers can `catch (err) { ... err.code ... }`.

// Derived from the page's own URL rather than hardcoded '/api' — this same
// public/ tree is served unmodified whether the app lives at the domain
// root (local dev, the Vercel demo) or under a reverse-proxied subpath
// (docs/09-deployment.md's "already have a reverse proxy" case, e.g.
// https://host/jobcard/), so there's no build step or env var that could
// bake in the wrong one. Relies on the page always being loaded with a
// trailing slash on its mount path (root "/" already has one; a subpath
// deployment's proxy must redirect the bare path to one, same as
// docs/09-deployment.md instructs) — without that, relative URL resolution
// treats the last path segment as a filename to replace, not a directory
// to stay inside, and this would silently drop the subpath prefix.
const BASE_URL = new URL('api', document.baseURI).pathname;

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON response (e.g. no backend yet, or a proxy's HTML error page).
    return null;
  }
}

async function request(method, path, body) {
  const init = { method, headers: {} };

  if (body instanceof FormData) {
    init.body = body; // let the browser set the multipart Content-Type/boundary
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE_URL + path, init);
  } catch (networkErr) {
    const err = new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายหรือลองใหม่อีกครั้ง');
    err.code = 'NETWORK_ERROR';
    err.status = 0;
    err.cause = networkErr;
    throw err;
  }

  const data = await parseBody(res);

  if (!res.ok) {
    const errorShape = data && typeof data === 'object' ? data.error : null;
    const err = new Error((errorShape && errorShape.message) || `คำขอล้มเหลว (HTTP ${res.status})`);
    err.code = (errorShape && errorShape.code) || 'INTERNAL_ERROR';
    err.status = res.status;
    err.details = errorShape && errorShape.details;
    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
