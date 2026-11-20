import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Button, Chip, Field, Input, Screen, Segmented, Text, hapticSuccess } from '@/components/ui/primitives';
import { confirmDestructive } from '@/components/widgets';
import {
  MAX_LABEL_LENGTH,
  createLabel,
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategoriesByUsage,
  listLabels,
  saveTransaction,
  validateTransaction,
} from '@/db/repositories';
import { useQuery } from '@/db/store';
import type { TransactionType } from '@/db/types';
import { splitCategories } from '@/lib/categories';
import { today } from '@/lib/dates';
import { parseAmount, toInputString } from '@/lib/money';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

export default function TransactionScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, currency } = useSettings();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : undefined;

  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [occurredOn, setOccurredOn] = useState(today());
  const [note, setNote] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(id === undefined);

  const { data: lists } = useQuery(async (database) => {
    const [accounts, categories, labels] = await Promise.all([
      listAccounts(database),
      listCategoriesByUsage(database),
      listLabels(database),
    ]);
    return { accounts, categories, labels };
  });

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    getTransaction(db, id).then((existing) => {
      if (cancelled) return;
      if (existing) {
        setType(existing.type);
        setAmountText(toInputString(existing.amount, currency));
        setCategoryId(existing.categoryId);
        setAccountId(existing.accountId);
        setToAccountId(existing.toAccountId);
        setOccurredOn(existing.occurredOn);
        setNote(existing.note);
        setLabelIds(existing.labels.map((label) => label.id));
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // Load once per transaction; later currency changes must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id]);

  const accounts = lists?.accounts ?? [];
  const labels = lists?.labels ?? [];
  // Most-used first: four quick picks, everything else is reached by search.
  const categoryPicker = splitCategories(
    (lists?.categories ?? []).filter((c) => c.kind === type),
    categoryId,
    categoryQuery
  );
  // Default to the first account so the most common entry needs no extra tap.
  const effectiveAccountId = accountId ?? accounts[0]?.id ?? null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const changeType = (next: TransactionType) => {
    setType(next);
    setCategoryId(null);
    setCategoryQuery('');
    setError(null);
  };

  const toggleLabel = (labelId: number) =>
    setLabelIds((prev) => (prev.includes(labelId) ? prev.filter((x) => x !== labelId) : [...prev, labelId]));

  const addLabel = async () => {
    if (!newLabel.trim()) return;
    try {
      const label = await createLabel(db, newLabel);
      setLabelIds((prev) => (prev.includes(label.id) ? prev : [...prev, label.id]));
      setNewLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the label.');
    }
  };

  const save = async () => {
    const amount = parseAmount(amountText, currency);
    if (amount === null || effectiveAccountId === null) {
      setError(amount === null ? 'Enter a valid amount.' : 'Create an account first.');
      return;
    }
    const input = {
      type,
      amount,
      accountId: effectiveAccountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'transfer' ? null : categoryId,
      note,
      occurredOn,
      labelIds,
    };
    const problem = validateTransaction(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await saveTransaction(db, input, id);
      hapticSuccess();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id === undefined) return;
    if (await confirmDestructive('Delete transaction?', 'This cannot be undone.', 'Delete')) {
      await deleteTransaction(db, id);
      close();
    }
  };

  const amountColor = type === 'income' ? colors.income : type === 'expense' ? colors.expense : colors.text;

  return (
    // The shared Screen keeps the focused field above the keyboard (see components/keyboard).
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: id === undefined ? 'New transaction' : 'Edit transaction' }} />
      {ready && lists ? (
        <Screen>
          <Segmented options={TYPES} value={type} onChange={changeType} />

          <View style={styles.amount}>
            <Text variant="label" color="textSecondary">
              Amount ({currency})
            </Text>
            <TextInput
              value={amountText}
              onChangeText={(text) => {
                setAmountText(text.replace(',', '.'));
                setError(null);
              }}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              autoFocus={id === undefined}
              selectTextOnFocus
              accessibilityLabel="Amount"
              style={[styles.amountInput, { color: amountColor }]}
            />
          </View>

          {type === 'transfer' ? null : (
            <Field label="Category">
              <View style={styles.chips}>
                {categoryPicker.quick.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    icon={category.icon}
                    tint={category.color}
                    selected={category.id === categoryId}
                    onPress={() => {
                      setCategoryId(category.id);
                      setError(null);
                    }}
                  />
                ))}
              </View>
              {categoryPicker.hasMore ? (
                <Input
                  value={categoryQuery}
                  onChangeText={setCategoryQuery}
                  placeholder="Search other categories"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                  accessibilityLabel="Search other categories"
                />
              ) : null}
              {categoryPicker.matches.length > 0 ? (
                <View style={styles.chips}>
                  {categoryPicker.matches.map((category) => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      icon={category.icon}
                      tint={category.color}
                      selected={false}
                      onPress={() => {
                        setCategoryId(category.id);
                        setCategoryQuery('');
                        setError(null);
                      }}
                    />
                  ))}
                </View>
              ) : categoryQuery.trim() ? (
                <Text variant="caption" color="textSecondary">
                  No other category matches “{categoryQuery.trim()}”. Add one in Settings → Categories.
                </Text>
              ) : null}
            </Field>
          )}

          <Field label={type === 'transfer' ? 'From account' : 'Account'}>
            <View style={styles.chips}>
              {accounts.map((account) => (
                <Chip
                  key={account.id}
                  label={account.name}
                  icon={account.icon}
                  tint={account.color}
                  selected={account.id === effectiveAccountId}
                  onPress={() => {
                    setAccountId(account.id);
                    if (toAccountId === account.id) setToAccountId(null);
                  }}
                />
              ))}
            </View>
          </Field>

          {type === 'transfer' ? (
            <Field label="To account">
              <View style={styles.chips}>
                {accounts
                  .filter((account) => account.id !== effectiveAccountId)
                  .map((account) => (
                    <Chip
                      key={account.id}
                      label={account.name}
                      icon={account.icon}
                      tint={account.color}
                      selected={account.id === toAccountId}
                      onPress={() => {
                        setToAccountId(account.id);
                        setError(null);
                      }}
                    />
                  ))}
              </View>
              {accounts.length < 2 ? (
                <Text variant="caption" color="textSecondary">
                  Add a second account in Settings to record transfers.
                </Text>
              ) : null}
            </Field>
          ) : null}

          <Field label="Date">
            <DateField value={occurredOn} onChange={setOccurredOn} />
          </Field>

          <Field label="Labels (optional)">
            {labels.length > 0 ? (
              <View style={styles.chips}>
                {labels.map((label) => (
                  <Chip
                    key={label.id}
                    label={`#${label.name}`}
                    tint={label.color}
                    selected={labelIds.includes(label.id)}
                    onPress={() => toggleLabel(label.id)}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.labelRow}>
              <Input
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="New label, e.g. vacation"
                maxLength={MAX_LABEL_LENGTH}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={addLabel}
                accessibilityLabel="New label"
                style={{ flex: 1 }}
              />
              <Button title="Add" variant="secondary" disabled={!newLabel.trim()} onPress={addLabel} />
            </View>
          </Field>

          <Field label="Note (optional)" error={error}>
            <Input value={note} onChangeText={setNote} placeholder="What was it for?" maxLength={140} returnKeyType="done" />
          </Field>

          <Button title={id === undefined ? 'Save transaction' : 'Save changes'} icon="check" loading={saving} onPress={save} />
          {id !== undefined ? <Button title="Delete" icon="delete" variant="danger" onPress={remove} /> : null}
        </Screen>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
  // Explicit height and no lineHeight: a large font in an auto-sized TextInput
  // gets its digits clipped on Android.
  amountInput: {
    alignSelf: 'stretch',
    height: 72,
    padding: 0,
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
