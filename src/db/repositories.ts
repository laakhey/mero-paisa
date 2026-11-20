import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/ui/icon';
import type { BackupData } from '@/lib/backup';
import { addMonths, monthRange, type MonthKey } from '@/lib/dates';
import type { ImportRow } from '@/lib/import';
import { parsePriority, priorityForKind, splitByPriority, type PrioritySplit } from '@/lib/priorities';
import { swatches } from '@/theme/tokens';

import { seedDefaults } from './seed';
import { notifyDataChanged } from './store';
import { WIPE_ORDER } from './sync-store';
import type {
  Account,
  AccountType,
  AccountWithBalance,
  Budget,
  BudgetProgress,
  Category,
  CategoryKind,
  CategoryTotal,
  Label,
  MonthTotals,
  TransactionInput,
  TransactionRow,
  TransactionType,
} from './types';

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

type AccountRecord = {
  id: number;
  name: string;
  type: AccountType;
  icon: IconName;
  color: string;
  opening_balance: number;
  archived: number;
  balance?: number;
};

const mapAccount = (r: AccountRecord): Account => ({
  id: r.id,
  name: r.name,
  type: r.type,
  icon: r.icon,
  color: r.color,
  openingBalance: r.opening_balance,
  archived: r.archived === 1,
});

/**
 * Balance = opening balance + income − expense − transfers out + transfers in.
 * Computed in SQL rather than stored, so it can never drift from the ledger.
 */
const BALANCE_SQL = `
  a.opening_balance
  + COALESCE((SELECT SUM(CASE t.type WHEN 'income' THEN t.amount ELSE -t.amount END)
              FROM transactions t WHERE t.account_id = a.id), 0)
  + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id), 0)
`;

export async function listAccounts(
  db: SQLiteDatabase,
  options: { includeArchived?: boolean } = {}
): Promise<AccountWithBalance[]> {
  const rows = await db.getAllAsync<AccountRecord & { balance: number }>(
    `SELECT a.*, ${BALANCE_SQL} AS balance FROM accounts a
     ${options.includeArchived ? '' : 'WHERE a.archived = 0'}
     ORDER BY a.archived, a.id`
  );
  return rows.map((r) => ({ ...mapAccount(r), balance: r.balance }));
}

export async function getAccount(db: SQLiteDatabase, id: number): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRecord>('SELECT * FROM accounts WHERE id = ?', id);
  return row ? mapAccount(row) : null;
}

export type AccountInput = Pick<Account, 'name' | 'type' | 'icon' | 'color' | 'openingBalance'>;

export async function saveAccount(
  db: SQLiteDatabase,
  input: AccountInput,
  id?: number
): Promise<number> {
  let savedId = id;
  if (id === undefined) {
    const result = await db.runAsync(
      'INSERT INTO accounts (name, type, icon, color, opening_balance) VALUES (?, ?, ?, ?, ?)',
      input.name.trim(),
      input.type,
      input.icon,
      input.color,
      input.openingBalance
    );
    savedId = result.lastInsertRowId;
  } else {
    await db.runAsync(
      'UPDATE accounts SET name = ?, type = ?, icon = ?, color = ?, opening_balance = ? WHERE id = ?',
      input.name.trim(),
      input.type,
      input.icon,
      input.color,
      input.openingBalance,
      id
    );
  }
  notifyDataChanged();
  return savedId as number;
}

/**
 * Accounts with history are archived instead of deleted so past transactions
 * keep their account; unused ones are removed outright.
 */
export async function removeAccount(db: SQLiteDatabase, id: number): Promise<'deleted' | 'archived'> {
  const used = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?',
    id,
    id
  );
  const outcome = (used?.n ?? 0) > 0 ? 'archived' : 'deleted';
  if (outcome === 'archived') {
    await db.runAsync('UPDATE accounts SET archived = 1 WHERE id = ?', id);
  } else {
    await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
  }
  notifyDataChanged();
  return outcome;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

type CategoryRecord = {
  id: number;
  name: string;
  kind: CategoryKind;
  icon: IconName;
  color: string;
  archived: number;
  priority: string | null;
};

const mapCategory = (r: CategoryRecord): Category => ({
  ...r,
  archived: r.archived === 1,
  priority: priorityForKind(r.kind, r.priority),
});

export async function listCategories(db: SQLiteDatabase, kind?: CategoryKind): Promise<Category[]> {
  const rows = kind
    ? await db.getAllAsync<CategoryRecord>(
        'SELECT * FROM categories WHERE archived = 0 AND kind = ? ORDER BY sort_order, id',
        kind
      )
    : await db.getAllAsync<CategoryRecord>(
        'SELECT * FROM categories WHERE archived = 0 ORDER BY kind, sort_order, id'
      );
  return rows.map(mapCategory);
}

export type CategoryWithUsage = Category & { uses: number };

/** Active categories, most used first, so pickers can surface the likely choice. */
export async function listCategoriesByUsage(db: SQLiteDatabase): Promise<CategoryWithUsage[]> {
  const rows = await db.getAllAsync<CategoryRecord & { uses: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS uses
     FROM categories c WHERE c.archived = 0
     ORDER BY uses DESC, c.sort_order, c.id`
  );
  return rows.map((r) => ({ ...mapCategory(r), uses: r.uses }));
}

export async function getCategory(db: SQLiteDatabase, id: number): Promise<Category | null> {
  const row = await db.getFirstAsync<CategoryRecord>('SELECT * FROM categories WHERE id = ?', id);
  return row ? mapCategory(row) : null;
}

export type CategoryInput = Pick<Category, 'name' | 'kind' | 'icon' | 'color' | 'priority'>;

export async function saveCategory(
  db: SQLiteDatabase,
  input: CategoryInput,
  id?: number
): Promise<void> {
  if (id === undefined) {
    await db.runAsync(
      `INSERT INTO categories (name, kind, icon, color, priority, sort_order)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`,
      input.name.trim(),
      input.kind,
      input.icon,
      input.color,
      priorityForKind(input.kind, input.priority)
    );
  } else {
    // `kind` is immutable after creation: flipping it would silently turn
    // existing expenses into income in every report. Priority follows the
    // stored kind, so an income category can never become a need or want.
    await db.runAsync(
      `UPDATE categories SET name = ?, icon = ?, color = ?,
         priority = CASE WHEN kind = 'expense' THEN ? END
       WHERE id = ?`,
      input.name.trim(),
      input.icon,
      input.color,
      parsePriority(input.priority),
      id
    );
  }
  notifyDataChanged();
}

export async function removeCategory(db: SQLiteDatabase, id: number): Promise<'deleted' | 'archived'> {
  const used = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?',
    id
  );
  const outcome = (used?.n ?? 0) > 0 ? 'archived' : 'deleted';
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM budgets WHERE category_id = ?', id);
    if (outcome === 'archived') {
      await db.runAsync('UPDATE categories SET archived = 1 WHERE id = ?', id);
    } else {
      await db.runAsync('DELETE FROM categories WHERE id = ?', id);
    }
  });
  notifyDataChanged();
  return outcome;
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

type TransactionRecord = {
  id: number;
  type: TransactionType;
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  note: string;
  occurred_on: string;
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
  category_icon: IconName | null;
  category_color: string | null;
  /** Comma-separated label ids, or null when the transaction has none. */
  label_ids: string | null;
};

const TRANSACTION_SELECT = `
  SELECT t.id, t.type, t.amount, t.account_id, t.to_account_id, t.category_id, t.note,
         t.occurred_on, a.name AS account_name, ta.name AS to_account_name,
         c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         (SELECT group_concat(tl.label_id) FROM transaction_labels tl
          WHERE tl.transaction_id = t.id) AS label_ids
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
`;

function mapTransaction(r: TransactionRecord, labelsById: Map<number, Label>): TransactionRow {
  const labels = (r.label_ids ?? '')
    .split(',')
    .map((id) => labelsById.get(Number(id)))
    .filter((label): label is Label => label !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...mapTransactionFields(r), labels };
}

const mapTransactionFields = (r: TransactionRecord): Omit<TransactionRow, 'labels'> => ({
  id: r.id,
  type: r.type,
  amount: r.amount,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  categoryId: r.category_id,
  note: r.note,
  occurredOn: r.occurred_on,
  accountName: r.account_name,
  toAccountName: r.to_account_name,
  categoryName: r.category_name,
  categoryIcon: r.category_icon,
  categoryColor: r.category_color,
});

export type TransactionFilter = {
  month?: MonthKey;
  type?: TransactionType;
  search?: string;
  categoryId?: number;
  accountId?: number;
  labelId?: number;
  limit?: number;
};

export async function listTransactions(
  db: SQLiteDatabase,
  filter: TransactionFilter = {}
): Promise<TransactionRow[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.month) {
    const { start, end } = monthRange(filter.month);
    where.push('t.occurred_on >= ? AND t.occurred_on < ?');
    params.push(start, end);
  }
  if (filter.type) {
    where.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.categoryId !== undefined) {
    where.push('t.category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.accountId !== undefined) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filter.accountId, filter.accountId);
  }
  if (filter.labelId !== undefined) {
    where.push(
      'EXISTS (SELECT 1 FROM transaction_labels tl WHERE tl.transaction_id = t.id AND tl.label_id = ?)'
    );
    params.push(filter.labelId);
  }
  const search = filter.search?.trim();
  if (search) {
    // Escape LIKE wildcards so a search for "50%" matches literally.
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(
      `(t.note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM transaction_labels tl JOIN labels l ON l.id = tl.label_id
                   WHERE tl.transaction_id = t.id AND l.name LIKE ? ESCAPE '\\'))`
    );
    params.push(pattern, pattern, pattern, pattern);
  }

  let sql = TRANSACTION_SELECT;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' ORDER BY t.occurred_on DESC, t.id DESC';
  if (filter.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }
  const rows = await db.getAllAsync<TransactionRecord>(sql, params);
  const labelsById = await labelMap(db);
  return rows.map((row) => mapTransaction(row, labelsById));
}

export async function getTransaction(db: SQLiteDatabase, id: number): Promise<TransactionRow | null> {
  const row = await db.getFirstAsync<TransactionRecord>(`${TRANSACTION_SELECT} WHERE t.id = ?`, id);
  return row ? mapTransaction(row, await labelMap(db)) : null;
}

export function validateTransaction(input: TransactionInput): string | null {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return 'Enter an amount greater than zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return 'Pick a valid date.';
  if (input.type === 'transfer') {
    if (input.toAccountId === null) return 'Choose the account to transfer to.';
    if (input.toAccountId === input.accountId) return 'Choose two different accounts.';
  } else if (input.categoryId === null) {
    return 'Choose a category.';
  }
  return null;
}

export async function saveTransaction(
  db: SQLiteDatabase,
  input: TransactionInput,
  id?: number
): Promise<void> {
  const problem = validateTransaction(input);
  if (problem) throw new Error(problem);

  const isTransfer = input.type === 'transfer';
  const values = [
    input.type,
    input.amount,
    input.accountId,
    isTransfer ? input.toAccountId : null,
    isTransfer ? null : input.categoryId,
    input.note.trim(),
    input.occurredOn,
  ];
  await db.withTransactionAsync(async () => {
    let transactionId = id;
    if (id === undefined) {
      const result = await db.runAsync(
        `INSERT INTO transactions (type, amount, account_id, to_account_id, category_id, note, occurred_on)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values
      );
      transactionId = result.lastInsertRowId;
    } else {
      await db.runAsync(
        `UPDATE transactions
         SET type = ?, amount = ?, account_id = ?, to_account_id = ?, category_id = ?, note = ?,
             occurred_on = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [...values, id]
      );
    }
    if (input.labelIds && transactionId !== undefined) {
      await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', transactionId);
      for (const labelId of new Set(input.labelIds)) {
        await db.runAsync(
          'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
          transactionId,
          labelId
        );
      }
    }
  });
  notifyDataChanged();
}

export async function deleteTransaction(db: SQLiteDatabase, id: number): Promise<void> {
  // Label links are removed explicitly rather than relying on ON DELETE CASCADE,
  // which only works while the foreign_keys pragma is on for the connection.
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', id);
    // A split bill may point at this transaction as "my share"; the bill stays, unlinked.
    await db.runAsync('UPDATE split_expenses SET transaction_id = NULL WHERE transaction_id = ?', id);
    await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  });
  notifyDataChanged();
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const MAX_LABEL_LENGTH = 24;

export async function listLabels(db: SQLiteDatabase): Promise<Label[]> {
  return db.getAllAsync<Label>('SELECT id, name, color FROM labels ORDER BY name COLLATE NOCASE');
}

async function labelMap(db: SQLiteDatabase): Promise<Map<number, Label>> {
  return new Map((await listLabels(db)).map((label) => [label.id, label]));
}

/** Normalises user input: no leading "#", single spaces, bounded length. */
export function normalizeLabelName(input: string): string {
  return input.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH).trim();
}

/** Returns the existing label when the name is already taken (case-insensitive). */
export async function createLabel(db: SQLiteDatabase, input: string): Promise<Label> {
  const name = normalizeLabelName(input);
  if (!name) throw new Error('Enter a label name.');
  const existing = await db.getFirstAsync<Label>(
    'SELECT id, name, color FROM labels WHERE name = ? COLLATE NOCASE',
    name
  );
  if (existing) return existing;
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM labels');
  const color = swatches[(count?.n ?? 0) % swatches.length];
  const result = await db.runAsync('INSERT INTO labels (name, color) VALUES (?, ?)', name, color);
  notifyDataChanged();
  return { id: result.lastInsertRowId, name, color };
}

/** Deletes the label and removes it from every transaction; the transactions stay. */
export async function deleteLabel(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transaction_labels WHERE label_id = ?', id);
    await db.runAsync('DELETE FROM labels WHERE id = ?', id);
  });
  notifyDataChanged();
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export async function listBudgetProgress(db: SQLiteDatabase, month: MonthKey): Promise<BudgetProgress[]> {
  const { start, end } = monthRange(month);
  const rows = await db.getAllAsync<{
    id: number;
    category_id: number;
    amount: number;
    name: string;
    icon: IconName;
    color: string;
    spent: number;
  }>(
    `SELECT b.id, b.category_id, b.amount, c.name, c.icon, c.color,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
                      WHERE t.category_id = b.category_id AND t.type = 'expense'
                        AND t.occurred_on >= ? AND t.occurred_on < ?), 0) AS spent
     FROM budgets b JOIN categories c ON c.id = b.category_id
     WHERE c.archived = 0
     ORDER BY (spent * 1.0 / b.amount) DESC`,
    start,
    end
  );
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    amount: r.amount,
    categoryName: r.name,
    categoryIcon: r.icon,
    categoryColor: r.color,
    spent: r.spent,
  }));
}

export async function getBudgetForCategory(db: SQLiteDatabase, categoryId: number): Promise<Budget | null> {
  const row = await db.getFirstAsync<{ id: number; category_id: number; amount: number }>(
    'SELECT * FROM budgets WHERE category_id = ?',
    categoryId
  );
  return row ? { id: row.id, categoryId: row.category_id, amount: row.amount } : null;
}

export async function setBudget(db: SQLiteDatabase, categoryId: number, amount: number): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a budget greater than zero.');
  await db.runAsync(
    `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
     ON CONFLICT(category_id) DO UPDATE SET amount = excluded.amount`,
    categoryId,
    amount
  );
  notifyDataChanged();
}

export async function deleteBudget(db: SQLiteDatabase, categoryId: number): Promise<void> {
  await db.runAsync('DELETE FROM budgets WHERE category_id = ?', categoryId);
  notifyDataChanged();
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export async function getMonthTotals(db: SQLiteDatabase, month: MonthKey): Promise<MonthTotals> {
  const { start, end } = monthRange(month);
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
     FROM transactions WHERE occurred_on >= ? AND occurred_on < ?`,
    start,
    end
  );
  return { month, income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Totals for the `count` months ending at `endMonth`, oldest first, gaps filled with zeros. */
/**
 * Totals for the `count` months ending at `endMonth`, oldest first, gaps filled
 * with zeros. Each month is queried by its own date range, because in the
 * Bikram Sambat calendar a month does not line up with an AD "YYYY-MM" prefix.
 */
export async function getMonthlyTrend(
  db: SQLiteDatabase,
  endMonth: MonthKey,
  count: number
): Promise<MonthTotals[]> {
  const first = addMonths(endMonth, -(count - 1));
  const months = Array.from({ length: count }, (_, i) => addMonths(first, i));
  const results: MonthTotals[] = [];
  for (const month of months) {
    results.push(await getMonthTotals(db, month));
  }
  return results;
}

export type CategoryMonthTotal = { month: MonthKey; total: number; count: number };

/**
 * One category's totals for the `count` months ending at `endMonth`, oldest
 * first, gaps filled with zeros. Counts only transactions matching the
 * category's kind, the same rule `getCategoryTotals` uses, so the numbers agree
 * with the Reports screen.
 */
export async function getCategoryMonthlyTotals(
  db: SQLiteDatabase,
  categoryId: number,
  endMonth: MonthKey,
  count: number
): Promise<CategoryMonthTotal[]> {
  const first = addMonths(endMonth, -(count - 1));
  const results: CategoryMonthTotal[] = [];
  for (let i = 0; i < count; i++) {
    const month = addMonths(first, i);
    const { start, end } = monthRange(month);
    const row = await db.getFirstAsync<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.category_id = ? AND t.type = c.kind AND t.occurred_on >= ? AND t.occurred_on < ?`,
      categoryId,
      start,
      end
    );
    results.push({ month, total: row?.total ?? 0, count: row?.count ?? 0 });
  }
  return results;
}

/**
 * A month's outflow split into needs, wants, savings & debt and not-yet-sorted.
 * Transfers into a savings-type account count as savings (out of one, as a
 * withdrawal); transfers between two savings accounts, or between ordinary
 * accounts such as paying off a card, move money without saving or spending it.
 */
export async function getPrioritySplit(db: SQLiteDatabase, month: MonthKey): Promise<PrioritySplit> {
  const { start, end } = monthRange(month);
  const rows = await db.getAllAsync<{ priority: string | null; total: number }>(
    `SELECT CASE WHEN c.kind = 'expense' THEN c.priority END AS priority, SUM(t.amount) AS total
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense' AND t.occurred_on >= ? AND t.occurred_on < ?
     GROUP BY 1`,
    start,
    end
  );
  const transfers = await db.getFirstAsync<{ net: number }>(
    `SELECT COALESCE(SUM(CASE WHEN dest.type = 'savings' THEN t.amount ELSE -t.amount END), 0) AS net
     FROM transactions t
     JOIN accounts src ON src.id = t.account_id
     JOIN accounts dest ON dest.id = t.to_account_id
     WHERE t.type = 'transfer' AND (src.type = 'savings') <> (dest.type = 'savings')
       AND t.occurred_on >= ? AND t.occurred_on < ?`,
    start,
    end
  );
  return splitByPriority(
    rows.map((r) => ({ priority: parsePriority(r.priority), total: r.total })),
    transfers?.net ?? 0
  );
}

export async function getCategoryTotals(
  db: SQLiteDatabase,
  month: MonthKey,
  kind: CategoryKind
): Promise<CategoryTotal[]> {
  const { start, end } = monthRange(month);
  const rows = await db.getAllAsync<{
    category_id: number | null;
    name: string | null;
    icon: IconName | null;
    color: string | null;
    priority: string | null;
    total: number;
    count: number;
  }>(
    `SELECT t.category_id, c.name, c.icon, c.color, c.priority, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type = ? AND t.occurred_on >= ? AND t.occurred_on < ?
     GROUP BY t.category_id
     ORDER BY total DESC`,
    kind,
    start,
    end
  );
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name ?? 'Uncategorised',
    icon: r.icon ?? 'tag',
    color: r.color ?? '#64748B',
    priority: priorityForKind(kind, r.priority),
    total: r.total,
    count: r.count,
  }));
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export type ImportSummary = {
  imported: number;
  /** Rows skipped because an identical transaction already exists. */
  duplicates: number;
  accountsCreated: number;
  categoriesCreated: number;
  labelsCreated: number;
};

/**
 * Inserts validated rows in one database transaction, so a failure leaves
 * nothing half-imported. Accounts, categories and labels are matched by name
 * (case-insensitive, archived ones included) and created when missing.
 *
 * A row identical to an existing transaction is skipped, which makes importing
 * the same file twice harmless. Matching is counted: if the file holds two
 * identical lunches and the database holds one, exactly one is added.
 */
export async function importTransactions(db: SQLiteDatabase, rows: ImportRow[]): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    duplicates: 0,
    accountsCreated: 0,
    categoriesCreated: 0,
    labelsCreated: 0,
  };
  const keyOf = (name: string) => name.trim().toLowerCase();

  await db.withTransactionAsync(async () => {
    const accounts = new Map(
      (await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM accounts')).map((a) => [keyOf(a.name), a.id])
    );
    const categories = new Map(
      (await db.getAllAsync<{ id: number; name: string; kind: string }>('SELECT id, name, kind FROM categories')).map(
        (c) => [`${c.kind}:${keyOf(c.name)}`, c.id]
      )
    );
    const labels = new Map((await listLabels(db)).map((l) => [keyOf(l.name), l.id]));

    const existing = new Map<string, number>();
    const fingerprint = (r: {
      type: string;
      amount: number;
      account_id: number;
      to_account_id: number | null;
      category_id: number | null;
      note: string;
      occurred_on: string;
    }) => JSON.stringify([r.occurred_on, r.type, r.amount, r.account_id, r.to_account_id, r.category_id, r.note]);
    for (const row of await db.getAllAsync<Parameters<typeof fingerprint>[0]>(
      'SELECT type, amount, account_id, to_account_id, category_id, note, occurred_on FROM transactions'
    )) {
      const key = fingerprint(row);
      existing.set(key, (existing.get(key) ?? 0) + 1);
    }

    const accountId = async (name: string) => {
      const found = accounts.get(keyOf(name));
      if (found !== undefined) return found;
      const result = await db.runAsync(
        "INSERT INTO accounts (name, type, icon, color) VALUES (?, 'bank', 'bank', ?)",
        name.trim(),
        swatches[accounts.size % swatches.length]
      );
      accounts.set(keyOf(name), result.lastInsertRowId);
      summary.accountsCreated += 1;
      return result.lastInsertRowId;
    };

    const categoryId = async (name: string, kind: CategoryKind) => {
      const key = `${kind}:${keyOf(name)}`;
      const found = categories.get(key);
      if (found !== undefined) return found;
      const result = await db.runAsync(
        `INSERT INTO categories (name, kind, icon, color, sort_order)
         VALUES (?, ?, 'tag', ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`,
        name.trim(),
        kind,
        swatches[categories.size % swatches.length]
      );
      categories.set(key, result.lastInsertRowId);
      summary.categoriesCreated += 1;
      return result.lastInsertRowId;
    };

    const labelId = async (input: string) => {
      const name = normalizeLabelName(input);
      if (!name) return null;
      const found = labels.get(keyOf(name));
      if (found !== undefined) return found;
      const result = await db.runAsync(
        'INSERT INTO labels (name, color) VALUES (?, ?)',
        name,
        swatches[labels.size % swatches.length]
      );
      labels.set(keyOf(name), result.lastInsertRowId);
      summary.labelsCreated += 1;
      return result.lastInsertRowId;
    };

    for (const row of rows) {
      const isTransfer = row.type === 'transfer';
      const record = {
        type: row.type,
        amount: row.amount,
        account_id: await accountId(row.account),
        to_account_id: isTransfer ? await accountId(row.toAccount) : null,
        category_id: isTransfer ? null : await categoryId(row.category, row.type as CategoryKind),
        note: row.note.trim(),
        occurred_on: row.occurredOn,
      };

      const key = fingerprint(record);
      const matches = existing.get(key) ?? 0;
      if (matches > 0) {
        existing.set(key, matches - 1);
        summary.duplicates += 1;
        continue;
      }

      const result = await db.runAsync(
        `INSERT INTO transactions (type, amount, account_id, to_account_id, category_id, note, occurred_on)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        record.type,
        record.amount,
        record.account_id,
        record.to_account_id,
        record.category_id,
        record.note,
        record.occurred_on
      );
      const linked = new Set<number>();
      for (const name of row.labels) {
        const id = await labelId(name);
        if (id === null || linked.has(id)) continue;
        linked.add(id);
        await db.runAsync(
          'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
          result.lastInsertRowId,
          id
        );
      }
      summary.imported += 1;
    }
  });

  notifyDataChanged();
  return summary;
}

/* ------------------------------------------------------------------ */
/* Backup & restore                                                    */
/* ------------------------------------------------------------------ */

/** Reads every table with explicit columns, so the file format cannot drift with `SELECT *`. */
export async function readBackupData(db: SQLiteDatabase): Promise<BackupData> {
  // One read transaction gives a consistent snapshot across the tables.
  let data: BackupData | undefined;
  await db.withTransactionAsync(async () => {
    data = {
      accounts: await db.getAllAsync(
        'SELECT id, name, type, icon, color, opening_balance, archived, created_at FROM accounts ORDER BY id'
      ),
      categories: await db.getAllAsync(
        'SELECT id, name, kind, icon, color, archived, sort_order, priority FROM categories ORDER BY id'
      ),
      labels: await db.getAllAsync('SELECT id, name, color, created_at FROM labels ORDER BY id'),
      transactions: await db.getAllAsync(
        `SELECT id, type, amount, account_id, to_account_id, category_id, note, occurred_on, created_at, updated_at
         FROM transactions ORDER BY id`
      ),
      transactionLabels: await db.getAllAsync(
        'SELECT transaction_id, label_id FROM transaction_labels ORDER BY transaction_id, label_id'
      ),
      budgets: await db.getAllAsync('SELECT id, category_id, amount FROM budgets ORDER BY id'),
      splitGroups: await db.getAllAsync('SELECT id, name, color, archived, created_at FROM split_groups ORDER BY id'),
      splitMembers: await db.getAllAsync('SELECT id, group_id, name, is_me FROM split_members ORDER BY id'),
      splitExpenses: await db.getAllAsync(
        `SELECT id, group_id, kind, description, amount, paid_by, occurred_on, split_method, transaction_id, created_at
         FROM split_expenses ORDER BY id`
      ),
      splitShares: await db.getAllAsync(
        'SELECT expense_id, member_id, amount, weight FROM split_shares ORDER BY expense_id, member_id'
      ),
    };
  });
  return data as BackupData;
}

/**
 * Replaces ALL accounts, categories, labels, transactions and budgets with the
 * backup's, in one transaction: either the whole backup is in, or nothing
 * changed. `data` must come from `parseBackup`, which has already validated it.
 * Settings are not touched here; the caller applies currency and theme.
 */
export async function restoreBackupData(db: SQLiteDatabase, data: BackupData): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Children before parents, so foreign keys hold at every step.
    for (const table of WIPE_ORDER) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const a of data.accounts) {
      await db.runAsync(
        `INSERT INTO accounts (id, name, type, icon, color, opening_balance, archived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        a.id, a.name, a.type, a.icon, a.color, a.opening_balance, a.archived, a.created_at
      );
    }
    for (const c of data.categories) {
      await db.runAsync(
        `INSERT INTO categories (id, name, kind, icon, color, archived, sort_order, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id, c.name, c.kind, c.icon, c.color, c.archived, c.sort_order, c.priority
      );
    }
    for (const l of data.labels) {
      await db.runAsync(
        "INSERT INTO labels (id, name, color, created_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))",
        l.id, l.name, l.color, l.created_at
      );
    }
    for (const t of data.transactions) {
      await db.runAsync(
        `INSERT INTO transactions
           (id, type, amount, account_id, to_account_id, category_id, note, occurred_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`,
        t.id, t.type, t.amount, t.account_id, t.to_account_id, t.category_id, t.note, t.occurred_on,
        t.created_at, t.updated_at
      );
    }
    for (const link of data.transactionLabels) {
      await db.runAsync(
        'INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
        link.transaction_id, link.label_id
      );
    }
    for (const b of data.budgets) {
      await db.runAsync('INSERT INTO budgets (id, category_id, amount) VALUES (?, ?, ?)', b.id, b.category_id, b.amount);
    }
    for (const g of data.splitGroups) {
      await db.runAsync(
        "INSERT INTO split_groups (id, name, color, archived, created_at) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))",
        g.id, g.name, g.color, g.archived, g.created_at
      );
    }
    for (const m of data.splitMembers) {
      await db.runAsync(
        'INSERT INTO split_members (id, group_id, name, is_me) VALUES (?, ?, ?, ?)',
        m.id, m.group_id, m.name, m.is_me
      );
    }
    for (const e of data.splitExpenses) {
      await db.runAsync(
        `INSERT INTO split_expenses
           (id, group_id, kind, description, amount, paid_by, occurred_on, split_method, transaction_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        e.id, e.group_id, e.kind, e.description, e.amount, e.paid_by, e.occurred_on, e.split_method,
        e.transaction_id, e.created_at
      );
    }
    for (const s of data.splitShares) {
      await db.runAsync(
        'INSERT INTO split_shares (expense_id, member_id, amount, weight) VALUES (?, ?, ?, ?)',
        s.expense_id, s.member_id, s.amount, s.weight
      );
    }
  });
  notifyDataChanged();
}

/* ------------------------------------------------------------------ */
/* Settings & maintenance                                              */
/* ------------------------------------------------------------------ */

export async function readSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function writeSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}

export async function countTransactions(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return row?.n ?? 0;
}

/**
 * Deletes every account, category, label, budget and transaction, then
 * restores the default accounts and categories, as on a fresh install.
 * Settings (currency, theme, app lock) and the sync sign-in are kept. With
 * sync on, the deletions and the new defaults reach other devices as usual.
 */
export async function resetAllData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Children before parents, so references hold at every step.
    for (const table of WIPE_ORDER) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    await seedDefaults(db);
  });
  notifyDataChanged();
}

/** Removes all transactions and budgets; accounts, categories, labels and settings are kept. */
export async function clearLedger(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transaction_labels');
    await db.runAsync('UPDATE split_expenses SET transaction_id = NULL WHERE transaction_id IS NOT NULL');
    await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM budgets');
  });
  notifyDataChanged();
}
