import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './client';
import { authParamsFromUrl } from './logic';

/**
 * Google sign-in through Supabase, using the system browser.
 *
 * On Android/iOS the browser returns to the app through its URL scheme
 * (`meropaisa://auth-callback`, which must be allow-listed in Supabase)
 * carrying the session tokens. On web the page simply redirects and Supabase
 * reads the session from the URL when the app loads again.
 *
 * Resolves to false when the user closes the browser without signing in.
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (!supabase) throw new Error('Cloud sync is not set up for this build.');

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: globalThis.location.origin, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return true;
  }

  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  const params = authParamsFromUrl(result.url);
  if (params.error || params.error_description) {
    throw new Error(params.error_description || params.error);
  }
  if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
    return true;
  }
  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return true;
  }
  throw new Error('Google sign-in did not return a session.');
}

export async function signOut(): Promise<void> {
  // Local scope: this device only. Data already on the device is kept.
  await supabase?.auth.signOut({ scope: 'local' });
}
