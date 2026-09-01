import { describe, it, expect } from 'vitest';
import { calcSlaDueAt } from '../../server/utils/sla.js';

// Inputs use an explicit 'Z' so the expected result is deterministic
// regardless of the machine/CI runner's local timezone. calcSlaDueAt treats
// any offset-less input as UTC too (see server/utils/sla.js), so this is
// equivalent to the bare '2026-09-01T10:00' shown in docs/08-testing.md §3.
describe('calcSlaDueAt', () => {
  it('U1: critical -> +4h', () => {
    expect(calcSlaDueAt('critical', '2026-09-01T10:00:00Z')).toBe('2026-09-01 14:00:00');
  });

  it('U2: low -> +168h (7 days)', () => {
    expect(calcSlaDueAt('low', '2026-09-01T10:00:00Z')).toBe('2026-09-08 10:00:00');
  });
});
