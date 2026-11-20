# Cloud sync setup

Sync is optional. Without the two settings below the app works exactly as before, fully offline, and Settings shows "Cloud sync — Not set up".

You need a Supabase project and a Google OAuth client. Both have free tiers. Allow about 20 minutes.

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and create a new project. Pick a region near you and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and press **Run**. It creates the tables and the security rules that keep each user's rows private. It is safe to run again later, and you must run it again whenever the app adds tables or columns (for example, split bills, or need/want on categories): until then sync stops with "The sync server needs an update".

## 2. Create the Google sign-in client

1. In Supabase open **Authentication → Sign In / Providers → Google**. Leave this tab open: it shows a **Callback URL** you need in a moment.
2. In the [Google Cloud Console](https://console.cloud.google.com/) create (or pick) a project, then **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email, and add yourself as a test user (or publish the app).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Under **Authorized redirect URIs** add the **Callback URL** copied from the Supabase tab.
   - For the web version in development, also add `http://localhost:8081` under **Authorized JavaScript origins**.
4. Copy the **Client ID** and **Client secret** into the Supabase Google provider form, switch the provider **on** and save.

The app signs in through the system browser, so only this one *Web* client is needed — no Android or iOS client and no SHA-1 fingerprint.

## 3. Allow the app to receive the sign-in

In Supabase open **Authentication → URL Configuration** and add under **Redirect URLs**:

```
meropaisa://**
http://localhost:8081
http://localhost:8082
```

The first lets the Android/iOS app be reopened after Google sign-in. If you set Supabase up earlier with `expensemanager://**` (the app's former scheme), replace it with this one (the scheme comes from `scheme` in `app.json`; change both together). The `localhost` entries are for the web version in development: add the port your dev server prints, since Expo moves to 8082 when 8081 is taken. Without a matching entry Supabase sends you back to its Site URL instead of the app.

## 4. Point the app at the project

1. In Supabase open **Project Settings → API keys** (and **Data API** for the URL).
2. Copy `.env.example` to `.env` and fill in the project URL and the **publishable** key. The URL is the bare project address (`https://<project>.supabase.co`), not the `…/rest/v1` API address shown on the same page.
3. Restart the dev server (`yarn start`), or make a new build for the phone — these values are baked in at build time.

Never put the Supabase **secret** key in `.env` or anywhere in the app.

## 5. Use it

Open **Settings → Cloud sync → Sign in with Google**. The first sync uploads everything on the device. Sign in with the same Google account on another device to get the same data there.

- Sync runs after sign-in, when the app comes to the foreground, a few seconds after any change, and on **Sync now**.
- The app stays fully usable offline; changes are uploaded when a connection returns.
- If the same record is edited on two devices, the most recent edit wins.
- Signing out keeps the data on the device and stops syncing.
- If signing in finds your data both on this device and in the cloud, sync pauses and Settings asks which to keep: **Use cloud data** (replaces this device's data), **Use this device's data** (replaces the cloud's data, and your other devices follow), or **Merge both** (keeps everything; transactions recorded on both may appear twice). If only one side has data, they are combined automatically.
- **Settings → Reset all data** clears accounts, categories, labels, budgets and transactions and starts again from the defaults; with sync on, your other devices follow.

## How it works

| Piece | Where |
| --- | --- |
| Server tables and security rules | `supabase/schema.sql` |
| Change tracking (triggers, tombstones) | `src/db/migrations.ts` (`syncMigration`) |
| Reading unsent changes, applying downloads | `src/db/sync-store.ts` |
| Download-then-upload round | `src/sync/engine.ts` |
| Conflict rules (unit tested) | `src/sync/logic.ts` |
| Google sign-in | `src/sync/auth.ts` |
| When sync runs, status for the UI | `src/sync/provider.tsx` |

Records are matched across devices by a random `uid`; the local integer ids never leave the device. Deletes are sent as soft deletes so other devices learn about them.

## Privacy and limits

- Your financial data is stored in your Supabase project, readable only by the signed-in owner of each row (row-level security). It is not end-to-end encrypted: anyone with admin access to the Supabase project can read it.
- The sign-in session is stored on the device in the app's private storage, unencrypted.
- App lock and theme are per device and are not synced. The currency is.
- **Settings → Cloud sync → Delete cloud data** permanently removes everything the signed-in user has on the server and signs that device out; data on the phone is kept. Other devices keep their copies, so sign out on them too, or their next changes are uploaded again.
- The sign-in account itself (email in **Authentication → Users**) is not removed by that button; a project admin can delete it there, which also removes any rows left.
