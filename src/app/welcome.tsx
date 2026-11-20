import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Field, Input, Screen, Segmented, Text, hapticSuccess } from '@/components/ui/primitives';
import { listAccounts, saveAccount } from '@/db/repositories';
import { useQuery } from '@/db/store';
import { addDays, formatDay, today, type CalendarSystem } from '@/lib/dates';
import { defaultNumberStyle, formatMoney, parseAmount } from '@/lib/money';
import { useSettings } from '@/providers/settings';
import { useSync } from '@/sync/provider';
import { radius, space } from '@/theme/tokens';

/** Offered first: the app is made for Nepal, then the most common currencies of Nepalis abroad. */
const CURRENCIES = ['NPR', 'INR', 'USD', 'AUD', 'GBP', 'EUR', 'AED', 'QAR', 'SAR', 'MYR', 'KRW', 'JPY'];

/**
 * First-run setup: pick a currency and, optionally, what is in each account
 * today. Shown once; existing installs with data skip it (see SettingsProvider).
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, update } = useSettings();
  const sync = useSync();
  const { data: accounts = [] } = useQuery((database) => listAccounts(database));

  const [currency, setCurrency] = useState('NPR');
  const [calendar, setCalendar] = useState<CalendarSystem>('ad');
  const [balances, setBalances] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    // Validate every balance before saving anything.
    const parsed = new Map<number, number>();
    for (const account of accounts) {
      const text = balances[account.id]?.trim() ?? '';
      if (!text) continue;
      const amount = parseAmount(text, currency);
      if (amount === null) return setError(`Enter a valid amount for ${account.name}.`);
      parsed.set(account.id, amount);
    }
    setSaving(true);
    try {
      await update('currency', currency);
      await update('calendar', calendar);
      for (const account of accounts) {
        const amount = parsed.get(account.id);
        if (amount !== undefined) await saveAccount(db, { ...account, openingBalance: amount }, account.id);
      }
      await update('onboarded', true);
      hapticSuccess();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  /** Someone already using Mero Paisa elsewhere: their currency and data come from the cloud. */
  const signInInstead = async () => {
    await update('onboarded', true);
    router.replace('/settings');
    try {
      await sync.signIn();
    } catch {
      // Settings shows the sign-in option again; nothing else to undo.
    }
  };

  const example = formatMoney(10000000, currency, { style: defaultNumberStyle(currency) });

  return (
    <Screen padTop>
      <View style={styles.hero}>
        <Image source={require('@/assets/images/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text variant="title" center accessibilityRole="header">
          Welcome to Mero Paisa
        </Text>
        <Text color="textSecondary" center>
          Your money, your way. Two quick choices and you are ready.
        </Text>
      </View>

      <Card>
        <Field label="Your currency">
          <View style={styles.chips}>
            {CURRENCIES.map((code) => (
              <Chip key={code} label={code} selected={code === currency} onPress={() => setCurrency(code)} />
            ))}
          </View>
          <Text variant="caption" color="textSecondary">
            Amounts will look like {example}. You can change this later in Settings.
          </Text>
        </Field>
      </Card>

      <Card>
        <Field label="Your calendar">
          <Segmented
            options={[
              { value: 'ad', label: 'AD (Gregorian)' },
              { value: 'bs', label: 'BS (Bikram Sambat)' },
            ]}
            value={calendar}
            onChange={setCalendar}
          />
          <Text variant="caption" color="textSecondary">
            Months and budgets follow this calendar. In {calendar === 'bs' ? 'BS' : 'AD'}, a date looks like{' '}
            {formatDay(addDays(today(), -7), calendar)}.
          </Text>
        </Field>
      </Card>

      <Card>
        <Field label="How much is in each account today? (optional)" error={error}>
          {accounts.map((account) => (
            <View key={account.id} style={styles.balanceRow}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {account.name}
              </Text>
              <Input
                value={balances[account.id] ?? ''}
                onChangeText={(text) => {
                  setBalances((prev) => ({ ...prev, [account.id]: text.replace(',', '.') }));
                  setError(null);
                }}
                placeholder="0"
                keyboardType="decimal-pad"
                accessibilityLabel={`Starting balance for ${account.name}`}
                style={{ width: 160, textAlign: 'right' }}
              />
            </View>
          ))}
          <Text variant="caption" color="textSecondary">
            Leave empty to start from zero. Add more accounts any time in Settings.
          </Text>
        </Field>
      </Card>

      <Button title="Get started" loading={saving} onPress={finish} />
      {sync.configured ? (
        <Button title="I already use Mero Paisa: sign in" variant="ghost" onPress={signInInstead} />
      ) : null}
      <View style={[styles.footer, { borderColor: colors.border }]}>
        <Text variant="caption" color="textTertiary" center>
          Your data stays on this phone unless you turn on sync.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xl },
  logo: { width: 88, height: 88, borderRadius: radius.xl, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: { paddingTop: space.md },
});
