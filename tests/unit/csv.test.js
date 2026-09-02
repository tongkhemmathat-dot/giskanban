import { describe, it, expect } from 'vitest';
import { toCsvField, buildCsv } from '../../server/utils/csv.js';

describe('toCsvField', () => {
  it('plain value passes through unquoted', () => {
    expect(toCsvField('hello')).toBe('hello');
  });

  it('null/undefined become empty string', () => {
    expect(toCsvField(null)).toBe('');
    expect(toCsvField(undefined)).toBe('');
  });

  it('a value containing a comma gets quoted', () => {
    expect(toCsvField('a,b')).toBe('"a,b"');
  });

  it('a value containing a quote gets quoted and the quote doubled', () => {
    expect(toCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('a value containing a newline gets quoted', () => {
    expect(toCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('buildCsv', () => {
  it('joins headers and rows with \\r\\n, comma-separated', () => {
    const csv = buildCsv(['a', 'b'], [['1', '2'], ['x,y', '3']]);
    expect(csv).toBe('a,b\r\n1,2\r\n"x,y",3');
  });
});
