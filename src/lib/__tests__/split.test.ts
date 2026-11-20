import { computeBalances, computeShares, settleUp, type Share } from '../split';

const sum = (shares: Share[]) => shares.reduce((s, x) => s + x.amount, 0);
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ memberId: i + 1 }));

describe('computeShares', () => {
  it('splits equally', () => {
    expect(computeShares(3000, 'equal', ids(3))).toEqual([
      { memberId: 1, amount: 1000 },
      { memberId: 2, amount: 1000 },
      { memberId: 3, amount: 1000 },
    ]);
  });

  it('never loses or invents a paisa when it does not divide evenly', () => {
    const shares = computeShares(1000, 'equal', ids(3)) as Share[];
    expect(shares.map((s) => s.amount)).toEqual([334, 333, 333]);
    for (const [total, n] of [[1, 3], [100, 7], [99999, 6], [5, 4]] as const) {
      const result = computeShares(total, 'equal', ids(n)) as Share[];
      expect(sum(result)).toBe(total);
      const amounts = result.map((s) => s.amount);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
    }
  });

  it('splits by shares in proportion', () => {
    const shares = computeShares(9000, 'shares', [
      { memberId: 1, value: 2 },
      { memberId: 2, value: 1 },
    ]);
    expect(shares).toEqual([
      { memberId: 1, amount: 6000 },
      { memberId: 2, amount: 3000 },
    ]);
    const uneven = computeShares(1000, 'shares', [
      { memberId: 1, value: 1.5 },
      { memberId: 2, value: 1 },
      { memberId: 3, value: 0 },
    ]) as Share[];
    expect(sum(uneven)).toBe(1000);
    expect(uneven.map((s) => s.memberId)).toEqual([1, 2]);
  });

  it('accepts exact amounts only when they add up', () => {
    const inputs = [
      { memberId: 1, value: 700 },
      { memberId: 2, value: 300 },
    ];
    expect(computeShares(1000, 'exact', inputs)).toEqual([
      { memberId: 1, amount: 700 },
      { memberId: 2, amount: 300 },
    ]);
    expect(computeShares(1200, 'exact', inputs)).toMatch(/less than/);
    expect(computeShares(900, 'exact', inputs)).toMatch(/more than/);
  });

  it('rejects input that cannot be split', () => {
    expect(typeof computeShares(0, 'equal', ids(2))).toBe('string');
    expect(typeof computeShares(100, 'equal', [])).toBe('string');
    expect(typeof computeShares(100, 'shares', [{ memberId: 1, value: 0 }])).toBe('string');
    expect(typeof computeShares(100, 'exact', [{ memberId: 1, value: -100 }])).toBe('string');
  });
});

describe('computeBalances', () => {
  it('credits the payer and debits each share', () => {
    // 1 pays 3000 for three people.
    const balances = computeBalances([1, 2, 3], [
      { paidBy: 1, amount: 3000, shares: computeShares(3000, 'equal', ids(3)) as Share[] },
    ]);
    expect([...balances]).toEqual([[1, 2000], [2, -1000], [3, -1000]]);
  });

  it('treats a settlement as a payment to one person', () => {
    const balances = computeBalances([1, 2, 3], [
      { paidBy: 1, amount: 3000, shares: computeShares(3000, 'equal', ids(3)) as Share[] },
      { paidBy: 2, amount: 1000, shares: [{ memberId: 1, amount: 1000 }] },
    ]);
    expect([...balances]).toEqual([[1, 1000], [2, 0], [3, -1000]]);
  });

  it('always sums to zero', () => {
    const balances = computeBalances([1, 2, 3, 4], [
      { paidBy: 1, amount: 1001, shares: computeShares(1001, 'equal', ids(4)) as Share[] },
      { paidBy: 3, amount: 777, shares: computeShares(777, 'shares', [{ memberId: 1, value: 2 }, { memberId: 4, value: 3 }]) as Share[] },
    ]);
    expect([...balances.values()].reduce((s, b) => s + b, 0)).toBe(0);
  });
});

describe('settleUp', () => {
  it('needs nothing when everyone is even', () => {
    expect(settleUp(new Map([[1, 0], [2, 0]]))).toEqual([]);
  });

  it('pays the person who is owed', () => {
    expect(settleUp(new Map([[1, 2000], [2, -1000], [3, -1000]]))).toEqual([
      { from: 2, to: 1, amount: 1000 },
      { from: 3, to: 1, amount: 1000 },
    ]);
  });

  it('simplifies chains: A owes B and B owes C becomes A pays C', () => {
    // 2 paid 1000 for 1; 3 paid 1000 for 2. Net: 1 owes 1000, 3 is owed 1000, 2 is even.
    const balances = computeBalances([1, 2, 3], [
      { paidBy: 2, amount: 1000, shares: [{ memberId: 1, amount: 1000 }] },
      { paidBy: 3, amount: 1000, shares: [{ memberId: 2, amount: 1000 }] },
    ]);
    expect(settleUp(balances)).toEqual([{ from: 1, to: 3, amount: 1000 }]);
  });

  it('settles everyone exactly with at most n - 1 payments', () => {
    const balances = new Map([[1, 5000], [2, -1200], [3, -2300], [4, 500], [5, -2000]]);
    const transfers = settleUp(balances);
    expect(transfers.length).toBeLessThanOrEqual(4);
    const after = new Map(balances);
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amount);
      after.set(t.to, after.get(t.to)! - t.amount);
    }
    expect([...after.values()].every((b) => b === 0)).toBe(true);
  });
});
