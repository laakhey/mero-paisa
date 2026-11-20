/**
 * Needs, wants and savings & debt (the 50/30/20 buckets): an optional label on
 * expense categories. `null` means the user has not sorted the category yet.
 * "savings" also covers debt repayment, e.g. a loan EMI.
 */
export type CategoryPriority = 'need' | 'want' | 'savings';

export const PRIORITIES: readonly CategoryPriority[] = ['need', 'want', 'savings'];

export const PRIORITY_LABELS: Record<CategoryPriority, string> = {
  need: 'Needs',
  want: 'Wants',
  savings: 'Savings & debt',
};

/** The 50/30/20 guideline, in percent of income. */
export const PRIORITY_TARGETS: Record<CategoryPriority, number> = { need: 50, want: 30, savings: 20 };

/** Reads a stored or imported value; anything unknown counts as "not sorted". */
export function parsePriority(value: unknown): CategoryPriority | null {
  return value === 'need' || value === 'want' || value === 'savings' ? value : null;
}

/** Only expense categories carry a priority; income is none of the three. */
export function priorityForKind(kind: string, priority: unknown): CategoryPriority | null {
  return kind === 'expense' ? parsePriority(priority) : null;
}

export type PriorityGroups<T> = Record<CategoryPriority | 'unsorted', T[]>;

/** Splits categories into the three buckets plus not-yet-sorted, keeping their order. */
export function groupByPriority<T extends { priority: CategoryPriority | null }>(items: T[]): PriorityGroups<T> {
  const groups: PriorityGroups<T> = { need: [], want: [], savings: [], unsorted: [] };
  for (const item of items) groups[item.priority ?? 'unsorted'].push(item);
  return groups;
}

export type PrioritySplit = {
  need: number;
  want: number;
  /** Savings & debt categories plus net transfers into savings accounts. */
  savings: number;
  unsorted: number;
  /** Net amount taken out of savings accounts this month (0 when more went in). */
  withdrawn: number;
  /** Sum of need, want, savings and unsorted. */
  total: number;
};

export type PriorityShare = {
  key: CategoryPriority | 'unsorted';
  value: number;
  /** Whole percent of the base (income, or total outflow when there was no income). */
  percent: number;
  /** The 50/30/20 target in percent; null when not comparing with income, or for unsorted. */
  target: number | null;
};

/**
 * The rows the report shows, in fixed order and without empty parts. Measured
 * against income, as the 50/30/20 guideline is; a month without income falls
 * back to shares of the month's outflow, where targets would be meaningless.
 */
export function priorityShares(
  split: PrioritySplit,
  income: number
): { base: 'income' | 'spending'; rows: PriorityShare[] } {
  const base = income > 0 ? 'income' : 'spending';
  const denominator = income > 0 ? income : split.total;
  const rows = ([...PRIORITIES, 'unsorted'] as const)
    .filter((key) => split[key] > 0)
    .map((key) => ({
      key,
      value: split[key],
      percent: denominator > 0 ? Math.round((split[key] / denominator) * 100) : 0,
      target: base === 'income' && key !== 'unsorted' ? PRIORITY_TARGETS[key] : null,
    }));
  return { base, rows };
}

/**
 * Sums a month's outflow (minor units) by bucket. `savingsTransfers` is the net
 * amount moved into savings accounts: positive adds to savings, negative is
 * reported as `withdrawn` rather than shrinking what the categories record.
 */
export function splitByPriority(
  rows: { priority: CategoryPriority | null; total: number }[],
  savingsTransfers = 0
): PrioritySplit {
  const split: PrioritySplit = { need: 0, want: 0, savings: 0, unsorted: 0, withdrawn: 0, total: 0 };
  for (const row of rows) split[row.priority ?? 'unsorted'] += row.total;
  split.savings += Math.max(0, savingsTransfers);
  split.withdrawn = Math.max(0, -savingsTransfers);
  split.total = split.need + split.want + split.savings + split.unsorted;
  return split;
}
