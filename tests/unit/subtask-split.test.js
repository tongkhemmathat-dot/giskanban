import { describe, it, expect } from 'vitest';
import { splitTitles } from '../../server/utils/subtask.js';

describe('splitTitles', () => {
  it('U8: strips a numbered prefix', () => {
    expect(splitTitles('1. ทำ backup')).toEqual(['ทำ backup']);
  });

  it('U9: strips bullet prefixes and drops blank lines', () => {
    expect(splitTitles('- ทดสอบ\n\n• สรุป')).toEqual(['ทดสอบ', 'สรุป']);
  });

  it('U10: leaves mid-sentence numbers untouched', () => {
    expect(splitTitles('ArcGIS 12.1 ver 2.0')).toEqual(['ArcGIS 12.1 ver 2.0']);
  });
});
