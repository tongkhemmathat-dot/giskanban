// server/utils/oauthState.js — signs/verifies the OAuth `state` param for
// Outlook calendar sync (server/services/calendar.service.js). This app has
// no session system (CLAUDE.md rule: no login/JWT), so `state` can't be
// checked against anything server-side stored per-request — instead it's a
// self-verifying signed token: HMAC(memberId + timestamp) with a secret only
// the server knows. Forging one without CALENDAR_STATE_SECRET is infeasible,
// and the timestamp bounds how long a captured redirect URL stays replayable.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './AppError.js';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — generous for a human to finish Microsoft login

function loadSecret() {
  const secret = process.env.CALENDAR_STATE_SECRET;
  if (!secret) throw new Error('CALENDAR_STATE_SECRET ไม่ได้ตั้งค่า');
  return secret;
}

function sign(payload) {
  return createHmac('sha256', loadSecret()).update(payload).digest('base64url');
}

export function signState(memberId) {
  const payload = `${memberId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state) {
  const parts = String(state ?? '').split('.');
  if (parts.length !== 3) throw new AppError('INVALID_STATE', 'state ไม่ถูกต้อง', 400);
  const [memberIdStr, timestampStr, sig] = parts;
  const payload = `${memberIdStr}.${timestampStr}`;
  const expectedSig = sign(payload);

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('INVALID_STATE', 'state ไม่ถูกต้องหรือถูกแก้ไข', 400);
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > STATE_TTL_MS) {
    throw new AppError('INVALID_STATE', 'state หมดอายุ กรุณาลองเชื่อมต่อใหม่', 400);
  }

  const memberId = Number(memberIdStr);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    throw new AppError('INVALID_STATE', 'state ไม่ถูกต้อง', 400);
  }
  return memberId;
}
