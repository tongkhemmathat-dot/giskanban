// server/utils/crypto.js — AES-256-GCM envelope for at-rest secrets
// (docs/07-roadmap.md backlog: Outlook calendar sync). This is the first
// place this codebase encrypts anything — Outlook OAuth refresh/access
// tokens (server/services/calendar.service.js) must never sit in the SQLite
// file as plaintext, unlike everything else stored today.
//
// Stored shape: `${ivB64}:${authTagB64}:${ciphertextB64}` — a fresh random
// IV per call (GCM requires IV uniqueness per key, never reuse), so
// encrypting the same plaintext twice yields different output.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit, the GCM-recommended IV size

// Reads CALENDAR_ENCRYPTION_KEY lazily (not at module load) so importing
// this file never breaks a test/route that doesn't touch calendar sync.
function loadKey() {
  const raw = process.env.CALENDAR_ENCRYPTION_KEY;
  if (!raw) throw new Error('CALENDAR_ENCRYPTION_KEY ไม่ได้ตั้งค่า');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CALENDAR_ENCRYPTION_KEY ต้องเป็น 32 ไบต์ (base64) — สร้างด้วย: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return key;
}

export function encrypt(plaintext) {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(payload) {
  const key = loadKey();
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new Error('รูปแบบข้อมูลเข้ารหัสไม่ถูกต้อง');
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
