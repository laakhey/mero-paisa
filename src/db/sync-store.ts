import type { SQLiteDatabase } from 'expo-sqlite';

import { priorityForKind } from '@/lib/priorities';
import { decide, remoteDeleteWins } from '@/sync/logic';

import { SYNC_TABLES, UUID_SQL, type SyncTable } from './migrations';

/**
 * The local half of sync: reading what needs uploading and applying what was
 * downloaded. Rows are matched across devices by `uid`; local integer ids are
 * never sent anywhere.
 */

/** Parents before children, so references resolve while applying. */
export const SYNC_ORDER: SyncTable[] = [
  'accounts', 'categories', 'labels', 'transactions', 'budgets',
  'split_groups', 'split_members', 'split_expenses',
];

/** Every data table, children before parents: the order in which a full wipe must delete. */
export const WIPE_ORDER = [
  'split_shares', 'split_expenses', 'split_members', 'split_groups',
  'transaction_labels', 'transactions', 'budgets', 'labels', 'categories', 'accounts',
] as const;

/** A row as stored on the server (snake_case, uids instead of local ids). */
export type RemoteRow = {
  uid: string;
  modified_at: string;
  deleted_at: string | null;
  [column: string]: unknown;
};

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/* --------------------------------- meta --------------------------------- */

export async function getSyncMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSyncMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

/**
 * Forgets everything about the previous server: every row becomes "never
 * uploaded" again.
 *
 * With `newIdentities`, every row also gets a fresh uid. That is required when
 * the data moves to a *different* account: the server keys rows by uid across
 * all users, so re-sending the old uids would collide with the previous
 * account's copies, which the new account may not overwrite.
 */
export async function resetSyncState(
  db: SQLiteDatabase,
  options: { newIdentities?: boolean } = {}
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of SYNC_ORDER) {
      await db.runAsync(
        options.newIdentities
          ? `UPDATE ${table} SET dirty = 1, synced = 0, uid = ${UUID_SQL}`
          : `UPDATE ${table} SET dirty = 1, synced = 0`
      );
    }
    await db.runAsync('DELETE FROM sync_tombstones');
    await db.runAsync("DELETE FROM sync_meta WHERE key <> 'applying'");
  });
}

/**
 * Gives every row that has never been uploaded to the linked account a fresh
 * uid. Safe because no server row of this account refers to those uids; used
 * to recover when they collide with rows owned by a different account.
 */
export async function rekeyUnsyncedRows(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const table of SYNC_ORDER) {
      await db.runAsync(`UPDATE ${table} SET uid = ${UUID_SQL} WHERE synced = 0`);
    }
  });
}

/** How much of the user's own data this device holds (defaults do not count). */
export async function countLocalData(db: SQLiteDatabase): Promise<{ transactions: number; total: number }> {
  const row = await db.getFirstAsync<{ t: number; b: number; l: number; a: number; g: number }>(
    `SELECT (SELECT COUNT(*) FROM transactions) AS t, (SELECT COUNT(*) FROM budgets) AS b,
            (SELECT COUNT(*) FROM labels) AS l, (SELECT COUNT(*) FROM accounts WHERE opening_balance <> 0) AS a,
            (SELECT COUNT(*) FROM split_groups) AS g`
  );
  const t = row?.t ?? 0;
  return { transactions: t, total: t + (row?.b ?? 0) + (row?.l ?? 0) + (row?.a ?? 0) + (row?.g ?? 0) };
}

/**
 * Removes all data from this device without telling the server (no
 * tombstones), and forgets all sync state, so the next round downloads the
 * account's data from scratch. Used for "Use cloud data".
 */
export async function wipeLocalData(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await setSyncMeta(db, 'applying', '1');
    try {
      for (const table of WIPE_ORDER) {
        await db.runAsync(`DELETE FROM ${table}`);
      }
    } finally {
      await setSyncMeta(db, 'applying', '0');
    }
    await db.runAsync('DELETE FROM sync_tombstones');
    await db.runAsync("DELETE FROM sync_meta WHERE key <> 'applying'");
  });
}

/* --------------------------------- push --------------------------------- */

const DIRTY_SQL: Record<SyncTable, string> = {
  accounts: 'SELECT uid, name, type, icon, color, opening_balance, archived, modified_at FROM accounts WHERE dirty = 1',
  categories:
    'SELECT uid, name, kind, icon, color, archived, sort_order, priority, modified_at FROM categories WHERE dirty = 1',
  labels: 'SELECT uid, name, color, modified_at FROM labels WHERE dirty = 1',
  transactions: `
    SELECT t.uid, t.type, t.amount, a.uid AS account_uid, ta.uid AS to_account_uid, c.uid AS category_uid,
           t.note, t.occurred_on, t.modified_at,
           (SELECT group_concat(l.uid) FROM transaction_labels tl JOIN labels l ON l.id = tl.label_id
            WHERE tl.transaction_id = t.id) AS label_uids
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts ta ON ta.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.dirty = 1`,
  budgets: `
    SELECT b.uid, c.uid AS category_uid, b.amount, b.modified_at
    FROM budgets b JOIN categories c ON c.id = b.category_id
    WHERE b.dirty = 1`,
  split_groups: 'SELECT uid, name, color, archived, modified_at FROM split_groups WHERE dirty = 1',
  split_members: `
    SELECT m.uid, g.uid AS group_uid, m.name, m.is_me, m.modified_at
    FROM split_members m JOIN split_groups g ON g.id = m.group_id
    WHERE m.dirty = 1`,
  // Shares are packed as "member_uid:amount:weight" and unpacked in readDirtyRows.
  split_expenses: `
    SELECT e.uid, g.uid AS group_uid, e.kind, e.description, e.amount, p.uid AS paid_by_uid,
           e.occurred_on, e.split_method, t.uid AS transaction_uid, e.modified_at,
           (SELECT group_concat(m.uid || ':' || s.amount || ':' || COALESCE(s.weight, ''))
            FROM split_shares s JOIN split_members m ON m.id = s.member_id
            WHERE s.expense_id = e.id) AS shares
    FROM split_expenses e
    JOIN split_groups g ON g.id = e.group_id
    JOIN split_members p ON p.id = e.paid_by
    LEFT JOIN transactions t ON t.id = e.transaction_id
    WHERE e.dirty = 1`,
};

/** Rows with unsent changes, already in the server's shape. */
export async function readDirtyRows(db: SQLiteDatabase, table: SyncTable): Promise<RemoteRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(DIRTY_SQL[table]);
  return rows.map((row) => {
    const remote: RemoteRow = { ...row, uid: String(row.uid), modified_at: String(row.modified_at), deleted_at: null };
    if ('archived' in row) remote.archived = row.archived === 1;
    if ('is_me' in row) remote.is_me = row.is_me === 1;
    if (table === 'split_expenses') {
      remote.shares = (typeof row.shares === 'string' && row.shares ? row.shares.split(',') : []).map((packed) => {
        const [member_uid, amount, weight] = packed.split(':');
        return { member_uid, amount: Number(amount), weight: weight === '' ? null : Number(weight) };
      });
    }
    if (table === 'transactions') {
      remote.label_uids = typeof row.label_uids === 'string' && row.label_uids ? row.label_uids.split(',') : [];
    }
    return remote;
  });
}

/**
 * Clears the dirty flag, but only for rows not edited again while the upload
 * was in flight (same `modified_at`); those stay dirty for the next round.
 */
export async function markPushed(db: SQLiteDatabase, table: SyncTable, rows: RemoteRow[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `UPDATE ${table} SET synced = 1, dirty = CASE WHEN modified_at = ? THEN 0 ELSE dirty END WHERE uid = ?`,
        row.modified_at,
        row.uid
      );
    }
  });
}

export type Tombstone = { tbl: SyncTable; uid: string; deleted_at: string };

export async function readTombstones(db: SQLiteDatabase): Promise<Tombstone[]> {
  return db.getAllAsync<Tombstone>('SELECT tbl, uid, deleted_at FROM sync_tombstones');
}

export async function clearTombstones(db: SQLiteDatabase, tombstones: Tombstone[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of tombstones) {
      await db.runAsync('DELETE FROM sync_tombstones WHERE tbl = ? AND uid = ?', t.tbl, t.uid);
    }
  });
}

/* --------------------------------- pull --------------------------------- */

type LocalRow = { id: number; dirty: number; synced: number; modified_at: string; uid: string };

const idOf = async (db: SQLiteDatabase, table: SyncTable, uid: unknown): Promise<number | null> => {
  if (typeof uid !== 'string' || !uid) return null;
  const row = await db.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE uid = ?`, uid);
  return row?.id ?? null;
};

/** Maps a server row to local column values, or null when a reference cannot be resolved yet. */
async function localValues(
  db: SQLiteDatabase,
  table: SyncTable,
  r: RemoteRow
): Promise<Record<string, string | number | null> | null> {
  switch (table) {
    case 'accounts':
      return {
        name: String(r.name),
        type: String(r.type),
        icon: String(r.icon),
        color: String(r.color),
        opening_balance: Number(r.opening_balance),
        archived: r.archived ? 1 : 0,
      };
    case 'categories':
      return {
        name: String(r.name),
        kind: String(r.kind),
        icon: String(r.icon),
        color: String(r.color),
        archived: r.archived ? 1 : 0,
        sort_order: Number(r.sort_order ?? 0),
        // Rows from versions without priority (or a value this version does not know) read as "not sorted".
        priority: priorityForKind(String(r.kind), r.priority),
      };
    case 'labels':
      return { name: String(r.name), color: String(r.color) };
    case 'transactions': {
      const accountId = await idOf(db, 'accounts', r.account_uid);
      const toAccountId = r.to_account_uid ? await idOf(db, 'accounts', r.to_account_uid) : null;
      // Without its account (or transfer destination) the row cannot satisfy the table's rules.
      if (accountId === null || (r.to_account_uid && toAccountId === null)) return null;
      return {
        type: String(r.type),
        amount: Number(r.amount),
        account_id: accountId,
        to_account_id: toAccountId,
        category_id: r.category_uid ? await idOf(db, 'categories', r.category_uid) : null,
        note: String(r.note ?? ''),
        occurred_on: String(r.occurred_on).slice(0, 10),
      };
    }
    case 'budgets': {
      const categoryId = await idOf(db, 'categories', r.category_uid);
      return categoryId === null ? null : { category_id: categoryId, amount: Number(r.amount) };
    }
    case 'split_groups':
      return { name: String(r.name), color: String(r.color), archived: r.archived ? 1 : 0 };
    case 'split_members': {
      const groupId = await idOf(db, 'split_groups', r.group_uid);
      return groupId === null ? null : { group_id: groupId, name: String(r.name), is_me: r.is_me ? 1 : 0 };
    }
    case 'split_expenses': {
      const groupId = await idOf(db, 'split_groups', r.group_uid);
      const paidBy = await idOf(db, 'split_members', r.paid_by_uid);
      if (groupId === null || paidBy === null) return null;
      return {
        group_id: groupId,
        kind: String(r.kind),
        description: String(r.description ?? ''),
        amount: Number(r.amount),
        paid_by: paidBy,
        occurred_on: String(r.occurred_on).slice(0, 10),
        split_method: String(r.split_method ?? 'equal'),
        // The linked personal transaction may not exist on this device (yet); the link is optional.
        transaction_id: r.transaction_uid ? await idOf(db, 'transactions', r.transaction_uid) : null,
      };
    }
  }
}

/**
 * A local row that is "the same thing" as an incoming one under a different
 * uid — typically the default categories every install seeds. Adopting the
 * server's uid merges them instead of duplicating every default on each device.
 */
async function findTwin(
  db: SQLiteDatabase,
  table: SyncTable,
  values: Record<string, string | number | null>
): Promise<{ row: LocalRow; mustAdopt: boolean } | null> {
  const columns = 'id, dirty, synced, modified_at, uid';
  let row: LocalRow | null = null;
  // Labels and budgets have a uniqueness rule, so a twin must be merged even if already synced.
  let mustAdopt = false;
  if (table === 'accounts') {
    row = await db.getFirstAsync<LocalRow>(
      `SELECT ${columns} FROM accounts WHERE lower(name) = lower(?) AND synced = 0 LIMIT 1`,
      values.name
    );
  } else if (table === 'categories') {
    row = await db.getFirstAsync<LocalRow>(
      `SELECT ${columns} FROM categories WHERE kind = ? AND lower(name) = lower(?) AND synced = 0 LIMIT 1`,
      values.kind,
      values.name
    );
  } else if (table === 'labels') {
    row = await db.getFirstAsync<LocalRow>(`SELECT ${columns} FROM labels WHERE name = ? COLLATE NOCASE`, values.name);
    mustAdopt = true;
  } else if (table === 'budgets') {
    row = await db.getFirstAsync<LocalRow>(`SELECT ${columns} FROM budgets WHERE category_id = ?`, values.category_id);
    mustAdopt = true;
  }
  return row ? { row, mustAdopt } : null;
}

async function replaceLabels(db: SQLiteDatabase, transactionId: number, labelUids: unknown): Promise<void> {
  await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', transactionId);
  for (const uid of Array.isArray(labelUids) ? labelUids : []) {
    const labelId = await idOf(db, 'labels', uid);
    // A label this device has not received (or that was deleted) is simply left off.
    if (labelId !== null) {
      await db.runAsync(
        'INSERT OR IGNORE INTO transaction_labels (transaction_id, label_id) VALUES (?, ?)',
        transactionId,
        labelId
      );
    }
  }
}

async function replaceShares(db: SQLiteDatabase, expenseId: number, shares: unknown): Promise<void> {
  await db.runAsync('DELETE FROM split_shares WHERE expense_id = ?', expenseId);
  for (const share of Array.isArray(shares) ? shares : []) {
    const memberId = await idOf(db, 'split_members', share?.member_uid);
    if (memberId === null) continue;
    await db.runAsync(
      'INSERT OR REPLACE INTO split_shares (expense_id, member_id, amount, weight) VALUES (?, ?, ?, ?)',
      expenseId,
      memberId,
      Number(share.amount),
      share.weight === null || share.weight === undefined ? null : Number(share.weight)
    );
  }
}

async function applyDelete(db: SQLiteDatabase, table: SyncTable, local: LocalRow): Promise<void> {
  if (table === 'accounts' || table === 'categories') {
    const used = await db.getFirstAsync<{ n: number }>(
      table === 'accounts'
        ? 'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?'
        : 'SELECT COUNT(*) AS n FROM transactions WHERE category_id = ? OR category_id = ?',
      local.id,
      local.id
    );
    if ((used?.n ?? 0) > 0) {
      // Still referenced by transactions made on this device: keep it, archived,
      // and re-upload it so the other devices get it back too.
      await db.runAsync(`UPDATE ${table} SET archived = 1, dirty = 1, modified_at = ${NOW} WHERE id = ?`, local.id);
      return;
    }
  }
  if (table === 'transactions') await db.runAsync('DELETE FROM transaction_labels WHERE transaction_id = ?', local.id);
  if (table === 'labels') await db.runAsync('DELETE FROM transaction_labels WHERE label_id = ?', local.id);
  if (table === 'categories') await db.runAsync('DELETE FROM budgets WHERE category_id = ?', local.id);
  if (table === 'transactions') await db.runAsync('UPDATE split_expenses SET transaction_id = NULL WHERE transaction_id = ?', local.id);
  if (table === 'split_expenses') await db.runAsync('DELETE FROM split_shares WHERE expense_id = ?', local.id);
  if (table === 'split_members') {
    // Normally its bills are deleted first; if any remain here they cannot stand without it.
    await db.runAsync('DELETE FROM split_shares WHERE member_id = ?', local.id);
    await db.runAsync(
      'DELETE FROM split_shares WHERE expense_id IN (SELECT id FROM split_expenses WHERE paid_by = ?)',
      local.id
    );
    await db.runAsync('DELETE FROM split_expenses WHERE paid_by = ?', local.id);
  }
  if (table === 'split_groups') {
    await db.runAsync(
      'DELETE FROM split_shares WHERE expense_id IN (SELECT id FROM split_expenses WHERE group_id = ?)',
      local.id
    );
    await db.runAsync('DELETE FROM split_expenses WHERE group_id = ?', local.id);
    await db.runAsync('DELETE FROM split_members WHERE group_id = ?', local.id);
  }
  await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, local.id);
}

/**
 * Applies one page of server rows. Returns how many local rows changed.
 * Runs in a single transaction with change tracking silenced, so a failure
 * rolls back cleanly and nothing applied here is uploaded again.
 */
export async function applyRemoteRows(db: SQLiteDatabase, table: SyncTable, rows: RemoteRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const dataColumns = SYNC_TABLES[table] as readonly string[];
  let changed = 0;

  await db.withTransactionAsync(async () => {
    await setSyncMeta(db, 'applying', '1');
    try {
      for (const r of rows) {
        // One bad row (e.g. data that breaks a table rule) must not block the rest.
        try {
          let local = await db.getFirstAsync<LocalRow>(
            `SELECT id, dirty, synced, modified_at, uid FROM ${table} WHERE uid = ?`,
            r.uid
          );

          if (!local) {
            // Deleted here and not yet uploaded: the server copy is about to be
            // deleted too, so do not bring it back in the meantime.
            const pendingDelete = await db.getFirstAsync(
              'SELECT 1 AS x FROM sync_tombstones WHERE tbl = ? AND uid = ?',
              table,
              r.uid
            );
            if (pendingDelete) continue;
          }

          if (r.deleted_at) {
            if (local && remoteDeleteWins(local, r.modified_at)) {
              await applyDelete(db, table, local);
              changed += 1;
            }
            continue;
          }

          const values = await localValues(db, table, r);
          if (!values) continue;

          if (!local) {
            const twin = await findTwin(db, table, values);
            if (twin) {
              if (twin.row.synced === 1) {
                // The server holds both copies; retire ours so only one survives.
                await db.runAsync(
                  `INSERT OR REPLACE INTO sync_tombstones (tbl, uid, deleted_at) VALUES (?, ?, ${NOW})`,
                  table,
                  twin.row.uid
                );
              }
              await db.runAsync(`UPDATE ${table} SET uid = ?, synced = 1 WHERE id = ?`, r.uid, twin.row.id);
              local = { ...twin.row, uid: r.uid };
            }
          }

          const decision = decide(local, r.modified_at);
          let id = local?.id ?? 0;
          if (decision === 'insert') {
            const columns = [...dataColumns, 'uid', 'modified_at', 'dirty', 'synced'];
            const result = await db.runAsync(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
              [...dataColumns.map((c) => values[c]), r.uid, r.modified_at, 0, 1]
            );
            id = result.lastInsertRowId;
          } else if (decision === 'overwrite') {
            await db.runAsync(
              `UPDATE ${table} SET ${dataColumns.map((c) => `${c} = ?`).join(', ')},
                 modified_at = ?, dirty = 0, synced = 1 WHERE id = ?`,
              [...dataColumns.map((c) => values[c]), r.modified_at, id]
            );
          } else {
            await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id = ?`, id);
          }

          if (decision === 'insert' || decision === 'overwrite') {
            if (table === 'transactions') await replaceLabels(db, id, r.label_uids);
            if (table === 'split_expenses') await replaceShares(db, id, r.shares);
            changed += 1;
          }
        } catch {
          // Skipped; it stays on the server and is retried when it next changes.
        }
      }
    } finally {
      await setSyncMeta(db, 'applying', '0');
    }
  });
  return changed;
}
