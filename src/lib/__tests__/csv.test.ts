import { escapeCell, toCsv } from '../csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('line\nbreak')).toBe('"line\nbreak"');
  });
  it('neutralises spreadsheet formulas in text but keeps numbers', () => {
    expect(escapeCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(escapeCell('@cmd')).toBe("'@cmd");
    expect(escapeCell(-12.5)).toBe('-12.5');
  });
  it('builds rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('a,b\r\n1,\r\n');
  });
});
