import type { SQLiteDatabase } from 'expo-sqlite';

import { computeBalances, type LedgerEntry, type Share, type SplitMethod } from '@/lib/split';
import { swatches } from '@/theme/tokens';

import { notifyDataChanged } from './store';

/** All SQL for split bills. Change tracking for sync is done by triggers (see migrations). */

export type SplitGroup = { id: number; name: string; color: string };
export type SplitMember = { id: number; groupId: number; name: string; isMe: boolean };
export type SplitExpenseKind = 'expense' | 'settlement';

export type SplitExpense = {
  id: number;
  groupId: number;
  kind: SplitExpenseKind;
  description: string;
  amount: number;
  paidBy: number;
  occurredOn: string;
  splitMethod: SplitMethod;
  /** The personal transaction recording "my share", if any and if it still exists. */
  transactionId: number | null;
  shares: (Share & { weight: number | null })[];
};

export type SplitGroupSummary = SplitGroup & {
  memberCount: number;
  expenseCount: number;
  /** My net position: positive = I am owed, negative = I owe. */
  myBalance: number;
};

export type SplitGroupDetail = {
  group: SplitGroup;
  members: SplitMember[];
  expenses: SplitExpense[];
  balances: Map<number, number>;
};

type MemberRecord = { id: number; group_id: number; name: string; is_me: number };
type ExpenseRecord = {
  id: number;
  group_id: number;
  kind: SplitExpenseKind;
  description: string;
  amount: number;
  paid_by: number;
  occurred_on: string;
  split_method: SplitMethod;
  transaction_id: number | null;
};
type ShareRecord = { expense_id: number; member_id: number; amount: number; weight: number | null };

const mapMember = (r: MemberRecord): SplitMember => ({ id: r.id, groupId: r.group_id, name: r.name, isMe: r.is_me === 1 });

function buildExpenses(expenses: ExpenseRecord[], shares: ShareRecord[]): SplitExpense[] {
  const byExpense = new Map<number, SplitExpense['shares']>();
  for (const s of shares) {
    const list = byExpense.get(s.expense_id) ?? [];
    list.push({ memberId: s.member_id, amount: s.amount, weight: s.weight });
    byExpense.set(s.expense_id, list);
  }
  return expenses.map((e) => ({
    id: e.id,
    groupId: e.group_id,
    kind: e.kind,
    description: e.description,
    amount: e.amount,
    paidBy: e.paid_by,
    occurredOn: e.occurred_on,
    splitMethod: e.split_method,
    transactionId: e.transaction_id,
    shares: byExpense.get(e.id) ?? [],
  }));
}

const toLedger = (expenses: SplitExpense[]): LedgerEntry[] =>
  expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount, shares: e.shares }));

const EXPENSE_COLUMNS =
  'e.id, e.group_id, e.kind, e.description, e.amount, e.paid_by, e.occurred_on, e.split_method, ' +
  // Report the link only while the transaction still exists.
  '(SELECT t.id FROM transactions t WHERE t.id = e.transaction_id) AS transaction_id';

export async function listSplitGroups(db: SQLiteDatabase): Promise<SplitGroupSummary[]> {
  const groups = await db.getAllAsync<SplitGroup>(
    'SELECT id, name, color FROM split_groups WHERE archived = 0 ORDER BY id DESC'
  );
  const members = (await db.getAllAsync<MemberRecord>('SELECT id, group_id, name, is_me FROM split_members')).map(mapMember);
  const expenses = buildExpenses(
    await db.getAllAsync<ExpenseRecord>(`SELECT ${EXPENSE_COLUMNS} FROM split_expenses e`),
    await db.getAllAsync<ShareRecord>('SELECT expense_id, member_id, amount, weight FROM split_shares')
  );
  return groups.map((group) => {
    const groupMembers = members.filter((m) => m.groupId === group.id);
    const groupExpenses = expenses.filter((e) => e.groupId === group.id);
    const balances = computeBalances(groupMembers.map((m) => m.id), toLedger(groupExpenses));
    const me = groupMembers.find((m) => m.isMe);
    return {
      ...group,
      memberCount: groupMembers.length,
      expenseCount: groupExpenses.filter((e) => e.kind === 'expense').length,
      myBalance: me ? (balances.get(me.id) ?? 0) : 0,
    };
  });
}

export async function getSplitGroup(db: SQLiteDatabase, id: number): Promise<SplitGroupDetail | null> {
  const group = await db.getFirstAsync<SplitGroup>('SELECT id, name, color FROM split_groups WHERE id = ?', id);
  if (!group) return null;
  const members = (
    await db.getAllAsync<MemberRecord>(
      'SELECT id, group_id, name, is_me FROM split_members WHERE group_id = ? ORDER BY is_me DESC, id',
      id
    )
  ).map(mapMember);
  const expenses = buildExpenses(
    await db.getAllAsync<ExpenseRecord>(
      `SELECT ${EXPENSE_COLUMNS} FROM split_expenses e WHERE e.group_id = ? ORDER BY e.occurred_on DESC, e.id DESC`,
      id
    ),
    await db.getAllAsync<ShareRecord>(
      `SELECT s.expense_id, s.member_id, s.amount, s.weight FROM split_shares s
       JOIN split_expenses e ON e.id = s.expense_id WHERE e.group_id = ?`,
      id
    )
  );
  return { group, members, expenses, balances: computeBalances(members.map((m) => m.id), toLedger(expenses)) };
}

export async function getSplitExpense(db: SQLiteDatabase, id: number): Promise<SplitExpense | null> {
  const rows = await db.getAllAsync<ExpenseRecord>(`SELECT ${EXPENSE_COLUMNS} FROM split_expenses e WHERE e.id = ?`, id);
  if (rows.length === 0) return null;
  const shares = await db.getAllAsync<ShareRecord>(
    'SELECT expense_id, member_id, amount, weight FROM split_shares WHERE expense_id = ?',
    id
  );
  return buildExpenses(rows, shares)[0];
}

export type SplitGroupInput = {
  name: string;
  /** Existing members keep their id; new ones have none. The "me" member is managed automatically. */
  members: { id?: number; name: string }[];
};

/**
 * Creates or updates a group. Members missing from `input.members` are removed,
 * which is refused (with a message naming them) while they are part of any bill.
 */
export async function saveSplitGroup(db: SQLiteDatabase, input: SplitGroupInput, id?: number): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the group a name.');
  const members = input.members.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name);
  if (members.length === 0) throw new Error('Add at least one other person.');
  const names = members.map((m) => m.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Two people have the same name. Make each name different.');

  let groupId = id ?? 0;
  await db.withTransactionAsync(async () => {
    if (id === undefined) {
      const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM split_groups');
      const result = await db.runAsync(
        'INSERT INTO split_groups (name, color) VALUES (?, ?)',
        name,
        swatches[(count?.n ?? 0) % swatches.length]
      );
      groupId = result.lastInsertRowId;
      await db.runAsync("INSERT INTO split_members (group_id, name, is_me) VALUES (?, 'You', 1)", groupId);
    } else {
      await db.runAsync('UPDATE split_groups SET name = ? WHERE id = ?', name, id);
      const existing = await db.getAllAsync<MemberRecord>(
        'SELECT id, group_id, name, is_me FROM split_members WHERE group_id = ? AND is_me = 0',
        id
      );
      const keep = new Set(members.map((m) => m.id).filter((x): x is number => x !== undefined));
      for (const member of existing.filter((m) => !keep.has(m.id))) {
        const used = await db.getFirstAsync<{ n: number }>(
          `SELECT (SELECT COUNT(*) FROM split_shares WHERE member_id = ?) +
                  (SELECT COUNT(*) FROM split_expenses WHERE paid_by = ?) AS n`,
          member.id,
          member.id
        );
        if ((used?.n ?? 0) > 0) {
          throw new Error(`${member.name} is part of bills in this group and cannot be removed.`);
        }
        await db.runAsync('DELETE FROM split_members WHERE id = ?', member.id);
      }
    }
    for (const member of members) {
      if (member.id === undefined) {
        await db.runAsync('INSERT INTO split_members (group_id, name) VALUES (?, ?)', groupId, member.name);
      } else {
        await db.runAsync('UPDATE split_members SET name = ? WHERE id = ? AND group_id = ? AND is_me = 0', member.name, member.id, groupId);
      }
    }
  });
  notifyDataChanged();
  return groupId;
}

/** Deletes the group with its people and bills. Personal transactions made from "my share" are kept. */
export async function deleteSplitGroup(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM split_shares WHERE expense_id IN (SELECT id FROM split_expenses WHERE group_id = ?)', id);
    await db.runAsync('DELETE FROM split_expenses WHERE group_id = ?', id);
    await db.runAsync('DELETE FROM split_members WHERE group_id = ?', id);
    await db.runAsync('DELETE FROM split_groups WHERE id = ?', id);
  });
  notifyDataChanged();
}

export type SplitExpenseInput = {
  groupId: number;
  kind: SplitExpenseKind;
  description: string;
  amount: number;
  paidBy: number;
  occurredOn: string;
  splitMethod: SplitMethod;
  shares: (Share & { weight?: number | null })[];
  /**
   * When set (bills only), my share is also recorded as a personal expense in
   * this category and account, kept in step with the bill from then on.
   */
  personal: { categoryId: number; accountId: number } | null;
};

/**
 * Saves a bill or settlement and its shares in one transaction, together with
 * the linked personal "my share" transaction: created, updated or removed to
 * match. Recording only my share is what keeps account balances right once
 * everyone has settled, whoever paid at the time.
 */
export async function saveSplitExpense(db: SQLiteDatabase, input: SplitExpenseInput, id?: number): Promise<void> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (input.shares.reduce((sum, s) => sum + s.amount, 0) !== input.amount) {
    throw new Error('The shares do not add up to the total.');
  }
  const description = input.description.trim();

  await db.withTransactionAsync(async () => {
    const previous = id === undefined ? null : await getSplitExpense(db, id);
    let expenseId = id ?? 0;
    const values = [input.kind, description, input.amount, input.paidBy, input.occurredOn, input.splitMethod];
    if (id === undefined) {
      const result = await db.runAsync(
        `INSERT INTO split_expenses (kind, description, amount, paid_by, occurred_on, split_method, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [...values, input.groupId]
      );
      expenseId = result.lastInsertRowId;
    } else {
      await db.runAsync(
        `UPDATE split_expenses SET kind = ?, description = ?, amount = ?, paid_by = ?, occurred_on = ?, split_method = ?
         WHERE id = ?`,
        [...values, id]
      );
    }

    await db.runAsync('DELETE FROM split_shares WHERE expense_id = ?', expenseId);
    for (const share of input.shares) {
      await db.runAsync(
        'INSERT INTO split_shares (expense_id, member_id, amount, weight) VALUES (?, ?, ?, ?)',
        expenseId,
        share.memberId,
        share.amount,
        share.weight ?? null
      );
    }

    // Keep the personal "my share" transaction in step.
    const me = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM split_members WHERE group_id = ? AND is_me = 1',
      input.groupId
    );
    const myShare = input.shares.find((s) => s.memberId === me?.id)?.amount ?? 0;
    const group = await db.getFirstAsync<{ name: string }>('SELECT name FROM split_groups WHERE id = ?', input.groupId);
    const note = [description, group?.name].filter(Boolean).join(' · ');
    let transactionId = previous?.transactionId ?? null;

    if (input.kind === 'expense' && input.personal && myShare > 0) {
      if (transactionId === null) {
        const result = await db.runAsync(
          `INSERT INTO transactions (type, amount, account_id, category_id, note, occurred_on)
           VALUES ('expense', ?, ?, ?, ?, ?)`,
          myShare,
          input.personal.accountId,
          input.personal.categoryId,
          note,
          input.occurredOn
        );
        transactionId = result.lastInsertRowId;
      } else {
        await db.runAsync(
          `UPDATE transactions SET amount = ?, account_id = ?, category_id = ?, note = ?, occurred_on = ?,
             updated_at = datetime('now') WHERE id = ?`,
          myShare,
          input.personal.accountId,
          input.personal.categoryId,
          note,
          input.occurredOn,
          transactionId
        );
      }
    } else if (transactionId !== null) {
      await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', transactionId);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', transactionId);
      transactionId = null;
    }
    await db.runAsync('UPDATE split_expenses SET transaction_id = ? WHERE id = ?', transactionId, expenseId);
  });
  notifyDataChanged();
}

/** Deletes a bill or settlement, and the personal "my share" transaction made from it. */
export async function deleteSplitExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const expense = await getSplitExpense(db, id);
    await db.runAsync('DELETE FROM split_shares WHERE expense_id = ?', id);
    await db.runAsync('DELETE FROM split_expenses WHERE id = ?', id);
    if (expense?.transactionId) {
      await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', expense.transactionId);
      await db.runAsync('DELETE FROM transactions WHERE id = ?', expense.transactionId);
    }
  });
  notifyDataChanged();
}

/** The category and account of the personal transaction linked to a bill, for pre-filling the form. */
export async function getLinkedTransaction(
  db: SQLiteDatabase,
  transactionId: number
): Promise<{ categoryId: number | null; accountId: number } | null> {
  const row = await db.getFirstAsync<{ category_id: number | null; account_id: number }>(
    'SELECT category_id, account_id FROM transactions WHERE id = ?',
    transactionId
  );
  return row ? { categoryId: row.category_id, accountId: row.account_id } : null;
}
