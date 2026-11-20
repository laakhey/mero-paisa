import { BACKUP_FORMAT, buildBackup, parseBackup, type BackupData } from '../backup';

const data = (): BackupData => ({
  accounts: [
    { id: 1, name: 'Cash', type: 'cash', icon: 'cash', color: '#16A34A', opening_balance: -5000, archived: 0, created_at: '2026-01-01 00:00:00' },
    { id: 2, name: 'Bank', type: 'bank', icon: 'bank', color: '#2563EB', opening_balance: 100000, archived: 1, created_at: null },
  ],
  categories: [
    { id: 1, name: 'Dining', kind: 'expense', icon: 'restaurant', color: '#EA580C', archived: 0, sort_order: 0, priority: 'want' },
    { id: 2, name: 'Salary', kind: 'income', icon: 'work', color: '#16A34A', archived: 0, sort_order: 1, priority: null },
  ],
  labels: [{ id: 1, name: 'vacation', color: '#0891B2', created_at: null }],
  transactions: [
    { id: 1, type: 'expense', amount: 1250, account_id: 1, to_account_id: null, category_id: 1, note: 'Lunch', occurred_on: '2026-11-14', created_at: null, updated_at: null },
    { id: 2, type: 'transfer', amount: 5000, account_id: 2, to_account_id: 1, category_id: null, note: '', occurred_on: '2026-11-01', created_at: null, updated_at: null },
  ],
  transactionLabels: [{ transaction_id: 1, label_id: 1 }],
  budgets: [{ id: 1, category_id: 1, amount: 30000 }],
  splitGroups: [{ id: 1, name: 'Pokhara trip', color: '#0891B2', archived: 0, created_at: null }],
  splitMembers: [
    { id: 1, group_id: 1, name: 'You', is_me: 1 },
    { id: 2, group_id: 1, name: 'Sita', is_me: 0 },
  ],
  splitExpenses: [
    { id: 1, group_id: 1, kind: 'expense', description: 'Dinner', amount: 2500, paid_by: 1, occurred_on: '2026-11-14', split_method: 'equal', transaction_id: 1, created_at: null },
  ],
  splitShares: [
    { expense_id: 1, member_id: 1, amount: 1250, weight: null },
    { expense_id: 1, member_id: 2, amount: 1250, weight: null },
  ],
});

const file = (mutate?: (backup: any) => void) => {
  const backup: any = JSON.parse(JSON.stringify(buildBackup(data(), 'USD', 'dark', new Date('2026-11-14T10:00:00Z'))));
  mutate?.(backup);
  return JSON.stringify(backup);
};
const errorOf = (text: string) => {
  const result = parseBackup(text);
  return 'error' in result ? result.error : null;
};

describe('parseBackup', () => {
  it('round-trips a backup exactly', () => {
    const result = parseBackup(file());
    expect(result).toEqual({
      backup: { app: 'mero-paisa', format: BACKUP_FORMAT, createdAt: '2026-11-14T10:00:00.000Z', currency: 'USD', theme: 'dark', data: data() },
    });
  });

  it('still restores backups made when the app was called Expense Manager', () => {
    const result = parseBackup(file((b) => (b.app = 'expense-manager')));
    expect('backup' in result && result.backup.data).toEqual(data());
    expect('backup' in result && result.backup.app).toBe('mero-paisa');
  });

  it('treats tables missing from an older backup as empty', () => {
    const result = parseBackup(
      file((b) => {
        delete b.data.labels;
        delete b.data.transactionLabels;
        delete b.data.splitGroups;
        delete b.data.splitMembers;
        delete b.data.splitExpenses;
        delete b.data.splitShares;
        delete b.theme;
      })
    );
    expect('backup' in result && result.backup.data.labels).toEqual([]);
    expect('backup' in result && result.backup.theme).toBe('system');
  });

  it('keeps a savings & debt category', () => {
    const result = parseBackup(file((b) => (b.data.categories[0].priority = 'savings')));
    expect('backup' in result && result.backup.data.categories[0].priority).toBe('savings');
  });

  it('reads categories from backups made before need/want existed as not sorted', () => {
    const result = parseBackup(file((b) => b.data.categories.forEach((c: any) => delete c.priority)));
    expect('backup' in result && result.backup.data.categories.map((c) => c.priority)).toEqual([null, null]);
  });

  it('never gives an income category a priority and ignores unknown values', () => {
    const result = parseBackup(
      file((b) => {
        b.data.categories[0].priority = 'luxury';
        b.data.categories[1].priority = 'need';
      })
    );
    expect('backup' in result && result.backup.data.categories.map((c) => c.priority)).toEqual([null, null]);
  });

  it('drops unknown fields', () => {
    const result = parseBackup(file((b) => (b.data.accounts[0].injected = 'x')));
    expect('backup' in result && result.backup.data.accounts[0]).not.toHaveProperty('injected');
  });

  it('rejects files that are not a backup', () => {
    expect(errorOf('Date,Type,Amount')).toMatch(/could not be read/);
    expect(errorOf('{"app":"other","data":{}}')).toMatch(/not a Mero Paisa backup/);
    expect(errorOf(file((b) => (b.format = BACKUP_FORMAT + 1)))).toMatch(/newer version/);
    expect(errorOf(file((b) => (b.currency = 'dollars')))).toMatch(/currency/);
  });

  it.each([
    ['a dangling account', (b: any) => (b.data.transactions[0].account_id = 99)],
    ['a dangling category', (b: any) => (b.data.transactions[0].category_id = 99)],
    ['a non-positive amount', (b: any) => (b.data.transactions[0].amount = 0)],
    ['a fractional amount', (b: any) => (b.data.transactions[0].amount = 12.5)],
    ['a transfer without a destination', (b: any) => (b.data.transactions[1].to_account_id = null)],
    ['a transfer to the same account', (b: any) => (b.data.transactions[1].to_account_id = 2)],
    ['an expense with a destination', (b: any) => (b.data.transactions[0].to_account_id = 2)],
    ['a bad date', (b: any) => (b.data.transactions[0].occurred_on = '14/11/2026')],
    ['a repeated id', (b: any) => (b.data.accounts[1].id = 1)],
    ['an unknown account type', (b: any) => (b.data.accounts[0].type = 'crypto')],
    ['a label link to a missing label', (b: any) => (b.data.transactionLabels[0].label_id = 9)],
    ['a budget on an income category', (b: any) => (b.data.budgets[0].category_id = 2)],
    ['no accounts', (b: any) => ((b.data.accounts = []), (b.data.transactions = []), (b.data.transactionLabels = []))],
    ['a table that is not a list', (b: any) => (b.data.transactions = 'all of them')],
    ['split shares that do not add up', (b: any) => (b.data.splitShares[0].amount = 1)],
    ['a split bill paid by someone outside the group', (b: any) => (b.data.splitExpenses[0].paid_by = 99)],
    ['a split member without a group', (b: any) => (b.data.splitMembers[1].group_id = 7)],
  ])('rejects %s', (_name, mutate) => {
    expect(errorOf(file(mutate))).toMatch(/damaged/);
  });
});
