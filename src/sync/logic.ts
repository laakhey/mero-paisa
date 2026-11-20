/** Pure decision helpers for sync, kept free of I/O so they can be unit tested. */

export type LocalState = { dirty: number; modified_at: string } | null;

export type Decision = 'insert' | 'overwrite' | 'keep-local' | 'unchanged';

/**
 * Last edit wins, per record. A local row only beats the server while it has
 * unsent changes; once pushed, the server copy is authoritative.
 * Timestamps must be in the same ISO-8601 UTC form (see `toIso`).
 */
export function decide(local: LocalState, remoteModifiedAt: string): Decision {
  if (!local) return 'insert';
  if (local.dirty === 1 && local.modified_at >= remoteModifiedAt) return 'keep-local';
  if (local.dirty === 0 && local.modified_at === remoteModifiedAt) return 'unchanged';
  return 'overwrite';
}

/** A remote delete loses only to a local edit made after it. */
export function remoteDeleteWins(local: LocalState, remoteModifiedAt: string): boolean {
  if (!local) return false;
  return !(local.dirty === 1 && local.modified_at > remoteModifiedAt);
}

export type LinkDecision = 'sync' | 'ask' | 'link' | 'link-with-new-ids';

/**
 * What to do before syncing, given which account this device's data is linked
 * to and whether each side already holds the user's own data (transactions,
 * budgets, labels or account balances, not just the default categories).
 *
 * - Already linked to this account: just sync.
 * - Both sides have data: ask the user which to keep, never mix silently.
 * - Otherwise link and combine; data that came from another account gets
 *   fresh uids so it cannot collide with that account's copies on the server.
 */
export function decideLink(
  linkedUserId: string | null,
  userId: string,
  localHasData: boolean,
  cloudHasData: boolean
): LinkDecision {
  if (linkedUserId === userId) return 'sync';
  if (localHasData && cloudHasData) return 'ask';
  return linkedUserId ? 'link-with-new-ids' : 'link';
}

/** Normalises any timestamp Postgres or SQLite produced to `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export function toIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Pull slightly before the stored cursor. The server stamps rows with its
 * transaction start time, so a slow commit can land "in the past"; re-reading
 * a short window is harmless because applying a row twice changes nothing.
 */
export function cursorWithOverlap(cursor: string | null, overlapMs = 15_000): string | null {
  if (!cursor) return null;
  const time = new Date(cursor).getTime();
  return Number.isNaN(time) ? null : new Date(time - overlapMs).toISOString();
}

/**
 * Reads the parameters an OAuth provider appends to the redirect URL. Tokens
 * arrive in the fragment (#), errors and PKCE codes in the query (?).
 */
export function authParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        // Ignore a malformed pair rather than failing the whole sign-in.
      }
    }
  }
  return params;
}
