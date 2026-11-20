import { authParamsFromUrl, cursorWithOverlap, decide, decideLink, remoteDeleteWins, toIso } from '../logic';

const T1 = '2026-11-14T10:00:00.000Z';
const T2 = '2026-11-14T11:00:00.000Z';

describe('decide (last edit wins)', () => {
  it('inserts rows this device has never seen', () => {
    expect(decide(null, T1)).toBe('insert');
  });
  it('keeps an unsent local edit that is newer or the same age', () => {
    expect(decide({ dirty: 1, modified_at: T2 }, T1)).toBe('keep-local');
    expect(decide({ dirty: 1, modified_at: T1 }, T1)).toBe('keep-local');
  });
  it('lets a newer server edit replace an older unsent local edit', () => {
    expect(decide({ dirty: 1, modified_at: T1 }, T2)).toBe('overwrite');
  });
  it('takes the server copy whenever the local row has nothing unsent', () => {
    expect(decide({ dirty: 0, modified_at: T2 }, T1)).toBe('overwrite');
    expect(decide({ dirty: 0, modified_at: T1 }, T2)).toBe('overwrite');
  });
  it('recognises a row that is already identical', () => {
    expect(decide({ dirty: 0, modified_at: T1 }, T1)).toBe('unchanged');
  });
});

describe('remoteDeleteWins', () => {
  it('deletes unless the row was edited locally after the delete', () => {
    expect(remoteDeleteWins(null, T1)).toBe(false);
    expect(remoteDeleteWins({ dirty: 0, modified_at: T2 }, T1)).toBe(true);
    expect(remoteDeleteWins({ dirty: 1, modified_at: T1 }, T2)).toBe(true);
    expect(remoteDeleteWins({ dirty: 1, modified_at: T2 }, T1)).toBe(false);
  });
});

describe('timestamps', () => {
  it('normalises Postgres and SQLite forms to one comparable format', () => {
    expect(toIso('2026-11-14T10:00:00+00:00')).toBe(T1);
    expect(toIso('2026-11-14T15:45:00.5+05:45')).toBe(T1.replace('10:00:00.000', '10:00:00.500'));
    expect(toIso(T1)).toBe(T1);
  });
  it('re-reads a short window before the cursor', () => {
    expect(cursorWithOverlap(null)).toBeNull();
    expect(cursorWithOverlap(T1, 15_000)).toBe('2026-11-14T09:59:45.000Z');
  });
});

describe('authParamsFromUrl', () => {
  it('reads tokens from the fragment', () => {
    expect(authParamsFromUrl('meropaisa://auth-callback#access_token=a.b%2Bc&refresh_token=r1&expires_in=3600')).toEqual({
      access_token: 'a.b+c',
      refresh_token: 'r1',
      expires_in: '3600',
    });
  });
  it('reads errors and codes from the query', () => {
    expect(authParamsFromUrl('meropaisa://auth-callback?error=access_denied&error_description=User+cancelled')).toEqual({
      error: 'access_denied',
      error_description: 'User cancelled',
    });
    expect(authParamsFromUrl('meropaisa://auth-callback?code=abc123').code).toBe('abc123');
  });
  it('returns nothing for a bare URL', () => {
    expect(authParamsFromUrl('meropaisa://auth-callback')).toEqual({});
  });
});

describe('decideLink (what to do at sign-in)', () => {
  it('just syncs a device already linked to this account', () => {
    expect(decideLink('me', 'me', true, true)).toBe('sync');
  });
  it('asks when both the device and the cloud have data', () => {
    expect(decideLink(null, 'me', true, true)).toBe('ask');
    expect(decideLink('someone-else', 'me', true, true)).toBe('ask');
  });
  it('links straight away when only one side (or neither) has data', () => {
    expect(decideLink(null, 'me', true, false)).toBe('link');
    expect(decideLink(null, 'me', false, true)).toBe('link');
    expect(decideLink(null, 'me', false, false)).toBe('link');
  });
  it('gives data from another account fresh ids', () => {
    expect(decideLink('someone-else', 'me', true, false)).toBe('link-with-new-ids');
    expect(decideLink('someone-else', 'me', false, true)).toBe('link-with-new-ids');
  });
});
