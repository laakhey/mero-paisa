# Mero Paisa

By Laakhey. Developed under the working name "Expense Manager"; backups made then can still be restored.

An offline-first personal finance app for **iOS and Android** (with a web build for development), built with Expo and React Native from a single TypeScript codebase.

All data lives in a local SQLite database on the device and the app works fully offline. Cloud sync is optional: sign in with Google to keep devices in step through your own Supabase project. Without it there is no account and no server.

## Features

- **Made for Nepal** — a first-run setup picks the currency (Nepali rupee first) and starting balances; rupee amounts use lakh/crore grouping (Rs 1,00,000; compact Rs 1.2L, Rs 3.4Cr), switchable to international; an optional **Bikram Sambat** calendar makes months, budgets and reports follow BS months (Kartik 2083), shows dates in BS, and replaces the date picker with a BS month calendar (AD dates shown small on each day).
- **Overview** — total balance across accounts, this month's income / spending / net, spending breakdown, budget status and recent activity.
- **Transactions** — expenses, income and transfers between accounts; grouped by day with daily net, month navigation, type and label filters, and search across notes, categories, labels and accounts. The entry form offers the four most-used categories as quick picks and reaches the rest by search.
- **Split bills** — groups of named people (they need no app or account) for a trip, flat or dinner. Add bills split equally, by amount or by shares; see who owes whom with debts simplified to the fewest payments; mark payments as paid; share a text summary to any chat app. Your own share can be added to your personal expenses automatically and stays in step with the bill. No limits, no ads; synced and backed up like everything else.
- **Labels** — free-form tags (`#vacation`, `#work-trip`) that cut across categories; add them while entering a transaction, filter Activity by them, manage them in Settings.
- **Budgets** — monthly limit per category with progress, amount left, over-budget warnings and a suggested daily allowance for the rest of the month.
- **Reports** — swipe left or right (or use the arrows) to change month; six-month income vs. expense trend, net cash flow, savings rate, needs / wants / savings & debt as a share of income against the 50/30/20 guide, and a per-category breakdown. Tap a category for its details: month total vs. the previous month, budget progress, a six-month trend (tap a bar to jump to that month) and its dated transactions.
- **Accounts & categories** — create, edit, recolour; items with history are archived rather than deleted so past records stay intact.
- **Needs, wants and savings** — mark each expense category as a *need* (rent, groceries, bills), a *want* (dining out, shopping) or *savings & debt* (a loan EMI, a deposit); the category list groups them. Transfers into a savings-type account count as savings automatically. Reports compares each bucket with income against the 50/30/20 guide. The built-in categories come pre-sorted; new ones start as "Not sorted".
- **App lock** — optional Face ID / fingerprint / device passcode when the app opens; switching to another app and back within 5 minutes does not ask again, and the content is hidden while the app is in the background.
- **Cloud sync (optional)** — Google sign-in and two-way sync through Supabase: offline-first, last edit wins, deletions propagate, each user's rows private by row-level security; when both the device and the cloud already have data at sign-in, the user chooses cloud, device or merge; a user can delete all their cloud data from Settings. Setup: [docs/SYNC_SETUP.md](docs/SYNC_SETUP.md).
- **Fresh start** — *Erase all transactions* keeps accounts and categories; *Reset all data* returns everything to the defaults.
- **Backup and restore** — one file with everything (accounts and opening balances, categories, labels, transactions, budgets, currency and theme). Restoring validates the whole file first, then replaces all data in a single step; Settings shows when the last backup was made.
- **CSV export and import** — export all transactions via the system share sheet (formula-injection safe) and import the file back, on this or another device. Import is all-or-nothing, creates missing accounts, categories and labels, and skips rows that already exist, so importing the same file twice is harmless.
- **Light / dark / system theme**, locale-aware currency and date formatting, screen-reader labels and 48pt touch targets.

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Expo SDK 58, React Native 0.88, React 19 (React Compiler on) |
| Language | TypeScript 6, strict |
| Navigation | Expo Router (typed, file-based) — tabs + stack with modal forms |
| Storage | `expo-sqlite` with versioned migrations (`PRAGMA user_version`) |
| Sync | Supabase (Postgres + Google OAuth), `@supabase/supabase-js` |
| Dates | Bikram Sambat conversion via `nepali-date-converter` |
| Charts | `react-native-svg` (no chart library) |
| Icons | `expo-symbols` — SF Symbols on iOS, Material Symbols on Android/web |
| Tests | Jest (`jest-expo`) |
| Tooling | Yarn 1, Node 26 (`.nvmrc`), ESLint (`eslint-config-expo`) |

## Getting started

```bash
nvm use
```

```bash
yarn install
```

```bash
yarn start
```

Then press `i` (iOS simulator, needs Xcode), `a` (Android emulator, needs Android Studio) or `w` (web), or scan the QR code with a development build.

The app uses native modules beyond Expo Go's guarantees (date picker, biometrics), so use a **development build** on devices:

```bash
npx expo run:ios
```

```bash
npx expo run:android
```

### Install on an Android phone without Android Studio

Build an installable APK in the cloud with EAS (free Expo account required):

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --platform android --profile preview
```

When the build finishes, open the link (or scan the QR code) on the phone, download the APK and allow installation from your browser. The `preview` profile in `eas.json` produces an APK; `production` produces an AAB for Google Play.

On first launch the Overview offers **Load sample data** — about three months of realistic activity for exploring charts and budgets. Remove it with *Settings → Erase all transactions*.

## Scripts

| Command | Purpose |
| --- | --- |
| `yarn start` / `yarn ios` / `yarn android` / `yarn web` | Run the dev server |
| `yarn typecheck` | `tsc --noEmit` |
| `yarn lint` | ESLint |
| `yarn test` | Unit tests |
| `yarn verify` | All three — run before every commit |

## Project structure

```
src/
  app/                 Routes (Expo Router). Screens only — no business logic.
    (tabs)/            Home, Activity, Budgets, Reports, Settings
    transaction.tsx    Add / edit transaction (modal)
    budget.tsx, category.tsx, account.tsx, categories.tsx, accounts.tsx, labels.tsx
    category-report.tsx  Category details opened from Reports
    split*.tsx           Split bills: groups, group detail, group editor, bill/payment form
  components/
    ui/                Design-system primitives (Text, Card, Button, Icon, ...)
    charts.tsx         Donut and bar charts
    widgets.tsx        Feature widgets shared across screens
    app-lock.tsx       Biometric lock gate
  db/
    migrations.ts      Schema, append-only migrations
    repositories.ts    Every SQL statement in the app
    store.ts           useQuery + change notification
    sync-store.ts      Sync bookkeeping: unsent changes, applying downloads
    split-repositories.ts  Split-bill queries
    seed.ts            Default categories/accounts and sample data
    types.ts           Domain types
  sync/                Supabase client, Google sign-in, sync engine and provider
  lib/                 Pure helpers: money, dates, csv, export (unit tested)
  providers/           Settings + theme context
  theme/tokens.ts      Colours, spacing, radii, typography
```

## Architecture notes

- **Money is integer minor units** (cents). Floats never touch an amount; parsing and formatting live in `src/lib/money.ts`.
- **Dates are local calendar days** stored as `YYYY-MM-DD` text, so a transaction never shifts day when the time zone changes.
- **Balances are derived**, not stored: opening balance + ledger, computed in SQL. They cannot drift.
- **Sync is layered on, not built in**: SQLite triggers stamp every change and record deletions, so no query had to learn about sync; a round downloads, resolves conflicts locally (last edit wins), then uploads.
- **Reactivity**: writes call `notifyDataChanged()`; every `useQuery` re-runs. Simple and sufficient for a local database.
- **Single currency**: changing the currency relabels amounts; it does not convert them.
- **Two file formats, two jobs**: the JSON backup is a complete, exact copy and restoring it *replaces* everything; the CSV carries transactions only (no opening balances, budgets, colours or icons) and importing it *adds* to what is there. Use the backup to move or recover the app, the CSV for spreadsheets.

## Releasing

Before a store release: set your own `ios.bundleIdentifier` / `android.package` in `app.json`, replace the placeholder icons and splash in `assets/`, then build and submit with EAS (`eas build`, `eas submit`).

## Roadmap

Shared split groups that friends can join and edit, recurring transactions, budget alerts, label and category drill-down in reports, receipt photos, multi-currency with exchange rates, end-to-end encryption for synced data, home-screen widgets, localisation.
