import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * SQLite has no reactive queries, so every write bumps a global version and
 * every `useQuery` re-runs when it changes. With a local database and a few
 * thousand rows this is simpler and fast enough versus a keyed query cache.
 */
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
}

type QueryState<T> = { data: T | undefined; loading: boolean; error: Error | null };

/**
 * Runs `query` on mount, whenever `deps` change, and after any write.
 * Previous data stays visible while a refresh is in flight to avoid flicker.
 */
export function useQuery<T>(
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: readonly unknown[] = []
): QueryState<T> {
  const db = useSQLiteContext();
  const dataVersion = useDataVersion();
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: null });
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  });

  useEffect(() => {
    let cancelled = false;
    queryRef
      .current(db)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            data: prev.data,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, dataVersion, ...deps]);

  return state;
}
