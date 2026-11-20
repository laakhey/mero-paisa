import { parseCsv, toCsv, unguardCell } from '../csv';
import { parseTransactionsCsv } from '../import';

describe('parseCsv', () => {
  it('round-trips what toCsv writes, including quotes, commas and newlines', () => {
    const rows = [['a,b', 'say "hi"', 'two\nlines', ''], ['plain', '1', '', 'x']];
    expect(parseCsv(toCsv(['h1', 'h2', 'h3', 'h4'], rows))).toEqual([['h1', 'h2', 'h3', 'h4'], ...rows]);
  });
  it('accepts LF endings, a BOM, and skips blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('reverses the formula guard only where it was applied', () => {
    expect(unguardCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unguardCell("'quoted'")).toBe("'quoted'");
  });
});

const HEADER = 'Date,Type,Amount,Currency,Category,Account,To account,Labels,Note';

describe('parseTransactionsCsv', () => {
  it('reads the export format', () => {
    const csv = [
      HEADER,
      '2026-11-14,expense,-12.5,USD,Dining,Cash,,vacation; team,"Lunch, with ""QA"""',
      '2026-11-01,income,4200,USD,Salary,Bank account,,,',
      '2026-11-01,transfer,500,USD,,Bank account,Cash,,ATM',
    ].join('\r\n');
    const { rows, errors } = parseTransactionsCsv(csv, 'USD');
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, occurredOn: '2026-11-14', type: 'expense', amount: 1250, account: 'Cash', toAccount: '', category: 'Dining', labels: ['vacation', 'team'], note: 'Lunch, with "QA"' },
      { line: 3, occurredOn: '2026-11-01', type: 'income', amount: 420000, account: 'Bank account', toAccount: '', category: 'Salary', labels: [], note: '' },
      { line: 4, occurredOn: '2026-11-01', type: 'transfer', amount: 50000, account: 'Bank account', toAccount: 'Cash', category: '', labels: [], note: 'ATM' },
    ]);
  });

  it('matches columns by name in any order and tolerates missing optional ones', () => {
    const { rows, errors } = parseTransactionsCsv('account,AMOUNT,type,date\nCash,3,expense,2026-01-02\n', 'USD');
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ amount: 300, category: 'Uncategorised', labels: [], note: '' });
  });

  it('rejects files that are not an export', () => {
    expect(parseTransactionsCsv('name,price\nx,1\n', 'USD').errors[0]).toMatch(/missing column/);
    expect(parseTransactionsCsv('', 'USD').errors).toEqual(['The file is empty.']);
    expect(parseTransactionsCsv(HEADER + '\n', 'USD').errors).toEqual(['The file has no transactions.']);
  });

  it('reports every bad row with its line number', () => {
    const csv = [
      HEADER,
      '2026-02-30,expense,-1,USD,Dining,Cash,,,',
      '2026-02-01,refund,-1,USD,Dining,Cash,,,',
      '2026-02-01,expense,abc,USD,Dining,Cash,,,',
      '2026-02-01,expense,0,USD,Dining,Cash,,,',
      '2026-02-01,transfer,5,USD,,Cash,cash,,',
      '2026-02-01,expense,5,USD,Dining,,,,',
    ].join('\n');
    const { errors } = parseTransactionsCsv(csv, 'USD');
    expect(errors.map((e) => e.slice(0, 7))).toEqual(['Line 2:', 'Line 3:', 'Line 4:', 'Line 5:', 'Line 6:', 'Line 7:']);
  });

  it('refuses a file in another currency instead of relabelling amounts', () => {
    const { errors } = parseTransactionsCsv(HEADER + '\n2026-02-01,expense,-5,EUR,Dining,Cash,,,\n', 'USD');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/EUR.*USD/);
  });
});
