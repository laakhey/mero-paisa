import type { IconName } from '@/components/ui/icon';
import type { CategoryPriority } from '@/lib/priorities';

export type { CategoryPriority };

export type TransactionType = 'expense' | 'income' | 'transfer';
export type CategoryKind = 'expense' | 'income';
export type AccountType = 'cash' | 'bank' | 'card' | 'wallet' | 'savings';

export type Account = {
  id: number;
  name: string;
  type: AccountType;
  icon: IconName;
  color: string;
  /** Minor units. */
  openingBalance: number;
  archived: boolean;
};

export type AccountWithBalance = Account & { balance: number };

export type Category = {
  id: number;
  name: string;
  kind: CategoryKind;
  icon: IconName;
  color: string;
  archived: boolean;
  /** Need or want; null for income categories and expense ones not sorted yet. */
  priority: CategoryPriority | null;
};

export type Transaction = {
  id: number;
  type: TransactionType;
  /** Always positive, in minor units; `type` gives the direction. */
  amount: number;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  note: string;
  /** Local calendar day, YYYY-MM-DD. */
  occurredOn: string;
};

export type Label = { id: number; name: string; color: string };

/** A transaction joined with the names needed to render a list row. */
export type TransactionRow = Transaction & {
  labels: Label[];
  accountName: string;
  toAccountName: string | null;
  categoryName: string | null;
  categoryIcon: IconName | null;
  categoryColor: string | null;
};

export type TransactionInput = Omit<Transaction, 'id'> & {
  /** When given, replaces the transaction's labels; omitted leaves them untouched. */
  labelIds?: number[];
};

export type Budget = {
  id: number;
  categoryId: number;
  /** Monthly limit in minor units. */
  amount: number;
};

export type BudgetProgress = Budget & {
  categoryName: string;
  categoryIcon: IconName;
  categoryColor: string;
  spent: number;
};

export type CategoryTotal = {
  categoryId: number | null;
  name: string;
  icon: IconName;
  color: string;
  priority: CategoryPriority | null;
  total: number;
  count: number;
};

export type MonthTotals = { month: string; income: number; expense: number };
