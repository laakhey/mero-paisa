/**
 * Full-fidelity backup: every table row with its original id, so a restore
 * reproduces the app exactly (unlike CSV, which carries transactions only).
 *
 * Rows use database column names. Bump BACKUP_FORMAT only for a breaking
 * change; additive changes (a new table or optional column) must keep older
 * files restorable by treating what is missing as empty.
 */
import { priorityForKind, type CategoryPriority } from './priorities';

/** Written into every backup to identify the file format. */
export const BACKUP_APP = 'mero-paisa';
/**
 * Identifiers used by earlier versions, still accepted on restore so old
 * backups keep working (the app was developed as "Expense Manager"). Only ever
 * add to this list.
 */
const LEGACY_BACKUP_APPS: readonly string[] = ['expense-manager'];
export const BACKUP_FORMAT = 1;

export type BackupAccount = {
  id: number;
  name: string;
  type: string;
  icon: string;
  color: string;
  opening_balance: number;
  archived: number;
  created_at: string | null;
};

export type BackupCategory = {
  id: number;
  name: string;
  kind: string;
  icon: string;
  color: string;
  archived: number;
  sort_order: number;
  /** 'need' | 'want' | null; absent from backups made before the feature existed. */
  priority: CategoryPriority | null;
};

export type BackupLabel = { id: number; name: string; color: string; created_at: string | null };

export type BackupTransaction = {
  id: number;
  type: string;
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  note: string;
  occurred_on: string;
  created_at: string | null;
  updated_at: string | null;
};

export type BackupTransactionLabel = { transaction_id: number; label_id: number };
export type BackupBudget = { id: number; category_id: number; amount: number };

export type BackupSplitGroup = { id: number; name: string; color: string; archived: number; created_at: string | null };
export type BackupSplitMember = { id: number; group_id: number; name: string; is_me: number };
export type BackupSplitExpense = {
  id: number;
  group_id: number;
  kind: string;
  description: string;
  amount: number;
  paid_by: number;
  occurred_on: string;
  split_method: string;
  transaction_id: number | null;
  created_at: string | null;
};
export type BackupSplitShare = { expense_id: number; member_id: number; amount: number; weight: number | null };

export type BackupData = {
  accounts: BackupAccount[];
  categories: BackupCategory[];
  labels: BackupLabel[];
  transactions: BackupTransaction[];
  transactionLabels: BackupTransactionLabel[];
  budgets: BackupBudget[];
  /** Split bills; absent from backups made before the feature existed. */
  splitGroups: BackupSplitGroup[];
  splitMembers: BackupSplitMember[];
  splitExpenses: BackupSplitExpense[];
  splitShares: BackupSplitShare[];
};

export type Backup = {
  app: typeof BACKUP_APP;
  format: number;
  createdAt: string;
  currency: string;
  theme: 'system' | 'light' | 'dark';
  data: BackupData;
};

export function buildBackup(data: BackupData, currency: string, theme: Backup['theme'], now = new Date()): Backup {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, createdAt: now.toISOString(), currency, theme, data };
}

/* ------------------------------ validation ------------------------------ */

type Row = Record<string, unknown>;

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isInt = (value: unknown): value is number => Number.isSafeInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isName = (value: unknown): value is string => isText(value) && value.trim().length > 0;
const optionalText = (value: unknown): string | null => (isText(value) && value ? value : null);
const flag = (value: unknown): number => (value === 1 || value === true ? 1 : 0);

const ACCOUNT_TYPES = new Set(['cash', 'bank', 'card', 'wallet', 'savings']);
const KINDS = new Set(['expense', 'income']);
const TRANSACTION_TYPES = new Set(['expense', 'income', 'transfer']);

class Invalid extends Error {}

function rowsOf(data: Row, key: string): Row[] {
  const value = data[key];
  // Tables added after a backup was made are simply absent from it.
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isObject)) throw new Invalid(`"${key}" is not a list of records.`);
  return value;
}

function uniqueIds(rows: { id: number }[], table: string): Set<number> {
  const ids = new Set(rows.map((row) => row.id));
  if (ids.size !== rows.length) throw new Invalid(`${table} contain a repeated id.`);
  return ids;
}

/**
 * Parses and fully validates a backup file before anything is written, so a
 * damaged or hand-edited file can never leave the database half-restored.
 * Checks mirror the database constraints (types, positive amounts, transfer
 * rules, references) and unknown fields are dropped.
 */
export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'This file is not a backup: it could not be read as JSON.' };
  }
  if (!isObject(raw) || !isObject(raw.data) || (raw.app !== BACKUP_APP && !LEGACY_BACKUP_APPS.includes(String(raw.app)))) {
    return { error: 'This file is not a Mero Paisa backup.' };
  }
  if (!isInt(raw.format) || raw.format < 1) return { error: 'This backup has no valid format version.' };
  if (raw.format > BACKUP_FORMAT) {
    return { error: 'This backup was made by a newer version of the app. Update the app, then restore.' };
  }
  if (!isText(raw.currency) || !/^[A-Za-z]{3}$/.test(raw.currency)) {
    return { error: 'This backup has no valid currency.' };
  }

  try {
    const source = raw.data;

    const accounts = rowsOf(source, 'accounts').map((r): BackupAccount => {
      if (!isId(r.id) || !isName(r.name) || !isText(r.type) || !ACCOUNT_TYPES.has(r.type) || !isInt(r.opening_balance)) {
        throw new Invalid('An account record is invalid.');
      }
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        icon: isName(r.icon) ? r.icon : 'bank',
        color: isName(r.color) ? r.color : '#64748B',
        opening_balance: r.opening_balance,
        archived: flag(r.archived),
        created_at: optionalText(r.created_at),
      };
    });
    const accountIds = uniqueIds(accounts, 'Accounts');
    if (accounts.length === 0) throw new Invalid('The backup has no accounts.');

    const categories = rowsOf(source, 'categories').map((r, index): BackupCategory => {
      if (!isId(r.id) || !isName(r.name) || !isText(r.kind) || !KINDS.has(r.kind)) {
        throw new Invalid('A category record is invalid.');
      }
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        icon: isName(r.icon) ? r.icon : 'tag',
        color: isName(r.color) ? r.color : '#64748B',
        archived: flag(r.archived),
        sort_order: isInt(r.sort_order) ? r.sort_order : index,
        priority: priorityForKind(r.kind, r.priority),
      };
    });
    const categoryIds = uniqueIds(categories, 'Categories');
    const expenseCategoryIds = new Set(categories.filter((c) => c.kind === 'expense').map((c) => c.id));

    const labels = rowsOf(source, 'labels').map((r): BackupLabel => {
      if (!isId(r.id) || !isName(r.name)) throw new Invalid('A label record is invalid.');
      return { id: r.id, name: r.name, color: isName(r.color) ? r.color : '#64748B', created_at: optionalText(r.created_at) };
    });
    const labelIds = uniqueIds(labels, 'Labels');
    if (new Set(labels.map((l) => l.name.toLowerCase())).size !== labels.length) {
      throw new Invalid('Two labels share the same name.');
    }

    const transactions = rowsOf(source, 'transactions').map((r): BackupTransaction => {
      const toAccount = r.to_account_id ?? null;
      const category = r.category_id ?? null;
      const valid =
        isId(r.id) &&
        isText(r.type) &&
        TRANSACTION_TYPES.has(r.type) &&
        isInt(r.amount) &&
        r.amount > 0 &&
        isId(r.account_id) &&
        accountIds.has(r.account_id) &&
        isText(r.occurred_on) &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on) &&
        (toAccount === null || (isId(toAccount) && accountIds.has(toAccount) && toAccount !== r.account_id)) &&
        (category === null || (isId(category) && categoryIds.has(category))) &&
        // Same rule as the table's CHECK: only transfers have a destination.
        (r.type === 'transfer') === (toAccount !== null);
      if (!valid) throw new Invalid('A transaction record is invalid or refers to a missing account or category.');
      return {
        id: r.id as number,
        type: r.type as string,
        amount: r.amount as number,
        account_id: r.account_id as number,
        to_account_id: toAccount as number | null,
        category_id: category as number | null,
        note: isText(r.note) ? r.note : '',
        occurred_on: r.occurred_on as string,
        created_at: optionalText(r.created_at),
        updated_at: optionalText(r.updated_at),
      };
    });
    const transactionIds = uniqueIds(transactions, 'Transactions');

    const seenLinks = new Set<string>();
    const transactionLabels = rowsOf(source, 'transactionLabels').map((r): BackupTransactionLabel => {
      const key = `${String(r.transaction_id)}:${String(r.label_id)}`;
      if (!isId(r.transaction_id) || !isId(r.label_id) || !transactionIds.has(r.transaction_id) || !labelIds.has(r.label_id) || seenLinks.has(key)) {
        throw new Invalid('A label assignment is invalid or refers to a missing transaction or label.');
      }
      seenLinks.add(key);
      return { transaction_id: r.transaction_id, label_id: r.label_id };
    });

    const budgets = rowsOf(source, 'budgets').map((r): BackupBudget => {
      if (!isId(r.id) || !isId(r.category_id) || !expenseCategoryIds.has(r.category_id) || !isInt(r.amount) || r.amount <= 0) {
        throw new Invalid('A budget record is invalid or refers to a missing category.');
      }
      return { id: r.id, category_id: r.category_id, amount: r.amount };
    });
    uniqueIds(budgets, 'Budgets');
    if (new Set(budgets.map((b) => b.category_id)).size !== budgets.length) {
      throw new Invalid('A category has more than one budget.');
    }

    const splitGroups = rowsOf(source, 'splitGroups').map((r): BackupSplitGroup => {
      if (!isId(r.id) || !isName(r.name)) throw new Invalid('A split group record is invalid.');
      return {
        id: r.id,
        name: r.name,
        color: isName(r.color) ? r.color : '#64748B',
        archived: flag(r.archived),
        created_at: optionalText(r.created_at),
      };
    });
    const splitGroupIds = uniqueIds(splitGroups, 'Split groups');

    const splitMembers = rowsOf(source, 'splitMembers').map((r): BackupSplitMember => {
      if (!isId(r.id) || !isId(r.group_id) || !splitGroupIds.has(r.group_id) || !isName(r.name)) {
        throw new Invalid('A split group member record is invalid or refers to a missing group.');
      }
      return { id: r.id, group_id: r.group_id, name: r.name, is_me: flag(r.is_me) };
    });
    const splitMemberGroup = new Map(splitMembers.map((m) => [m.id, m.group_id]));
    uniqueIds(splitMembers, 'Split group members');

    const splitExpenses = rowsOf(source, 'splitExpenses').map((r): BackupSplitExpense => {
      const valid =
        isId(r.id) &&
        isId(r.group_id) &&
        splitGroupIds.has(r.group_id) &&
        (r.kind === 'expense' || r.kind === 'settlement') &&
        isInt(r.amount) &&
        r.amount > 0 &&
        isId(r.paid_by) &&
        splitMemberGroup.get(r.paid_by) === r.group_id &&
        isText(r.occurred_on) &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on);
      if (!valid) throw new Invalid('A split bill record is invalid or refers to a missing group or person.');
      const linked = r.transaction_id ?? null;
      return {
        id: r.id as number,
        group_id: r.group_id as number,
        kind: r.kind as string,
        description: isText(r.description) ? r.description : '',
        amount: r.amount as number,
        paid_by: r.paid_by as number,
        occurred_on: r.occurred_on as string,
        split_method: r.split_method === 'exact' || r.split_method === 'shares' ? r.split_method : 'equal',
        // A link to a transaction that is not in the backup is simply dropped.
        transaction_id: isId(linked) && transactionIds.has(linked) ? linked : null,
        created_at: optionalText(r.created_at),
      };
    });
    const splitExpenseById = new Map(splitExpenses.map((e) => [e.id, e]));
    uniqueIds(splitExpenses, 'Split bills');

    const seenShares = new Set<string>();
    const splitShares = rowsOf(source, 'splitShares').map((r): BackupSplitShare => {
      const expense = isId(r.expense_id) ? splitExpenseById.get(r.expense_id) : undefined;
      const key = `${String(r.expense_id)}:${String(r.member_id)}`;
      if (!expense || !isId(r.member_id) || splitMemberGroup.get(r.member_id) !== expense.group_id || !isInt(r.amount) || r.amount < 0 || seenShares.has(key)) {
        throw new Invalid('A split share record is invalid or refers to a missing bill or person.');
      }
      seenShares.add(key);
      return {
        expense_id: expense.id,
        member_id: r.member_id,
        amount: r.amount,
        weight: typeof r.weight === 'number' && Number.isFinite(r.weight) ? r.weight : null,
      };
    });
    for (const expense of splitExpenses) {
      const total = splitShares.filter((s) => s.expense_id === expense.id).reduce((sum, s) => sum + s.amount, 0);
      if (total !== expense.amount) throw new Invalid('A split bill\'s shares do not add up to its total.');
    }

    const theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system';
    return {
      backup: {
        app: BACKUP_APP,
        format: raw.format,
        createdAt: isText(raw.createdAt) ? raw.createdAt : '',
        currency: raw.currency.toUpperCase(),
        theme,
        data: {
          accounts, categories, labels, transactions, transactionLabels, budgets,
          splitGroups, splitMembers, splitExpenses, splitShares,
        },
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { error: `This backup is damaged. ${error.message}` };
    throw error;
  }
}
