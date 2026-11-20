import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { readSettings, writeSetting } from '@/db/repositories';
import {
  SYNC_ORDER,
  applyRemoteRows,
  clearTombstones,
  getSyncMeta,
  markPushed,
  readDirtyRows,
  readTombstones,
  rekeyUnsyncedRows,
  setSyncMeta,
  type RemoteRow,
} from '@/db/sync-store';
import type { SyncTable } from '@/db/migrations';

import { cursorWithOverlap, toIso } from './logic';

const PAGE = 500;
const BATCH = 200;

export type SyncResult = {
  /** Local rows changed by what was downloaded. */
  pulled: number;
  /** Rows and deletions uploaded. */
  pushed: number;
  /** Set when another device changed the currency more recently than this one. */
  currency: string | null;
};

/** Thrown when this device's data is already linked to a different account. */
export class AccountMismatchError extends Error {
  constructor() {
    super('This device is linked to a different account.');
    this.name = 'AccountMismatchError';
  }
}

function fail(step: string, error: { message: string; code?: string }): never {
  // PGRST205 / PGRST204: a table or column is not on the server, i.e. the schema is older than the app.
  if (
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /Could not find the (table|'[^']+' column)/i.test(error.message)
  ) {
    throw new Error('The sync server needs an update. Run the latest supabase/schema.sql in Supabase, then sync again.');
  }
  throw new Error(`${step}: ${error.message}`);
}

/**
 * One full round: download, then upload.
 *
 * Pulling first means a conflict is settled on the device, by comparing edit
 * times, before anything is sent — so an older local edit never overwrites a
 * newer one on the server. Every step is idempotent: if the network drops
 * midway, the next round simply continues.
 */
export async function runSync(db: SQLiteDatabase, client: SupabaseClient, userId: string): Promise<SyncResult> {
  const linkedUser = await getSyncMeta(db, 'user_id');
  if (linkedUser && linkedUser !== userId) throw new AccountMismatchError();
  if (!linkedUser) await setSyncMeta(db, 'user_id', userId);

  let pulled = 0;
  let pushed = 0;

  // 1. Download what changed on the server since the last round. Everything
  // is fetched first, then applied in two passes: new and changed rows
  // parents-first (accounts before the transactions that use them), deletions
  // children-first. Otherwise deleting an account and its transactions on one
  // device would reach this one with the account first, find it still in use,
  // and archive it instead, bringing it back for everyone.
  const downloaded = new Map<SyncTable, RemoteRow[]>();
  const newest = new Map<SyncTable, string>();
  for (const table of SYNC_ORDER) {
    const since = cursorWithOverlap(await getSyncMeta(db, `cursor:${table}`));
    const rows: RemoteRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = client
        .from(table)
        .select('*')
        .order('server_updated_at', { ascending: true })
        .order('uid', { ascending: true })
        .range(from, from + PAGE - 1);
      if (since) query = query.gte('server_updated_at', since);
      const { data, error } = await query;
      if (error) fail(`Downloading ${table}`, error);

      const page = (data ?? []) as (RemoteRow & { server_updated_at: string })[];
      for (const row of page) {
        rows.push({
          ...row,
          modified_at: toIso(row.modified_at),
          deleted_at: row.deleted_at ? toIso(row.deleted_at) : null,
        });
        const stamp = toIso(row.server_updated_at);
        const latest = newest.get(table);
        if (!latest || stamp > latest) newest.set(table, stamp);
      }
      if (page.length < PAGE) break;
    }
    downloaded.set(table, rows);
  }
  for (const table of SYNC_ORDER) {
    pulled += await applyRemoteRows(db, table, (downloaded.get(table) ?? []).filter((row) => !row.deleted_at));
  }
  for (const table of [...SYNC_ORDER].reverse()) {
    pulled += await applyRemoteRows(db, table, (downloaded.get(table) ?? []).filter((row) => row.deleted_at));
  }
  for (const [table, stamp] of newest) await setSyncMeta(db, `cursor:${table}`, stamp);

  // 2. Upload local changes.
  try {
    pushed += await pushDirtyRows(db, client, userId);
  } catch (error) {
    if (!(error instanceof OwnershipConflict)) throw error;
    // Some of this device's never-uploaded rows have uids that already belong
    // to another account on the server (typically: data synced to account A,
    // then moved to account B by an older version without re-keying). Those
    // rows are unknown to this account, so giving them fresh uids is safe.
    await rekeyUnsyncedRows(db);
    pushed += await pushDirtyRows(db, client, userId);
  }

  // 3. Upload deletions (soft-deleted on the server so other devices learn of them).
  const tombstones = await readTombstones(db);
  for (const table of SYNC_ORDER) {
    const mine = tombstones.filter((t) => t.tbl === table);
    for (let i = 0; i < mine.length; i += BATCH) {
      const batch = mine.slice(i, i + BATCH);
      const deletedAt = batch.reduce((latest, t) => (t.deleted_at > latest ? t.deleted_at : latest), batch[0].deleted_at);
      const { error } = await client
        .from(table)
        .update({ deleted_at: deletedAt, modified_at: deletedAt })
        .in('uid', batch.map((t) => t.uid));
      if (error) fail(`Uploading deletions for ${table}`, error);
      await clearTombstones(db, batch);
      pushed += batch.length;
    }
  }

  return { pulled, pushed, currency: await syncCurrency(db, client, userId) };
}

/** The server refused rows because their uids belong to another account. */
class OwnershipConflict extends Error {}

/** Postgres "insufficient privilege": raised by row-level security. */
const RLS_VIOLATION = '42501';

async function pushDirtyRows(db: SQLiteDatabase, client: SupabaseClient, userId: string): Promise<number> {
  let pushed = 0;
  for (const table of SYNC_ORDER) {
    const dirty = await readDirtyRows(db, table);
    for (let i = 0; i < dirty.length; i += BATCH) {
      const batch = dirty.slice(i, i + BATCH);
      // The column default would fill user_id too; stating it keeps the
      // request self-explanatory and independent of server defaults.
      const rows = batch.map((row) => ({ ...row, user_id: userId }));
      const { error } = await client.from(table).upsert(rows, { onConflict: 'uid' });
      if (error?.code === RLS_VIOLATION) throw new OwnershipConflict(`Uploading ${table}: ${error.message}`);
      if (error) fail(`Uploading ${table}`, error);
      await markPushed(db, table, batch);
      pushed += batch.length;
    }
  }
  return pushed;
}

/** How much of the user's own data the server holds (live rows only; defaults do not count). */
export async function countRemoteData(client: SupabaseClient): Promise<{ transactions: number; total: number }> {
  const live = (table: string) => client.from(table).select('uid', { count: 'exact', head: true }).is('deleted_at', null);
  const results = await Promise.all([
    live('transactions'),
    live('budgets'),
    live('labels'),
    live('accounts').neq('opening_balance', 0),
    live('split_groups'),
  ]);
  for (const { error } of results) if (error) fail('Checking cloud data', error);
  const [transactions, ...rest] = results.map((r) => r.count ?? 0);
  return { transactions, total: transactions + rest.reduce((sum, n) => sum + n, 0) };
}

/**
 * Marks all of this user's server data as deleted (soft delete, children
 * first), so every other signed-in device removes it on its next sync too.
 * Used for "Use this device's data", before uploading this device's data.
 */
export async function retireRemoteData(client: SupabaseClient, userId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const table of [...SYNC_ORDER].reverse()) {
    const { error } = await client
      .from(table)
      .update({ deleted_at: now, modified_at: now })
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) fail(`Replacing cloud data in ${table}`, error);
  }
}

/**
 * Permanently deletes everything this user has on the server: every synced
 * table plus their profile. Row-level security already limits a delete to the
 * user's own rows; the explicit filter is required by the API and documents it.
 * Returns how many rows were removed.
 */
export async function deleteRemoteData(client: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const table of [...SYNC_ORDER, 'profiles'] as const) {
    const { count, error } = await client.from(table).delete({ count: 'exact' }).eq('user_id', userId);
    if (error) fail(`Deleting ${table}`, error);
    removed += count ?? 0;
  }
  return removed;
}

/**
 * Deletes the signed-in user's account; the server removes all of their rows
 * with it. Needs the `delete_my_account` function from supabase/schema.sql.
 */
export async function deleteRemoteAccount(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('delete_my_account');
  if (!error) return;
  // PGRST202: the function does not exist, i.e. the schema has not been updated.
  if (error.code === 'PGRST202' || /delete_my_account/.test(error.message)) {
    throw new Error('The server is missing account deletion. Run the latest supabase/schema.sql in Supabase, then try again.');
  }
  fail('Deleting account', error);
}

/** The currency must agree across devices, or amounts would be labelled differently on each. */
async function syncCurrency(db: SQLiteDatabase, client: SupabaseClient, userId: string): Promise<string | null> {
  const settings = await readSettings(db);
  const localCurrency = settings.currency;
  const localChangedAt = settings.currencyModifiedAt ?? '';

  const { data, error } = await client.from('profiles').select('currency, modified_at').eq('user_id', userId).maybeSingle();
  if (error) fail('Reading profile', error);

  const remoteChangedAt = data ? toIso(data.modified_at) : '';
  if (data && remoteChangedAt > localChangedAt) {
    await writeSetting(db, 'currencyModifiedAt', remoteChangedAt);
    if (data.currency === localCurrency) return null;
    await writeSetting(db, 'currency', data.currency as string);
    return data.currency as string;
  }
  if (localCurrency && (!data || localChangedAt > remoteChangedAt)) {
    const modifiedAt = localChangedAt || new Date().toISOString();
    const { error: upsertError } = await client
      .from('profiles')
      .upsert({ user_id: userId, currency: localCurrency, modified_at: modifiedAt }, { onConflict: 'user_id' });
    if (upsertError) fail('Saving profile', upsertError);
    if (!localChangedAt) await writeSetting(db, 'currencyModifiedAt', modifiedAt);
  }
  return null;
}
