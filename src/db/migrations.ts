import type { SQLiteDatabase } from 'expo-sqlite';

import { seedDefaults } from './seed';

// The on-device file name. Never rename it after release: existing installs
// would open an empty database and appear to lose all their data.
export const DATABASE_NAME = 'mero-paisa.db';

/**
 * Append-only list. Never edit a shipped migration — add a new one — because
 * `PRAGMA user_version` on users' devices records how many have already run.
 */
/** UTC, millisecond precision, lexicographically sortable — the format sync compares. */
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** A random RFC 4122 v4 UUID, built in SQL so triggers can assign one without app code. */
export const UUID_SQL = `lower(printf('%s-%s-4%s-%s%s-%s',
  hex(randomblob(4)), hex(randomblob(2)), substr(hex(randomblob(2)), 2),
  substr('89ab', abs(random()) % 4 + 1, 1), substr(hex(randomblob(2)), 2), hex(randomblob(6))))`;

const SYNC_OFF = "(SELECT value FROM sync_meta WHERE key = 'applying') = '0'";

/**
 * Synced tables and the columns whose change makes a row need pushing.
 * Bookkeeping columns (uid, modified_at, dirty, synced) are deliberately not
 * listed, so the triggers' own writes never re-fire them.
 */
export const SYNC_TABLES = {
  accounts: ['name', 'type', 'icon', 'color', 'opening_balance', 'archived'],
  categories: ['name', 'kind', 'icon', 'color', 'archived', 'sort_order', 'priority'],
  labels: ['name', 'color'],
  transactions: ['type', 'amount', 'account_id', 'to_account_id', 'category_id', 'note', 'occurred_on'],
  budgets: ['category_id', 'amount'],
  split_groups: ['name', 'color', 'archived'],
  split_members: ['group_id', 'name', 'is_me'],
  split_expenses: [
    'group_id', 'kind', 'description', 'amount', 'paid_by', 'occurred_on', 'split_method', 'transaction_id',
  ],
} as const;

export type SyncTable = keyof typeof SYNC_TABLES;

/**
 * Change tracking lives in triggers rather than in every query: any write,
 * from any code path, stamps the row and marks it for upload, and a delete of
 * a row the server knows about leaves a tombstone. While sync applies remote
 * changes it sets `applying`, which silences the triggers so pulled rows are
 * not echoed straight back.
 */
/** The trigger that marks a row for upload when one of `columns` changes. */
function updateTriggerSql(table: SyncTable, columns: readonly string[]): string {
  return `
  CREATE TRIGGER ${table}_sync_update AFTER UPDATE OF ${columns.join(', ')} ON ${table}
  WHEN ${SYNC_OFF}
  BEGIN
    UPDATE ${table} SET modified_at = ${NOW}, dirty = 1 WHERE id = NEW.id;
  END;`;
}

/**
 * Adds the sync bookkeeping columns and change-tracking triggers to the given
 * tables. `frozenColumns` pins a table's tracked columns to what existed when
 * the calling migration shipped, so later additions to SYNC_TABLES cannot
 * change its SQL (they get their own migration that rebuilds the trigger).
 */
function trackingSql(
  tables: readonly SyncTable[],
  frozenColumns: Partial<Record<SyncTable, readonly string[]>> = {}
): string {
  return tables
    .map((table) => [table, frozenColumns[table] ?? SYNC_TABLES[table]] as const)
    .map(
      ([table, columns]) => `
  ALTER TABLE ${table} ADD COLUMN uid TEXT;
  ALTER TABLE ${table} ADD COLUMN modified_at TEXT;
  ALTER TABLE ${table} ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE ${table} ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
  UPDATE ${table} SET uid = ${UUID_SQL}, modified_at = ${NOW};
  CREATE UNIQUE INDEX idx_${table}_uid ON ${table} (uid);
  CREATE INDEX idx_${table}_dirty ON ${table} (dirty) WHERE dirty = 1;

  CREATE TRIGGER ${table}_sync_insert AFTER INSERT ON ${table}
  BEGIN
    UPDATE ${table}
    SET uid = COALESCE(NEW.uid, ${UUID_SQL}), modified_at = COALESCE(NEW.modified_at, ${NOW})
    WHERE id = NEW.id;
  END;

  ${updateTriggerSql(table, columns)}

  CREATE TRIGGER ${table}_sync_delete AFTER DELETE ON ${table}
  WHEN ${SYNC_OFF} AND OLD.synced = 1
  BEGIN
    INSERT OR REPLACE INTO sync_tombstones (tbl, uid, deleted_at) VALUES ('${table}', OLD.uid, ${NOW});
  END;`
    )
    .join('\n');
}



/** The category columns tracked when sync shipped, before `priority` existed. */
const CATEGORY_COLUMNS_V1 = ['name', 'kind', 'icon', 'color', 'archived', 'sort_order'] as const;

/**
 * The first five synced tables. A frozen list: this migration has shipped, so
 * it must keep producing exactly the same SQL even as SYNC_TABLES grows.
 */
function syncMigration(): string {
  const perTable = trackingSql(['accounts', 'categories', 'labels', 'transactions', 'budgets'], {
    categories: CATEGORY_COLUMNS_V1,
  });

  return `
  CREATE TABLE sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  INSERT INTO sync_meta (key, value) VALUES ('applying', '0');

  CREATE TABLE sync_tombstones (
    tbl TEXT NOT NULL,
    uid TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    PRIMARY KEY (tbl, uid)
  ) WITHOUT ROWID;
  ${perTable}

  -- A transaction's labels travel with the transaction, so changing them marks it.
  CREATE TRIGGER transaction_labels_sync_insert AFTER INSERT ON transaction_labels
  WHEN ${SYNC_OFF}
  BEGIN
    UPDATE transactions SET modified_at = ${NOW}, dirty = 1 WHERE id = NEW.transaction_id;
  END;

  CREATE TRIGGER transaction_labels_sync_delete AFTER DELETE ON transaction_labels
  WHEN ${SYNC_OFF}
  BEGIN
    UPDATE transactions SET modified_at = ${NOW}, dirty = 1 WHERE id = OLD.transaction_id;
  END;
  `;
}


/**
 * Split bills: groups of named people (they need no account), the bills and
 * settlements between them, and each person's share of every bill.
 * `transaction_id` deliberately has no foreign key: it is a soft link to the
 * personal transaction that records "my share", which the user may delete.
 */
function splitMigration(): string {
  return `
  CREATE TABLE split_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE split_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES split_groups(id),
    name TEXT NOT NULL,
    is_me INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_split_members_group ON split_members (group_id);

  CREATE TABLE split_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES split_groups(id),
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'settlement')),
    description TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL CHECK (amount > 0),
    paid_by INTEGER NOT NULL REFERENCES split_members(id),
    occurred_on TEXT NOT NULL,
    split_method TEXT NOT NULL DEFAULT 'equal',
    transaction_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_split_expenses_group ON split_expenses (group_id, occurred_on DESC, id DESC);

  CREATE TABLE split_shares (
    expense_id INTEGER NOT NULL REFERENCES split_expenses(id),
    member_id INTEGER NOT NULL REFERENCES split_members(id),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    weight REAL,
    PRIMARY KEY (expense_id, member_id)
  ) WITHOUT ROWID;
  ${trackingSql(['split_groups', 'split_members', 'split_expenses'])}

  -- Shares travel with their bill, so changing them marks the bill.
  CREATE TRIGGER split_shares_sync_insert AFTER INSERT ON split_shares
  WHEN ${SYNC_OFF}
  BEGIN
    UPDATE split_expenses SET modified_at = ${NOW}, dirty = 1 WHERE id = NEW.expense_id;
  END;

  CREATE TRIGGER split_shares_sync_delete AFTER DELETE ON split_shares
  WHEN ${SYNC_OFF}
  BEGIN
    UPDATE split_expenses SET modified_at = ${NOW}, dirty = 1 WHERE id = OLD.expense_id;
  END;
  `;
}

/**
 * Need / want / savings & debt: an optional priority on expense categories
 * (null = not sorted yet). The built-in categories get a sensible default, set *before* the sync
 * trigger is rebuilt so it does not mark them for upload — otherwise every
 * device that upgrades later would overwrite choices already synced from
 * another device.
 */
function categoryPriorityMigration(): string {
  return `
  ALTER TABLE categories ADD COLUMN priority TEXT CHECK (priority IN ('need', 'want', 'savings'));
  UPDATE categories SET priority = 'need'
    WHERE kind = 'expense' AND name IN ('Groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Education');
  UPDATE categories SET priority = 'want'
    WHERE kind = 'expense' AND name IN ('Dining', 'Shopping', 'Entertainment', 'Subscriptions', 'Travel');

  DROP TRIGGER categories_sync_update;
  ${updateTriggerSql('categories', [...CATEGORY_COLUMNS_V1, 'priority'])}
  `;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash','bank','card','wallet','savings')),
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    opening_balance INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    to_account_id INTEGER REFERENCES accounts(id),
    category_id INTEGER REFERENCES categories(id),
    note TEXT NOT NULL DEFAULT '',
    occurred_on TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((type = 'transfer') = (to_account_id IS NOT NULL)),
    CHECK (to_account_id IS NULL OR to_account_id <> account_id)
  );
  CREATE INDEX idx_transactions_day ON transactions (occurred_on DESC, id DESC);
  CREATE INDEX idx_transactions_category ON transactions (category_id, occurred_on);
  CREATE INDEX idx_transactions_account ON transactions (account_id);
  CREATE INDEX idx_transactions_to_account ON transactions (to_account_id);

  CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id),
    amount INTEGER NOT NULL CHECK (amount > 0)
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE transaction_labels (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, label_id)
  ) WITHOUT ROWID;
  CREATE INDEX idx_transaction_labels_label ON transaction_labels (label_id);
  `,
  syncMigration(),
  splitMigration(),
  categoryPriorityMigration(),
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      if (next === 1) await seedDefaults(db);
      // PRAGMA does not accept bound parameters; `next` is a trusted integer.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
