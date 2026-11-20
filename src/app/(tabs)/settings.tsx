import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { authenticate, canUseAppLock } from '@/components/app-lock';
import { Card, Chip, Divider, ListRow, Screen, SectionHeader, Segmented, Text } from '@/components/ui/primitives';
import { confirmDestructive, notify } from '@/components/widgets';
import { clearLedger, countTransactions, importTransactions, resetAllData, restoreBackupData } from '@/db/repositories';
import { useQuery } from '@/db/store';
import { parseBackup } from '@/lib/backup';
import { exportBackup, exportTransactionsCsv } from '@/lib/export';
import { parseTransactionsCsv } from '@/lib/import';
import { pickTextFile } from '@/lib/pick-file';
import { useSettings, type ThemePreference } from '@/providers/settings';
import { useSync } from '@/sync/provider';
import { space } from '@/theme/tokens';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const CURRENCIES = ['NPR', 'INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'SGD', 'AED', 'QAR', 'SAR', 'MYR', 'KRW', 'CHF', 'NZD'];

const CALENDARS = [
  { value: 'ad', label: 'AD (Gregorian)' },
  { value: 'bs', label: 'BS (Bikram Sambat)' },
] as const;

const NUMBER_STYLES = [
  { value: 'lakh', label: '1,00,000' },
  { value: 'international', label: '100,000' },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, currency, theme, appLock, lastBackupAt, resolvedNumberStyle, calendar, update } = useSettings();
  const sync = useSync();
  const [lockAvailable, setLockAvailable] = useState(false);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const { data: transactionCount = 0 } = useQuery(countTransactions);

  useEffect(() => {
    canUseAppLock().then(setLockAvailable);
  }, []);

  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  const toggleLock = async (next: boolean) => {
    // Require a successful check before changing the setting in either
    // direction, so the lock cannot be switched off by someone else.
    if (await authenticate(next ? 'Confirm to enable app lock' : 'Confirm to disable app lock')) {
      await update('appLock', next);
    }
  };

  const exportCsv = async () => {
    try {
      const count = await exportTransactionsCsv(db, currency);
      if (count === 0) notify('Nothing to export', 'Add a transaction first.');
    } catch (error) {
      notify('Export failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const signIn = async () => {
    try {
      await sync.signIn();
    } catch (error) {
      notify('Sign-in failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const signOut = async () => {
    const ok = await confirmDestructive(
      'Sign out?',
      'Your data stays on this device, but changes will no longer be synced until you sign in again.',
      'Sign out'
    );
    if (ok) await sync.signOut();
  };

  const chooseData = async (option: 'cloud' | 'device' | 'merge') => {
    const choice = sync.choice;
    if (!choice) return;
    const plural = (n: number) => `${n} transaction${n === 1 ? '' : 's'}`;
    const confirmations = {
      cloud: [
        'Use cloud data?',
        `This device's data (${plural(choice.localTransactions)}, plus its accounts, categories, labels and budgets) will be deleted and replaced with the data in your cloud account (${plural(choice.cloudTransactions)}). This cannot be undone.`,
        'Use cloud data',
      ],
      device: [
        "Use this device's data?",
        `The data in your cloud account (${plural(choice.cloudTransactions)}) will be deleted and replaced with this device's data (${plural(choice.localTransactions)}). Your other signed-in devices will switch to this data too. This cannot be undone.`,
        "Use this device's data",
      ],
      merge: [
        'Merge both?',
        'Everything from this device and from the cloud will be kept and combined. Transactions recorded on both may appear twice. This cannot be undone.',
        'Merge',
      ],
    } as const;
    const [title, message, label] = confirmations[option];
    if (!(await confirmDestructive(title, message, label))) return;
    try {
      await sync.resolveChoice(option);
    } catch (error) {
      notify('Sync failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const deleteCloudData = async () => {
    const ok = await confirmDestructive(
      'Delete all cloud data?',
      `This permanently deletes everything stored in the cloud for ${sync.email ?? 'your account'}: accounts, categories, labels, transactions and budgets. ` +
        'Data on this phone is kept, and this device will be signed out. ' +
        'Other devices keep their own copies; sign out on them too, or their next changes will be uploaded again. This cannot be undone.',
      'Delete'
    );
    if (!ok) return;
    try {
      const removed = await sync.deleteCloudData();
      notify('Cloud data deleted', `${removed} record${removed === 1 ? '' : 's'} removed from the cloud. Your data on this phone is unchanged.`);
    } catch (error) {
      notify('Could not delete cloud data', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmDestructive(
      'Delete your account?',
      `This permanently deletes the account ${sync.email ?? ''} and everything stored in the cloud for it. ` +
        'Data on this phone is kept, and this device will be signed out. You can create a new account later by signing in again. This cannot be undone.',
      'Delete account'
    );
    if (!ok) return;
    try {
      await sync.deleteAccount();
      notify('Account deleted', 'Your account and its cloud data have been deleted. Your data on this phone is unchanged.');
    } catch (error) {
      notify('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const syncSubtitle =
    sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'error'
        ? `Sync problem: ${sync.error ?? 'unknown error'}`
        : sync.lastSyncedAt
          ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'Not synced yet';

  const backUp = async () => {
    try {
      await exportBackup(db, currency, theme);
      await update('lastBackupAt', new Date().toISOString());
    } catch (error) {
      notify('Backup failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const restore = async () => {
    try {
      const text = await pickTextFile('json');
      if (text === null) return;
      const parsed = parseBackup(text);
      if ('error' in parsed) return notify('Nothing was restored', parsed.error);

      const { backup } = parsed;
      const made = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'an unknown date';
      const incoming = backup.data.transactions.length;
      const ok = await confirmDestructive(
        'Replace everything with this backup?',
        `The backup from ${made} holds ${incoming} transaction${incoming === 1 ? '' : 's'}. ` +
          `Everything now in the app, including ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}, ` +
          'will be deleted and replaced. This cannot be undone.',
        'Replace'
      );
      if (!ok) return;

      await restoreBackupData(db, backup.data);
      await update('currency', backup.currency);
      await update('theme', backup.theme);
      notify('Restore finished', `${incoming} transaction${incoming === 1 ? '' : 's'} restored.`);
    } catch (error) {
      notify('Restore failed', error instanceof Error ? error.message : 'Nothing was changed. Please try again.');
    }
  };

  const importCsv = async () => {
    try {
      const text = await pickTextFile('csv');
      if (text === null) return;
      const { rows, errors } = parseTransactionsCsv(text, currency);
      if (errors.length > 0) {
        // All-or-nothing: a file with any bad row changes nothing.
        const shown = errors.slice(0, 4).join('\n');
        const more = errors.length > 4 ? `\n…and ${errors.length - 4} more.` : '';
        return notify('Nothing was imported', `${shown}${more}`);
      }
      const summary = await importTransactions(db, rows);
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
      const created = [
        summary.accountsCreated ? plural(summary.accountsCreated, 'account') : '',
        summary.categoriesCreated
          ? `${summary.categoriesCreated} categor${summary.categoriesCreated === 1 ? 'y' : 'ies'}`
          : '',
        summary.labelsCreated ? plural(summary.labelsCreated, 'label') : '',
      ].filter(Boolean);
      notify(
        'Import finished',
        [
          `${plural(summary.imported, 'transaction')} imported.`,
          summary.duplicates ? `${plural(summary.duplicates, 'duplicate')} skipped.` : '',
          created.length ? `Created ${created.join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    } catch (error) {
      notify('Import failed', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const eraseData = async () => {
    const ok = await confirmDestructive(
      'Erase all transactions?',
      `This permanently deletes ${transactionCount} transaction${transactionCount === 1 ? '' : 's'} and all budgets. Accounts, categories and labels are kept, and account balances go back to their opening balances. This cannot be undone.`,
      'Erase'
    );
    if (ok) await clearLedger(db);
  };

  const resetEverything = async () => {
    const ok = await confirmDestructive(
      'Reset all data?',
      'This permanently deletes all accounts, categories, labels, budgets and transactions, and starts again with the default accounts and categories. ' +
        'Your settings and sign-in are kept.' +
        (sync.email ? ' Because cloud sync is on, the same data is also removed from your other devices.' : '') +
        ' This cannot be undone.',
      'Reset'
    );
    if (ok) await resetAllData(db);
  };

  return (
    <Screen padTop>
      <Text variant="title" accessibilityRole="header">
        Settings
      </Text>

      <SectionHeader title="Manage" />
      <Card style={{ gap: space.sm }}>
        <ListRow icon="wallet" title="Accounts" subtitle="Cash, bank, cards and wallets" onPress={() => router.push('/accounts')} />
        <Divider />
        <ListRow icon="category" title="Categories" subtitle="Organise income and spending" onPress={() => router.push('/categories')} />
        <Divider />
        <ListRow icon="tag" title="Labels" subtitle="Tag transactions across categories" onPress={() => router.push('/labels')} />
      </Card>

      <SectionHeader title="Preferences" />
      <Card>
        <ListRow
          icon="currency"
          title="Currency"
          value={currency}
          onPress={() => setPickingCurrency((prev) => !prev)}
        />
        {pickingCurrency ? (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {currencies.map((code) => (
                <Chip
                  key={code}
                  label={code}
                  selected={code === currency}
                  onPress={() => {
                    update('currency', code);
                    setPickingCurrency(false);
                  }}
                />
              ))}
            </View>
            <Text variant="caption" color="textSecondary">
              Changing currency relabels amounts; it does not convert them.
            </Text>
          </View>
        ) : null}
        <Divider />
        <ListRow icon="calendar" title="Calendar" subtitle="Months and dates in AD or Bikram Sambat" />
        <Segmented options={CALENDARS} value={calendar} onChange={(value) => update('calendar', value)} />
        <Divider />
        <ListRow icon="chart" title="Number style" subtitle="How large amounts are grouped" />
        <Segmented options={NUMBER_STYLES} value={resolvedNumberStyle} onChange={(value) => update('numberStyle', value)} />
        <Divider />
        <ListRow icon="palette" title="Appearance" />
        <Segmented options={THEMES} value={theme} onChange={(value) => update('theme', value)} />
      </Card>

      <SectionHeader title="Cloud sync" />
      <Card style={{ gap: space.sm }}>
        {!sync.configured ? (
          <ListRow
            icon="cloud"
            title="Not set up"
            subtitle="This build has no sync server configured. See docs/SYNC_SETUP.md."
          />
        ) : sync.email === null ? (
          <ListRow
            icon="cloud"
            title="Sign in with Google"
            subtitle="Keep your data backed up and in step across your devices"
            onPress={signIn}
          />
        ) : (
          <>
            <ListRow icon="cloud" title={sync.email} subtitle={syncSubtitle} />
            {sync.choice ? (
              <>
                <Divider />
                <ListRow
                  icon="warning"
                  iconColor={colors.warning}
                  title="Choose which data to keep"
                  subtitle={`This device has ${sync.choice.localTransactions} transactions and your cloud account has ${sync.choice.cloudTransactions}. Sync is paused until you choose.`}
                />
                <Divider />
                <ListRow
                  icon="cloud"
                  title="Use cloud data"
                  subtitle="Replace this device's data with the cloud's"
                  onPress={() => chooseData('cloud')}
                />
                <Divider />
                <ListRow
                  icon="phone"
                  title="Use this device's data"
                  subtitle="Replace the cloud's data with this device's"
                  onPress={() => chooseData('device')}
                />
                <Divider />
                <ListRow
                  icon="sync"
                  title="Merge both"
                  subtitle="Keep everything; some transactions may appear twice"
                  onPress={() => chooseData('merge')}
                />
              </>
            ) : (
              <>
                <Divider />
                <ListRow icon="sync" title="Sync now" onPress={sync.syncNow} />
              </>
            )}
            <Divider />
            <ListRow icon="logout" title="Sign out" onPress={signOut} />
            <Divider />
            <ListRow
              icon="delete"
              title="Delete cloud data"
              subtitle="Remove everything stored online for this account"
              destructive
              onPress={deleteCloudData}
            />
            <Divider />
            <ListRow
              icon="delete"
              title="Delete account"
              subtitle="Delete your sign-in account and all its cloud data"
              destructive
              onPress={deleteAccount}
            />
          </>
        )}
      </Card>

      <SectionHeader title="Backup" />
      <Card style={{ gap: space.sm }}>
        <ListRow
          icon="backup"
          title="Back up everything"
          subtitle={
            lastBackupAt
              ? `Last backup ${new Date(lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'Never backed up — your data exists only on this device'
          }
          onPress={backUp}
        />
        <Divider />
        <ListRow
          icon="restore"
          title="Restore from backup"
          subtitle="Replaces everything in the app with a backup file"
          onPress={restore}
        />
      </Card>

      <SectionHeader title="Privacy & data" />
      <Card style={{ gap: space.sm }}>
        <ListRow
          icon="lock"
          title="App lock"
          subtitle={
            lockAvailable
              ? 'Ask for Face ID, fingerprint or passcode when opening. Stays unlocked for 5 minutes after you switch apps'
              : 'Set up biometrics or a passcode on this device to use app lock'
          }
          trailing={
            <Switch
              value={appLock}
              disabled={!lockAvailable}
              onValueChange={toggleLock}
              trackColor={{ true: colors.primary }}
              accessibilityLabel="App lock"
            />
          }
        />
        <Divider />
        <ListRow icon="download" title="Export to CSV" subtitle="Share or save all transactions" onPress={exportCsv} />
        <Divider />
        <ListRow icon="upload" title="Import from CSV" subtitle="Restore a file exported from this app" onPress={importCsv} />
        <Divider />
        <ListRow
          icon="delete"
          title="Erase all transactions"
          subtitle="Keeps accounts, categories and labels"
          destructive
          onPress={eraseData}
        />
        <Divider />
        <ListRow
          icon="delete"
          title="Reset all data"
          subtitle="Start fresh with the default accounts and categories"
          destructive
          onPress={resetEverything}
        />
      </Card>

      <Text variant="caption" color="textTertiary" center>
        Mero Paisa {Constants.expoConfig?.version ?? ''} ·{' '}
        {sync.email ? 'Synced to your account' : 'Your data stays on this device'}
      </Text>
    </Screen>
  );
}
