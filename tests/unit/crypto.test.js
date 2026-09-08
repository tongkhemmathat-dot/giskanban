import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../server/utils/crypto.js';

describe('crypto (AES-256-GCM envelope)', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'a-very-secret-refresh-token';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (fresh IV)', () => {
    const a = encrypt('same-value');
    const b = encrypt('same-value');
    expect(a).not.toBe(b);
  });

  // Flips the first character to a value guaranteed different from the
  // original, so the tamper can never accidentally no-op.
  function flipFirstChar(s) {
    return (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  }

  it('throws when the ciphertext has been tampered with', () => {
    const payload = encrypt('tamper-me');
    const [iv, tag, ciphertext] = payload.split(':');
    const tampered = [iv, tag, flipFirstChar(ciphertext)].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws when the auth tag has been tampered with', () => {
    const payload = encrypt('tamper-me');
    const [iv, tag, ciphertext] = payload.split(':');
    const tampered = [iv, flipFirstChar(tag), ciphertext].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on a malformed payload', () => {
    expect(() => decrypt('not-a-valid-payload')).toThrow();
  });
});
