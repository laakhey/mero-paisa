import { parseCsv, unguardCell } from './csv';
import { fromDayKey, toDayKey } from './dates';
import { parseAmount } from './money';

export type ImportRow = {
  /** 1-based line in the file, for error messages. */
  line: number;
  occurredOn: string;
  type: 'expense' | 'income' | 'transfer';
  /** Positive minor units. */
  amount: number;
  account: string;
  /** Empty unless `type` is transfer. */
  toAccount: string;
  /** Empty for transfers. */
  category: string;
  labels: string[];
  note: string;
};

export type ImportParseResult = { rows: ImportRow[]; errors: string[] };

const REQUIRED = ['date', 'type', 'amount', 'account'] as const;
const TYPES = new Set(['expense', 'income', 'transfer']);
export const UNCATEGORISED = 'Uncategorised';

function isRealDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toDayKey(fromDayKey(value)) === value;
}

/**
 * Validates a CSV in the app's export format. Columns are matched by header
 * name (any order, case-insensitive); Currency, Category, To account, Labels
 * and Note are optional. The import is all-or-nothing, so every problem is
 * collected rather than stopping at the first.
 */
export function parseTransactionsCsv(text: string, currency: string): ImportParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: ['The file is empty.'] };

  const header = table[0].map((name) => name.trim().toLowerCase());
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`This does not look like a Mero Paisa export: missing column ${missing.map((m) => `"${m}"`).join(', ')}.`],
    };
  }
  const column = (name: string) => header.indexOf(name);
  const index = {
    date: column('date'),
    type: column('type'),
    amount: column('amount'),
    currency: column('currency'),
    category: column('category'),
    account: column('account'),
    toAccount: column('to account'),
    labels: column('labels'),
    note: column('note'),
  };

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const foreignCurrencies = new Set<string>();

  table.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const get = (i: number) => (i >= 0 ? unguardCell((cells[i] ?? '').trim()) : '');
    const fail = (message: string) => errors.push(`Line ${line}: ${message}`);

    const occurredOn = get(index.date);
    const type = get(index.type).toLowerCase();
    const rawAmount = (index.amount >= 0 ? (cells[index.amount] ?? '') : '').trim();
    const account = get(index.account);
    const toAccount = get(index.toAccount);
    const fileCurrency = get(index.currency).toUpperCase();

    if (fileCurrency && fileCurrency !== currency.toUpperCase()) {
      foreignCurrencies.add(fileCurrency);
      return;
    }
    if (!isRealDay(occurredOn)) return fail(`"${occurredOn}" is not a date in YYYY-MM-DD format.`);
    if (!TYPES.has(type)) return fail(`type must be expense, income or transfer, not "${type}".`);
    // The export signs expenses negative; the type column carries the direction.
    const amount = parseAmount(rawAmount.replace(/^[+-]/, ''), currency);
    if (amount === null || amount <= 0) return fail(`"${rawAmount}" is not a valid amount.`);
    if (!account) return fail('the account is missing.');
    if (type === 'transfer') {
      if (!toAccount) return fail('a transfer needs a "To account".');
      if (toAccount.toLowerCase() === account.toLowerCase()) return fail('a transfer needs two different accounts.');
    }

    rows.push({
      line,
      occurredOn,
      type: type as ImportRow['type'],
      amount,
      account,
      toAccount: type === 'transfer' ? toAccount : '',
      category: type === 'transfer' ? '' : get(index.category) || UNCATEGORISED,
      labels: get(index.labels)
        .split(';')
        .map((label) => label.trim())
        .filter(Boolean),
      note: get(index.note),
    });
  });

  if (foreignCurrencies.size > 0) {
    // Amounts are never converted, so importing another currency would silently relabel it.
    errors.unshift(
      `The file is in ${[...foreignCurrencies].join(', ')} but the app is set to ${currency}. Change the currency in Settings first.`
    );
  }
  if (errors.length === 0 && rows.length === 0) errors.push('The file has no transactions.');
  return { rows, errors };
}
