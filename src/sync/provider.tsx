import type { Session } from '@supabase/supabase-js';
import { deleteDatabaseAsync, openDatabaseAsync, useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { migrate } from '@/db/migrations';
import { resetAllData, writeSetting } from '@/db/repositories';
import { notifyDataChanged, useDataVersion } from '@/db/store';
import { countLocalData, getSyncMeta, resetSyncState, setSyncMeta, wipeLocalData } from '@/db/sync-store';
import { useSettings } from '@/providers/settings';

import { signInWithGoogle, signOut as signOutOfSupabase } from './auth';
import { supabase } from './client';
import { countRemoteData, deleteRemoteAccount, deleteRemoteData, retireRemoteData, runSync } from './engine';
import { decideLink } from './logic';

type SyncStatus = 'idle' | 'syncing' | 'error';

/** Transaction counts on each side, shown to help the user choose. */
export type DataChoice = { localTransactions: number; cloudTransactions: number };

type SyncContextValue = {
  /** False when the build has no Supabase settings; sync UI should explain rather than offer sign-in. */
  configured: boolean;
  email: string | null;
  status: SyncStatus;
  /** ISO time of the last successful round on this device, or null. */
  lastSyncedAt: string | null;
  error: string | null;
  /**
   * Set when signing in finds the user's data both on this device and in the
   * cloud: sync waits until the user picks which to keep (`resolveChoice`).
   */
  choice: DataChoice | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  /**
   * - `cloud`: replace this device's data with the cloud's.
   * - `device`: replace the cloud's data (on every device) with this device's.
   * - `merge`: keep both and combine them.
   */
  resolveChoice: (option: 'cloud' | 'device' | 'merge') => Promise<void>;
  /**
   * Deletes all of this user's data from the server, then signs this device out.
   * Data on the device is kept. Returns the number of server rows removed.
   */
  deleteCloudData: () => Promise<number>;
  /** Deletes the account itself and all its cloud data, then signs out. Data on the device is kept. */
  deleteAccount: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

/** Wait this long after the last edit before uploading, so a burst of edits is one round. */
const DEBOUNCE_MS = 4000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { adoptCurrency } = useSettings();
  const dataVersion = useDataVersion();

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<DataChoice | null>(null);

  const running = useRef(false);
  // While the user has not chosen, automatic rounds must not ask the server again and again.
  const awaitingChoice = useRef(false);
  const rerun = useRef(false);
  // Data-version bumps caused by sync itself must not schedule another round.
  const ownVersion = useRef(dataVersion);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    getSyncMeta(db, 'last_synced_at').then(setLastSyncedAt);
  }, [db]);

  useEffect(() => {
    // Development only: lets the sync engine be driven against a stand-in server from the console.
    if (__DEV__) Object.assign(globalThis, {
        __syncDev: {
          db,
          supabase,
          runSync,
          deleteRemoteData,
          resetSyncState,
          resetAllData,
          countRemoteData,
          retireRemoteData,
          wipeLocalData,
          countLocalData,
          setSyncMeta,
          getSyncMeta,
          decideLink,
          notifyDataChanged,
          // A second, independent database: lets two "devices" be tested in one browser.
          openTestDatabase: async (name: string) => {
            const other = await openDatabaseAsync(name);
            await migrate(other);
            return other;
          },
          deleteTestDatabase: (name: string) => deleteDatabaseAsync(name),
        },
      });
  }, [db]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const sync = useCallback(async () => {
    if (!supabase || !userId) return;
    // Single flight: a request during a round runs once more afterwards instead of overlapping.
    if (running.current) {
      rerun.current = true;
      return;
    }
    if (awaitingChoice.current) return;
    running.current = true;
    setStatus('syncing');
    try {
      const linked = await getSyncMeta(db, 'user_id');
      if (linked !== userId) {
        const [local, cloud] = await Promise.all([countLocalData(db), countRemoteData(supabase)]);
        const decision = decideLink(linked, userId, local.total > 0, cloud.total > 0);
        if (decision === 'ask') {
          awaitingChoice.current = true;
          setChoice({ localTransactions: local.transactions, cloudTransactions: cloud.transactions });
          setStatus('idle');
          return;
        }
        if (decision === 'link-with-new-ids') await resetSyncState(db, { newIdentities: true });
        await setSyncMeta(db, 'user_id', userId);
      }
      do {
        rerun.current = false;
        const result = await runSync(db, supabase, userId);
        if (result.currency) adoptCurrency(result.currency);
        if (result.pulled > 0 || result.currency) notifyDataChanged();
      } while (rerun.current);
      const now = new Date().toISOString();
      await setSyncMeta(db, 'last_synced_at', now);
      setLastSyncedAt(now);
      setError(null);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [db, userId, adoptCurrency]);

  // Sync on sign-in and whenever the app returns to the foreground.
  useEffect(() => {
    if (!userId) return;
    // Deferred so the first round starts after this render has settled.
    const timer = setTimeout(sync, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [userId, sync]);

  // Sync shortly after local edits.
  useEffect(() => {
    if (!userId || running.current) {
      ownVersion.current = dataVersion;
      return;
    }
    if (dataVersion === ownVersion.current) return;
    ownVersion.current = dataVersion;
    const timer = setTimeout(sync, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dataVersion, userId, sync]);

  const value = useMemo<SyncContextValue>(
    () => ({
      configured: supabase !== null,
      email: session?.user.email ?? null,
      status,
      lastSyncedAt,
      error,
      choice,
      signIn: async () => {
        await signInWithGoogle();
      },
      signOut: async () => {
        await signOutOfSupabase();
        awaitingChoice.current = false;
        setChoice(null);
        setError(null);
        setStatus('idle');
      },
      syncNow: sync,
      deleteCloudData: async () => {
        if (!supabase || !userId) throw new Error('Sign in first.');
        // A round running now could upload rows again right after they are deleted.
        if (running.current) throw new Error('A sync is in progress. Try again in a moment.');
        running.current = true;
        try {
          const removed = await deleteRemoteData(supabase, userId);
          // Forget the old server state, so signing in again uploads everything afresh.
          await resetSyncState(db);
          await signOutOfSupabase();
          setLastSyncedAt(null);
          setError(null);
          awaitingChoice.current = false;
          setChoice(null);
          setStatus('idle');
          return removed;
        } finally {
          running.current = false;
        }
      },
      deleteAccount: async () => {
        if (!supabase || !userId) throw new Error('Sign in first.');
        if (running.current) throw new Error('A sync is in progress. Try again in a moment.');
        running.current = true;
        try {
          await deleteRemoteAccount(supabase);
          await resetSyncState(db);
          await signOutOfSupabase();
          setLastSyncedAt(null);
          setError(null);
          awaitingChoice.current = false;
          setChoice(null);
          setStatus('idle');
        } finally {
          running.current = false;
        }
      },
      resolveChoice: async (option) => {
        if (!supabase || !userId) throw new Error('Sign in first.');
        if (running.current) throw new Error('A sync is in progress. Try again in a moment.');
        running.current = true;
        try {
          if (option === 'cloud') {
            await wipeLocalData(db);
            // Let the cloud's currency win on the next round.
            await writeSetting(db, 'currencyModifiedAt', '');
          } else if (option === 'device') {
            await retireRemoteData(supabase, userId);
            await resetSyncState(db, { newIdentities: true });
            // Let this device's currency win on the next round.
            await writeSetting(db, 'currencyModifiedAt', new Date().toISOString());
          } else {
            await resetSyncState(db, { newIdentities: true });
          }
          await setSyncMeta(db, 'user_id', userId);
          awaitingChoice.current = false;
          setChoice(null);
          setLastSyncedAt(null);
        } finally {
          running.current = false;
        }
        notifyDataChanged();
        await sync();
      },
    }),
    [session, userId, status, lastSyncedAt, error, choice, sync, db]
  );

  return <SyncContext value={value}>{children}</SyncContext>;
}

export function useSync(): SyncContextValue {
  const value = use(SyncContext);
  if (!value) throw new Error('useSync must be used inside <SyncProvider>');
  return value;
}
