type Cell = string | number | null | undefined;

/**
 * RFC 4180 escaping, plus a guard against spreadsheet formula injection:
 * text starting with = + - @ would otherwise be executed by Excel/Sheets.
 */
export function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * RFC 4180 parser: quoted fields, escaped quotes, commas and line breaks
 * inside quotes, CRLF or LF row endings, optional UTF-8 BOM. Blank lines are
 * skipped. Cells are returned as raw strings.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') endRow();
    else if (char === '\r') {
      if (input[i + 1] === '\n') i++;
      endRow();
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Reverses the formula guard added by `escapeCell`, so export -> import is lossless. */
export function unguardCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
