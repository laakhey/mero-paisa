This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use **yarn** (v1) for scripts and Node 26 (`nvm use`) — `engines` rejects older Node.

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
yarn verify                  # typecheck + lint + tests — run before declaring any task done
yarn typecheck | yarn lint | yarn test
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `yarn verify` before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Project rules

- **Money is an integer in minor units.** Never store, add or compare amounts as floats; parse and format only through `src/lib/money.ts` — float cents drift.
- **Transaction dates are local `YYYY-MM-DD` strings**, never UTC timestamps — a timestamp moves the transaction to another day when the time zone changes.
- **Month keys (`YYYY-MM`) are read in the active calendar (AD or Bikram Sambat)**: get month boundaries only from `monthRange`, never from a date's `YYYY-MM` prefix or `substr` in SQL — BS months don't line up with AD ones. Screens hold their month with `useMonthState` so a calendar switch resets it; stored dates stay AD.
- **Format money only through `useSettings().money`** (or `formatMoney` with the user's style) — it applies the rupee symbol and lakh/international grouping the user chose.
- **All SQL lives in `src/db/`** (`repositories.ts` for the app, `sync-store.ts` for sync bookkeeping); screens call repository functions through `useQuery` — keeps queries reviewable and screens free of persistence details.
- **Every write must call `notifyDataChanged()`** (repositories already do) — it is the only thing that refreshes `useQuery` results.
- **Migrations are append-only** in `src/db/migrations.ts`; never edit a shipped entry — installed apps track progress by `PRAGMA user_version`.
- **Bind values, never interpolate them into SQL**; escape `LIKE` wildcards as `listTransactions` does.
- **Account balances are derived in SQL, not stored** — a stored balance can drift from the ledger.
- **Archive, don't delete, accounts and categories that have transactions** — history must keep its labels.
- **Icon keys in `src/components/ui/icon.tsx` are persisted in the database**: add keys, never rename or remove them.
- **Colours, spacing and type come from `src/theme/tokens.ts`** via `useTheme()` / `<Text variant>` — hard-coded values break dark mode.
- **Icon-only controls need an `accessibilityLabel`** and interactive targets at least 48pt.
- **No `withExclusiveTransactionAsync`** — unsupported on web, which is the fastest verification target; use `withTransactionAsync`.
- **Platform-specific UI goes in `.web.tsx` / `.ios.tsx` siblings** (see `date-field`) rather than large `Platform.OS` branches.
- **On web the database allows one open tab at a time** (the browser locks the file); open failures render `DatabaseError` from the root layout, and its web retry must be a full page reload — retrying in place leaves the SQLite worker broken.
- **Delete join rows explicitly** (e.g. `transaction_labels`) instead of relying on `ON DELETE CASCADE` — cascades silently stop if the `foreign_keys` pragma is ever off for a connection.
- **Forms scroll inside the shared `Screen`**, which keeps the focused field above the keyboard (`src/components/keyboard.tsx`); don't add `KeyboardAvoidingView` around it — the field would move twice. Use the `Input` primitive for text fields: it tells the form which field to reveal, a raw `TextInput` is not. Keep this plain JavaScript (no native keyboard library) so it works in Expo Go. Android is edge-to-edge, so the window never resizes for the keyboard on its own.
- **Large-font `TextInput`s get an explicit `height` and no `lineHeight`** — auto-sized ones clip their digits on Android.
- **The CSV export and import formats are one contract** (`src/lib/export.ts`, `src/lib/import.ts`): change them together and keep old exports importable — users hold files written by earlier versions.
- **Import stays all-or-nothing and duplicate-safe** (validate everything first, one database transaction, skip rows matching an existing transaction) — a partial or doubled import corrupts balances silently.
- **A new table or column must be added to the backup** (`BackupData` in `src/lib/backup.ts`, `readBackupData` / `restoreBackupData`, and `parseBackup` validation) in the same change — anything left out is silently lost on restore.
- **Backups stay backward compatible**: treat fields missing from older files as empty or default, and bump `BACKUP_FORMAT` only for a breaking change — users keep old backup files.
- **Restore only data that passed `parseBackup`**, and keep the restore in one database transaction — it deletes everything first, so a failure midway must roll back.
- **A new synced table or column needs four edits together**: `SYNC_TABLES` plus a migration in `src/db/migrations.ts`, the read/apply mappings in `src/db/sync-store.ts`, and `supabase/schema.sql` — a column missing from any of them is silently not synced.
- **Never write `uid`, `modified_at`, `dirty` or `synced` from app code**; triggers own them, and only `sync-store.ts` (with `applying` set) may bypass them — hand-set values break conflict resolution.
- **Row uids are global across all users on the server**, so data moved between accounts must get fresh uids (`resetSyncState(db, { newIdentities: true })`); the push step also re-keys never-uploaded rows once if the server reports an ownership conflict (RLS error 42501).
- **Never mix a device's data into an account silently**: linking goes through `decideLink` (`src/sync/logic.ts`), which asks the user whenever both the device and the cloud hold data. "Use cloud data" wipes locally without tombstones (`wipeLocalData`); "Use this device's data" soft-deletes the cloud copy (`retireRemoteData`) so other devices follow.
- **Downloads apply new rows parents-first and deletions children-first** (`runSync`); applying an account deletion before its transactions' deletions archives and resurrects the account.
- **Sync conflict rules live in `src/sync/logic.ts` and stay pure and unit tested** — they decide whose edit survives.
- **Only the Supabase publishable key may appear in the app or `.env`**; never a secret key — everything in the bundle is public.
- **Keep sync optional**: every code path must work with `supabase === null` — the app's baseline is fully offline.
- **Gestures use React Native's `PanResponder`** (see `src/components/month-swipe.tsx`), not a native gesture library — they must work in Expo Go, builds and web alike, and must only claim clearly sideways drags so scrolling and taps keep working.
- **Release identifiers are permanent once shipped**: package `com.laakhey.meropaisa`, `DATABASE_NAME` (renaming hides users' data), the `meropaisa` URL scheme (must match the Supabase redirect list) and the EAS `slug`. To change the backup ID, add the old one to `LEGACY_BACKUP_APPS` so older backups still restore.
- Store listing drafts, the privacy policy and the icon source live in `store/`; regenerate icons with `store/icon-source.py` + ImageMagick rather than editing PNGs by hand.
- **Split-bill maths lives in `src/lib/split.ts` and must conserve money**: shares always sum to the bill total (largest-remainder rounding) and balances always sum to zero; keep both properties under test.
- **A split bill's "my share" is a normal transaction linked by `split_expenses.transaction_id`** (no foreign key, the user may delete it); `saveSplitExpense` / `deleteSplitExpense` keep it in step, and anything deleting transactions must clear the link.
- **Full wipes use `WIPE_ORDER`** (`src/db/sync-store.ts`), children before parents — add new tables there so reset, restore and "use cloud data" all clear them.
- **Shipped migrations must not depend on `SYNC_TABLES` growing**: pass an explicit table list to `trackingSql`, and freeze a table's column list (`frozenColumns`, e.g. `CATEGORY_COLUMNS_V1`) when you add a synced column. The new column's migration must `DROP` and recreate the table's `_sync_update` trigger with an explicit list — the trigger only fires for the columns it was created with.
- **Need / want / savings is `categories.priority`** (`'need' | 'want' | 'savings' | NULL` = not sorted; savings includes debt repayment), expense categories only. Savings in reports also counts net transfers into savings-type accounts (`getPrioritySplit`), so don't ask users to tag those; read it through `parsePriority` / `priorityForKind` (`src/lib/priorities.ts`) so unknown or income values become `null`. Default values set inside a migration must not mark rows dirty — a later-upgrading device would overwrite choices already synced from another.
- Pure logic in `src/lib` gets a unit test in `src/lib/__tests__`.
- Update `README.md` and this file when a major feature or rule changes.
