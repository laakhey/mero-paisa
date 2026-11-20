import { Redirect } from 'expo-router';

/**
 * Google sign-in returns to the app at `meropaisa://auth-callback`.
 * The sign-in code reads the tokens from that URL itself; this route only
 * exists so the router has somewhere to land instead of "page not found".
 */
export default function AuthCallback() {
  return <Redirect href="/settings" />;
}
