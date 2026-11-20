/**
 * Split-bill maths, kept pure so every rule is unit tested. All amounts are
 * integer minor units; nothing here may lose or invent a paisa.
 */

export type SplitMethod = 'equal' | 'exact' | 'shares';

export type ShareInput = {
  memberId: number;
  /** `exact`: the member's amount in minor units. `shares`: their weight (1, 2, 1.5...). Ignored for `equal`. */
  value?: number;
};

export type Share = { memberId: number; amount: number };

/**
 * Divides `total` among the given members.
 *
 * - `equal`: everyone the same.
 * - `shares`: in proportion to each member's weight.
 * - `exact`: the amounts given, which must add up to `total`.
 *
 * Leftover paisa from rounding go one each to the members with the largest
 * remainders (ties: earlier members first), so shares always sum to `total`.
 * Returns an error message instead when the input cannot be split.
 */
export function computeShares(total: number, method: SplitMethod, inputs: ShareInput[]): Share[] | string {
  if (!Number.isSafeInteger(total) || total <= 0) return 'Enter an amount greater than zero.';
  if (inputs.length === 0) return 'Choose at least one person to split with.';

  if (method === 'exact') {
    const amounts = inputs.map((i) => i.value ?? 0);
    if (amounts.some((a) => !Number.isSafeInteger(a) || a < 0)) return 'Enter a valid amount for each person.';
    const sum = amounts.reduce((s, a) => s + a, 0);
    if (sum !== total) return sum < total ? 'The amounts add up to less than the total.' : 'The amounts add up to more than the total.';
    return inputs.map((i, index) => ({ memberId: i.memberId, amount: amounts[index] })).filter((s) => s.amount > 0);
  }

  const weights = inputs.map((i) => (method === 'equal' ? 1 : (i.value ?? 0)));
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return 'Enter a valid number of shares for each person.';
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return 'Give at least one person a share.';

  const exact = weights.map((w) => (total * w) / totalWeight);
  const amounts = exact.map(Math.floor);
  let leftover = total - amounts.reduce((s, a) => s + a, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter((entry) => weights[entry.index] > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; leftover > 0; i = (i + 1) % byRemainder.length, leftover--) {
    amounts[byRemainder[i].index] += 1;
  }
  return inputs.map((i, index) => ({ memberId: i.memberId, amount: amounts[index] })).filter((s) => s.amount > 0);
}

export type LedgerEntry = {
  /** Who paid (for a settlement: who handed the money over). */
  paidBy: number;
  amount: number;
  /** Who it was for (for a settlement: the single person who received it). */
  shares: Share[];
};

/**
 * Net position per member: positive means the group owes them, negative means
 * they owe the group. Paying adds to your balance; having a share subtracts.
 * A settlement is the same shape (payer pays, receiver "consumes"), so it
 * needs no special case. Balances always sum to zero.
 */
export function computeBalances(memberIds: number[], entries: LedgerEntry[]): Map<number, number> {
  const balances = new Map(memberIds.map((id) => [id, 0]));
  for (const entry of entries) {
    balances.set(entry.paidBy, (balances.get(entry.paidBy) ?? 0) + entry.amount);
    for (const share of entry.shares) {
      balances.set(share.memberId, (balances.get(share.memberId) ?? 0) - share.amount);
    }
  }
  return balances;
}

export type Transfer = { from: number; to: number; amount: number };

/**
 * The payments that settle everyone up, using as few as practical: repeatedly
 * have the person who owes the most pay the person who is owed the most. This
 * "simplifies debts": who originally paid for what no longer matters, only the
 * net positions do, so a group of n people needs at most n - 1 payments.
 */
export function settleUp(balances: Map<number, number>): Transfer[] {
  const debtors = [...balances].filter(([, b]) => b < 0).map(([id, b]) => ({ id, amount: -b }));
  const creditors = [...balances].filter(([, b]) => b > 0).map(([id, b]) => ({ id, amount: b }));
  const byAmount = (a: { id: number; amount: number }, b: { id: number; amount: number }) =>
    b.amount - a.amount || a.id - b.id;

  const transfers: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }
  return transfers;
}
