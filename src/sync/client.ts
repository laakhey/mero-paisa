import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The project address only, e.g. https://abc.supabase.co. Supabase's dashboard
 * also shows the database API address (…/rest/v1); pasting that instead sends
 * sign-in to the wrong service ("No API key found in request"), so strip it.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth)\/v1$/, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Null when the project has no Supabase settings: sync is optional, and the
 * app must keep working fully offline without it.
 *
 * Both values are public by design (row-level security protects the data);
 * a Supabase *secret* key must never be put in the app.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          // SQLite-backed on Android/iOS (installed above), the browser's own on web.
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          // Only a browser has a URL to read the session from after the Google redirect.
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

if (supabase && Platform.OS !== 'web') {
  // The token refresh loop would otherwise keep running while the app is in the background.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
