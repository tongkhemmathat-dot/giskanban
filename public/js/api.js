// js/api.js — the ONLY file allowed to call fetch() (docs/10-conventions.md §6.2).
// Every view/component must go through the `api` object exported here.
//
// Error contract (docs/04-api.md §1): non-2xx responses return
//   { error: { code, message, details? } }
// We normalize that into a plain JS Error with .code / .status / .details
// attached, so callers can `catch (err) { ... err.code ... }`.

const BASE_URL = '/api';

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
