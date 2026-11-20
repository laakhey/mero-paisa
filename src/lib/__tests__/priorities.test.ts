import {
  groupByPriority,
  parsePriority,
  priorityForKind,
  priorityShares,
  splitByPriority,
  type PrioritySplit,
} from '../priorities';

describe('parsePriority', () => {
  it('accepts need, want and savings and reads anything else as not sorted', () => {
    expect(parsePriority('need')).toBe('need');
    expect(parsePriority('want')).toBe('want');
    expect(parsePriority('savings')).toBe('savings');
    expect(parsePriority('Need')).toBeNull();
    expect(parsePriority(undefined)).toBeNull();
    expect(parsePriority(1)).toBeNull();
  });
});

describe('priorityForKind', () => {
  it('only lets expense categories carry a priority', () => {
    expect(priorityForKind('expense', 'savings')).toBe('savings');
    expect(priorityForKind('income', 'need')).toBeNull();
  });
});

describe('groupByPriority', () => {
  it('splits categories into the three buckets and not sorted, keeping their order', () => {
    const items = [
      { id: 1, priority: 'want' as const },
      { id: 2, priority: null },
      { id: 3, priority: 'need' as const },
      { id: 4, priority: 'want' as const },
      { id: 5, priority: 'savings' as const },
    ];
    const groups = groupByPriority(items);
    expect(groups.need.map((c) => c.id)).toEqual([3]);
    expect(groups.want.map((c) => c.id)).toEqual([1, 4]);
    expect(groups.savings.map((c) => c.id)).toEqual([5]);
    expect(groups.unsorted.map((c) => c.id)).toEqual([2]);
  });
});

describe('splitByPriority', () => {
  it('sums spending per bucket and keeps the parts adding up to the total', () => {
    const split = splitByPriority([
      { priority: 'need', total: 45_000 },
      { priority: 'want', total: 12_550 },
      { priority: 'savings', total: 8_000 },
      { priority: null, total: 3_001 },
      { priority: 'need', total: 5_000 },
    ]);
    expect(split).toEqual({ need: 50_000, want: 12_550, savings: 8_000, unsorted: 3_001, withdrawn: 0, total: 73_551 });
    expect(split.need + split.want + split.savings + split.unsorted).toBe(split.total);
  });

  it('adds money moved into savings accounts to savings', () => {
    const split = splitByPriority([{ priority: 'savings', total: 1_000 }], 20_000);
    expect(split.savings).toBe(21_000);
    expect(split.total).toBe(21_000);
    expect(split.withdrawn).toBe(0);
  });

  it('reports money taken out of savings as withdrawn without shrinking recorded savings', () => {
    const split = splitByPriority([{ priority: 'savings', total: 1_000 }], -5_000);
    expect(split.savings).toBe(1_000);
    expect(split.withdrawn).toBe(5_000);
    expect(split.total).toBe(1_000);
  });

  it('is all zeros for a month without spending', () => {
    expect(splitByPriority([])).toEqual({ need: 0, want: 0, savings: 0, unsorted: 0, withdrawn: 0, total: 0 });
  });
});

describe('priorityShares', () => {
  const split: PrioritySplit = { need: 60_000, want: 25_000, savings: 10_000, unsorted: 0, withdrawn: 0, total: 95_000 };

  it('measures each bucket against income with its 50/30/20 target, skipping empty ones', () => {
    expect(priorityShares(split, 100_000)).toEqual({
      base: 'income',
      rows: [
        { key: 'need', value: 60_000, percent: 60, target: 50 },
        { key: 'want', value: 25_000, percent: 25, target: 30 },
        { key: 'savings', value: 10_000, percent: 10, target: 20 },
      ],
    });
  });

  it('falls back to shares of spending, without targets, in a month with no income', () => {
    const result = priorityShares({ ...split, unsorted: 5_000, total: 100_000 }, 0);
    expect(result.base).toBe('spending');
    expect(result.rows.map((r) => [r.key, r.percent, r.target])).toEqual([
      ['need', 60, null],
      ['want', 25, null],
      ['savings', 10, null],
      ['unsorted', 5, null],
    ]);
  });
});
