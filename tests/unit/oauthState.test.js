import { describe, it, expect, vi, afterEach } from 'vitest';
import { signState, verifyState } from '../../server/utils/oauthState.js';

describe('oauthState (signed OAuth `state` param, no session system)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifyState(signState(memberId)) round-trips the memberId', () => {
    expect(verifyState(signState(42))).toBe(42);
  });

  it('rejects a tampered signature', () => {
    const state = signState(7);
    const [memberId, timestamp] = state.split('.');
    const tampered = `${memberId}.${timestamp}.not-the-real-signature`;
    expect(() => verifyState(tampered)).toThrow();
  });

  it('rejects a state signed with a different memberId than it claims', () => {
    const state = signState(1);
    const [, timestamp, sig] = state.split('.');
    const swapped = `2.${timestamp}.${sig}`;
    expect(() => verifyState(swapped)).toThrow();
  });

  it('rejects a malformed state', () => {
    expect(() => verifyState('not-a-real-state')).toThrow();
    expect(() => verifyState('')).toThrow();
    expect(() => verifyState(undefined)).toThrow();
  });

  it('rejects a state older than the TTL (10 minutes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const state = signState(5);

    vi.setSystemTime(new Date('2026-01-01T00:11:00Z')); // 11 minutes later
    expect(() => verifyState(state)).toThrow();
  });

  it('accepts a state just under the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const state = signState(5);

    vi.setSystemTime(new Date('2026-01-01T00:09:00Z')); // 9 minutes later
    expect(verifyState(state)).toBe(5);
  });
});
