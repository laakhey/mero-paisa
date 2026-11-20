import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Icon } from '@/components/ui/icon';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Screen,
  Segmented,
  Text,
  hapticSuccess,
  hapticTap,
} from '@/components/ui/primitives';
import { confirmDestructive } from '@/components/widgets';
import { listAccounts, listCategoriesByUsage } from '@/db/repositories';
import {
  deleteSplitExpense,
  getLinkedTransaction,
  getSplitExpense,
  getSplitGroup,
  saveSplitExpense,
  type SplitExpenseKind,
} from '@/db/split-repositories';
import { useQuery } from '@/db/store';
import { today } from '@/lib/dates';
import { parseAmount, toInputString } from '@/lib/money';
import { computeShares, type SplitMethod } from '@/lib/split';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

const METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'By amount' },
  { value: 'shares', label: 'By shares' },
];

export default function SplitExpenseScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, currency, money } = useSettings();
  const params = useLocalSearchParams<{ groupId: string; id?: string; kind?: SplitExpenseKind }>();
  const groupId = Number(params.groupId);
  const id = params.id ? Number(params.id) : undefined;

  const [kind, setKind] = useState<SplitExpenseKind>(
    params.kind === 'settlement' ? 'settlement' : 'expense'
  );
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<number | null>(null);
  const [occurredOn, setOccurredOn] = useState(today());
  const [method, setMethod] = useState<SplitMethod>('equal');
  // Who takes part, and what they typed for "by amount" / "by shares".
  // null until the user (or a loaded bill) decides: then the default applies, see `excluded` below.
  const [selection, setSelection] = useState<Set<number> | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [addToMine, setAddToMine] = useState(true);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(id === undefined);

  const { data } = useQuery(
    async (database) => {
      const [detail, accounts, categories] = await Promise.all([
        getSplitGroup(database, groupId),
        listAccounts(database),
        listCategoriesByUsage(database),
      ]);
      return { detail, accounts, categories: categories.filter((c) => c.kind === 'expense') };
    },
    [groupId]
  );

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    (async () => {
      const expense = await getSplitExpense(db, id);
      const detail = await getSplitGroup(db, groupId);
      if (cancelled || !expense || !detail) return setReady(true);
      setKind(expense.kind);
      setDescription(expense.description);
      setAmountText(toInputString(expense.amount, currency));
      setPaidBy(expense.paidBy);
      setOccurredOn(expense.occurredOn);
      setMethod(expense.splitMethod);
      const inBill = new Set(expense.shares.map((s) => s.memberId));
      setSelection(new Set(detail.members.filter((m) => !inBill.has(m.id)).map((m) => m.id)));
      setValues(
        Object.fromEntries(
          expense.shares.map((s) => [
            s.memberId,
            expense.splitMethod === 'shares'
              ? String(s.weight ?? 1)
              : toInputString(s.amount, currency),
          ])
        )
      );
      const linked = expense.transactionId
        ? await getLinkedTransaction(db, expense.transactionId)
        : null;
      if (cancelled) return;
      setAddToMine(linked !== null);
      if (linked) {
        setCategoryId(linked.categoryId);
        setAccountId(linked.accountId);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Load once per bill; later currency changes must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, groupId]);

  if (!data || !ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const { detail, accounts, categories } = data;
  if (!detail) return <Screen />;

  const members = detail.members;
  const me = members.find((m) => m.isMe);
  const payer = paidBy ?? me?.id ?? members[0]?.id ?? null;
  const amount = parseAmount(amountText, currency);
  const settlement = kind === 'settlement';
  const effectiveAccount = accountId ?? accounts[0]?.id ?? null;
  const effectiveCategory = categoryId ?? categories[0]?.id ?? null;

  // Live split, so each person's amount shows as you type.
  // A bill is usually for everyone, so all start ticked; a payment goes to
  // specific people, so none do. The payer can never receive their own payment.
  const candidates = settlement ? members.filter((m) => m.id !== payer) : members;
  const excluded =
    selection ?? new Set(settlement && id === undefined ? members.map((m) => m.id) : []);
  const included = candidates.filter((m) => !excluded.has(m.id));
  const inputs = included.map((m) => {
    const text = values[m.id]?.trim() ?? '';
    if (method === 'exact')
      return { memberId: m.id, value: text === '' ? 0 : (parseAmount(text, currency) ?? -1) };
    if (method === 'shares')
      return { memberId: m.id, value: text === '' ? 1 : Number(text.replace(',', '.')) };
    return { memberId: m.id };
  });
  const result = amount === null ? null : computeShares(amount, method, inputs);
  const shares = Array.isArray(result) ? result : null;
  const allIn = included.length === candidates.length;
  const shareOf = (memberId: number) => shares?.find((s) => s.memberId === memberId)?.amount ?? 0;
  const myShare = me ? shareOf(me.id) : 0;
  const exactLeft =
    method === 'exact' && amount !== null
      ? amount - inputs.reduce((sum, i) => sum + Math.max(0, i.value ?? 0), 0)
      : 0;

  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/split-group', params: { id: groupId } });

  const save = async () => {
    if (amount === null || amount <= 0) return setError('Enter a valid amount.');
    if (payer === null) return setError('Choose who paid.');
    if (settlement && included.length === 0) return setError('Tick who received the payment.');
    if (typeof result === 'string') return setError(result);
    if (!shares) return setError('Enter a valid amount.');
    if (!settlement && !description.trim()) return setError('Say what the bill was for.');
    const finalShares: { memberId: number; amount: number; weight?: number | null }[] = shares.map(
      (s) => ({
        ...s,
        weight:
          method === 'shares' ? (inputs.find((i) => i.memberId === s.memberId)?.value ?? 1) : null,
      })
    );
    const personal =
      !settlement &&
      addToMine &&
      myShare > 0 &&
      effectiveCategory !== null &&
      effectiveAccount !== null
        ? { categoryId: effectiveCategory, accountId: effectiveAccount }
        : null;
    setSaving(true);
    try {
      await saveSplitExpense(
        db,
        {
          groupId,
          kind,
          description,
          amount,
          paidBy: payer,
          occurredOn,
          splitMethod: method,
          shares: finalShares,
          personal,
        },
        id
      );
      hapticSuccess();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id === undefined) return;
    const ok = await confirmDestructive(
      settlement ? 'Delete this payment?' : 'Delete this bill?',
      settlement
        ? 'Balances will go back to what they were before it. This cannot be undone.'
        : 'It is removed from the group, and your share is removed from your own expenses. This cannot be undone.',
      'Delete'
    );
    if (!ok) return;
    await deleteSplitExpense(db, id);
    close();
  };

  const clearError = () => setError(null);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: settlement
            ? id === undefined
              ? 'Record repayment'
              : 'Edit repayment'
            : id === undefined
              ? 'Add bill'
              : 'Edit bill',
        }}
      />
      <Screen>
        {settlement && id === undefined ? (
          <Card>
            <Text variant="bodyStrong">Paying someone back?</Text>
            <Text variant="caption" color="textSecondary">
              Use this when money changes hands to settle a debt, for example Sita gives you what
              she owes. The payer is not one of the receivers.
            </Text>
            <Text variant="caption" color="textSecondary">
              Paid for something shared, like dinner or a taxi, that includes you? That is a bill.
            </Text>
            <Button
              title="Split a shared cost instead"
              variant="secondary"
              onPress={() => {
                // Keep what was typed; a bill starts with everyone ticked, the payer included.
                setKind('expense');
                setSelection(null);
                clearError();
              }}
            />
          </Card>
        ) : null}
        {settlement ? null : (
          <Field label="What was it for?">
            <Input
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                clearError();
              }}
              placeholder="e.g. Dinner, Taxi, Hotel"
              maxLength={60}
              autoFocus={id === undefined}
            />
          </Field>
        )}

        <View style={styles.amount}>
          <Text variant="label" color="textSecondary">
            {settlement ? 'Amount paid' : 'Total'} ({currency})
          </Text>
          <TextInput
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text.replace(',', '.'));
              clearError();
            }}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel="Amount"
            style={[styles.amountInput, { color: colors.text }]}
          />
        </View>

        <Field label={settlement ? 'Who paid back?' : 'Paid by'}>
          <View style={styles.chips}>
            {members.map((member) => (
              <Chip
                key={member.id}
                label={member.name}
                icon="person"
                selected={member.id === payer}
                onPress={() => {
                  setPaidBy(member.id);
                  clearError();
                }}
              />
            ))}
          </View>
        </Field>

        {
          <Field label={settlement ? 'Who received the money?' : 'Split between'}>
            <Segmented
              options={METHODS}
              value={method}
              onChange={(next) => {
                setMethod(next);
                setValues({});
                clearError();
              }}
            />
            <Card style={{ gap: space.xs }}>
              <View style={styles.memberRow}>
                <Text
                  variant="label"
                  color="textSecondary"
                  style={{ flex: 1 }}
                  accessibilityLiveRegion="polite">
                  {settlement ? 'Paid to' : 'Split between'} {included.length} of{' '}
                  {candidates.length} {candidates.length === 1 ? 'person' : 'people'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => {
                    hapticTap();
                    // Everyone already in: the same button clears the selection instead.
                    setSelection(allIn ? new Set(members.map((m) => m.id)) : new Set());
                    clearError();
                  }}>
                  <Text variant="label" color="primary">
                    {allIn ? 'Clear all' : 'Select all'}
                  </Text>
                </Pressable>
              </View>
              {candidates.map((member) => {
                const isIn = !excluded.has(member.id);
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isIn }}
                      accessibilityLabel={member.name}
                      onPress={() => {
                        hapticTap();
                        const next = new Set(excluded);
                        if (next.has(member.id)) next.delete(member.id);
                        else next.add(member.id);
                        setSelection(next);
                        clearError();
                      }}
                      style={({ pressed }) => [styles.checkRow, { opacity: pressed ? 0.6 : 1 }]}>
                      <Icon
                        name={isIn ? 'checkboxOn' : 'checkboxOff'}
                        size={24}
                        color={isIn ? colors.primary : colors.textTertiary}
                      />
                      <Text
                        variant="bodyStrong"
                        color={isIn ? 'text' : 'textTertiary'}
                        numberOfLines={1}
                        style={{ flex: 1 }}>
                        {member.name}
                      </Text>
                    </Pressable>
                    {isIn && method !== 'equal' ? (
                      <Input
                        value={values[member.id] ?? ''}
                        onChangeText={(text) => {
                          setValues((prev) => ({ ...prev, [member.id]: text.replace(',', '.') }));
                          clearError();
                        }}
                        placeholder={method === 'shares' ? '1' : '0'}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${method === 'shares' ? 'Shares' : 'Amount'} for ${member.name}`}
                        style={{ width: 96, textAlign: 'right' }}
                      />
                    ) : null}
                    {method !== 'exact' ? (
                      <Text
                        variant="label"
                        numeric
                        color={isIn ? 'text' : 'textTertiary'}
                        style={styles.shareAmount}>
                        {isIn && shares ? money(shareOf(member.id)) : '—'}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {method === 'exact' && amount !== null ? (
                <Text variant="caption" color={exactLeft === 0 ? 'income' : 'expense'} numeric>
                  {exactLeft === 0
                    ? 'The amounts add up.'
                    : exactLeft > 0
                      ? `${money(exactLeft)} left to assign`
                      : `${money(-exactLeft)} too much`}
                </Text>
              ) : null}
              {method === 'shares' ? (
                <Text variant="caption" color="textSecondary">
                  Give someone 2 shares to have them pay double, 0.5 for half.
                </Text>
              ) : null}
            </Card>
          </Field>
        }

        <Field label="Date" error={settlement ? error : null}>
          <DateField value={occurredOn} onChange={setOccurredOn} />
        </Field>

        {settlement ? null : (
          <Card>
            <View style={styles.memberRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">Add my share to my expenses</Text>
                <Text variant="caption" color="textSecondary">
                  {myShare > 0
                    ? `${money(myShare)} is recorded as your own expense, so budgets and reports stay right.`
                    : 'You have no share in this bill.'}
                </Text>
              </View>
              <Switch
                value={addToMine && myShare > 0}
                disabled={myShare === 0}
                onValueChange={setAddToMine}
                trackColor={{ true: colors.primary }}
                accessibilityLabel="Add my share to my expenses"
              />
            </View>
            {addToMine && myShare > 0 ? (
              <>
                <Field label="Category">
                  <View style={styles.chips}>
                    {categories.slice(0, 8).map((category) => (
                      <Chip
                        key={category.id}
                        label={category.name}
                        icon={category.icon}
                        tint={category.color}
                        selected={category.id === effectiveCategory}
                        onPress={() => setCategoryId(category.id)}
                      />
                    ))}
                  </View>
                </Field>
                <Field label="Account">
                  <View style={styles.chips}>
                    {accounts.map((account) => (
                      <Chip
                        key={account.id}
                        label={account.name}
                        icon={account.icon}
                        tint={account.color}
                        selected={account.id === effectiveAccount}
                        onPress={() => setAccountId(account.id)}
                      />
                    ))}
                  </View>
                </Field>
              </>
            ) : null}
          </Card>
        )}

        {!settlement && error ? (
          <Text variant="caption" color="expense" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button
          title={id === undefined ? 'Save' : 'Save changes'}
          icon="check"
          loading={saving}
          onPress={save}
        />
        {id !== undefined ? (
          <Button title="Delete" icon="delete" variant="danger" onPress={remove} />
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { alignItems: 'center', gap: space.xs },
  amountInput: {
    alignSelf: 'stretch',
    height: 64,
    padding: 0,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  shareAmount: { minWidth: 88, textAlign: 'right' },
});
