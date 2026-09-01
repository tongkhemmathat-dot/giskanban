import { describe, it, expect } from 'vitest';
import { midPosition } from '../../server/utils/position.js';

describe('midPosition', () => {
  it('U5: (null, null) -> 65536', () => {
    expect(midPosition(null, null)).toBe(65536);
  });

  it('U6: (100, 200) -> 150', () => {
    expect(midPosition(100, 200)).toBe(150);
  });

  it('U7: (100, null) -> 65636', () => {
    expect(midPosition(100, null)).toBe(65636);
  });
});
