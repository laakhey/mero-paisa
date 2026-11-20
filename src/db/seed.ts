import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/ui/icon';
import { addDays, today } from '@/lib/dates';

import type { AccountType, CategoryKind } from './types';

type SeedCategory = { name: string; kind: CategoryKind; icon: IconName; color: string };

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: 'Groceries', kind: 'expense', icon: 'cart', color: '#16A34A' },
  { name: 'Dining', kind: 'expense', icon: 'restaurant', color: '#EA580C' },
  { name: 'Transport', kind: 'expense', icon: 'car', color: '#2563EB' },
  { name: 'Housing', kind: 'expense', icon: 'house', color: '#7C3AED' },
  { name: 'Utilities', kind: 'expense', icon: 'bolt', color: '#CA8A04' },
  { name: 'Shopping', kind: 'expense', icon: 'bag', color: '#DB2777' },
  { name: 'Health', kind: 'expense', icon: 'health', color: '#DC2626' },
  { name: 'Entertainment', kind: 'expense', icon: 'movie', color: '#0891B2' },
  { name: 'Subscriptions', kind: 'expense', icon: 'subscriptions', color: '#4F46E5' },
  { name: 'Education', kind: 'expense', icon: 'school', color: '#0D9488' },
  { name: 'Travel', kind: 'expense', icon: 'flight', color: '#0284C7' },
  { name: 'Other', kind: 'expense', icon: 'tag', color: '#64748B' },
  { name: 'Salary', kind: 'income', icon: 'work', color: '#16A34A' },
  { name: 'Freelance', kind: 'income', icon: 'payments', color: '#0D9488' },
  { name: 'Investments', kind: 'income', icon: 'trending', color: '#2563EB' },
  { name: 'Gifts', kind: 'income', icon: 'gift', color: '#DB2777' },
  { name: 'Other income', kind: 'income', icon: 'tag', color: '#64748B' },
];

const DEFAULT_ACCOUNTS: { name: string; type: AccountType; icon: IconName; color: string }[] = [
  { name: 'Cash', type: 'cash', icon: 'cash', color: '#16A34A' },
  { name: 'Bank account', type: 'bank', icon: 'bank', color: '#2563EB' },
];

export async function seedDefaults(db: SQLiteDatabase): Promise<void> {
  for (const [index, c] of DEFAULT_CATEGORIES.entries()) {
    await db.runAsync(
      'INSERT INTO categories (name, kind, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      c.name,
      c.kind,
      c.icon,
      c.color,
      index
    );
  }
  for (const a of DEFAULT_ACCOUNTS) {
    await db.runAsync(
      'INSERT INTO accounts (name, type, icon, color) VALUES (?, ?, ?, ?)',
      a.name,
      a.type,
      a.icon,
      a.color
    );
  }
}

/**
 * Fills the database with ~3 months of realistic activity so the charts and
 * budgets can be explored before entering real data. Amounts are expressed in
 * major units and scaled by the caller's currency precision.
 */
export async function seedSampleData(db: SQLiteDatabase, minorPerMajor: number): Promise<void> {
  const categories = await db.getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM categories'
  );
  const accounts = await db.getAllAsync<{ id: number; type: string }>(
    'SELECT id, type FROM accounts WHERE archived = 0 ORDER BY id'
  );
  if (accounts.length === 0) return;
  const cat = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
  const cash = accounts.find((a) => a.type === 'cash')?.id ?? accounts[0].id;
  const bank = accounts.find((a) => a.type === 'bank')?.id ?? accounts[0].id;

  // Deterministic pseudo-random so the sample set looks the same every time.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

  const daily: { category: string; note: string; min: number; max: number; chance: number }[] = [
    { category: 'Groceries', note: 'Supermarket', min: 18, max: 95, chance: 0.4 },
    { category: 'Dining', note: 'Lunch', min: 9, max: 38, chance: 0.45 },
    { category: 'Transport', note: 'Fuel & fares', min: 4, max: 45, chance: 0.35 },
    { category: 'Shopping', note: 'Online order', min: 15, max: 140, chance: 0.1 },
    { category: 'Entertainment', note: 'Movies', min: 12, max: 60, chance: 0.08 },
    { category: 'Health', note: 'Pharmacy', min: 8, max: 70, chance: 0.05 },
  ];

  const insert = (
    type: 'expense' | 'income' | 'transfer',
    major: number,
    accountId: number,
    categoryId: number | null,
    note: string,
    day: string,
    toAccountId: number | null = null
  ) =>
    db.runAsync(
      `INSERT INTO transactions (type, amount, account_id, to_account_id, category_id, note, occurred_on)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      type,
      Math.max(1, Math.round(major * minorPerMajor)),
      accountId,
      toAccountId,
      categoryId,
      note,
      day
    );

  const end = today();
  await db.withTransactionAsync(async () => {
    for (let offset = 89; offset >= 0; offset--) {
      const day = addDays(end, -offset);
      const dayOfMonth = Number(day.slice(8));

      if (dayOfMonth === 1) {
        await insert('income', 4200, bank, cat('Salary'), 'Monthly salary', day);
        await insert('expense', 1350, bank, cat('Housing'), 'Rent', day);
        if (bank !== cash) await insert('transfer', 500, bank, null, 'ATM withdrawal', day, cash);
      }
      if (dayOfMonth === 5) await insert('expense', between(70, 130), bank, cat('Utilities'), 'Electricity & internet', day);
      if (dayOfMonth === 12) await insert('expense', 15.99, bank, cat('Subscriptions'), 'Streaming', day);
      if (dayOfMonth === 18 && rand() > 0.4) await insert('income', between(250, 700), bank, cat('Freelance'), 'Side project', day);

      for (const item of daily) {
        if (rand() < item.chance) {
          const account = rand() < 0.12 ? cash : bank;
          await insert('expense', between(item.min * 100, item.max * 100) / 100, account, cat(item.category), item.note, day);
        }
      }
    }

    const budgets: [string, number][] = [
      ['Groceries', 600],
      ['Dining', 300],
      ['Transport', 250],
      ['Shopping', 200],
      ['Entertainment', 120],
    ];
    for (const [name, major] of budgets) {
      const categoryId = cat(name);
      if (categoryId === null) continue;
      await db.runAsync(
        `INSERT INTO budgets (category_id, amount) VALUES (?, ?)
         ON CONFLICT(category_id) DO NOTHING`,
        categoryId,
        Math.round(major * minorPerMajor)
      );
    }
  });
}
