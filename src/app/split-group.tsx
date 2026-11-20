import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Platform, Pressable, Share, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  IconBadge,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui/primitives';
import { confirmDestructive, notify } from '@/components/widgets';
import { getSplitGroup, saveSplitExpense } from '@/db/split-repositories';
import { useQuery } from '@/db/store';
import { formatDay, today } from '@/lib/dates';
import { settleUp, type Transfer } from '@/lib/split';
import { groupSummaryText } from '@/lib/split-text';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

export default function SplitGroupScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, money } = useSettings();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const { data } = useQuery((database) => getSplitGroup(database, id), [id]);

  if (data === undefined) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (data === null) {
    return (
      <Screen>
        <EmptyState
          icon="group"
          title="Group not found"
          message="It may have been deleted on this or another device."
        />
      </Screen>
    );
  }

  const { group, members, expenses, balances } = data;
  const name = (memberId: number) => members.find((m) => m.id === memberId)?.name ?? '?';
  const me = members.find((m) => m.isMe);
  const transfers = settleUp(balances);
  const bills = expenses.filter((e) => e.kind === 'expense');
  const total = bills.reduce((sum, e) => sum + e.amount, 0);

  const markPaid = async (transfer: Transfer) => {
    const ok = await confirmDestructive(
      'Mark as paid?',
      `Record that ${name(transfer.from)} paid ${name(transfer.to)} ${money(transfer.amount)}.`,
      'Mark as paid'
    );
    if (!ok) return;
    await saveSplitExpense(db, {
      groupId: id,
      kind: 'settlement',
      description: '',
      amount: transfer.amount,
      paidBy: transfer.from,
      occurredOn: today(),
      splitMethod: 'exact',
      shares: [{ memberId: transfer.to, amount: transfer.amount }],
      personal: null,
    });
  };

  const share = async () => {
    const message = groupSummaryText(group.name, total, members, balances, transfers, money);
    try {
      if (Platform.OS === 'web') {
        if (globalThis.navigator?.share) await globalThis.navigator.share({ text: message });
        else {
          await globalThis.navigator.clipboard.writeText(message);
          notify('Copied', 'The summary is on your clipboard, ready to paste.');
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: group.name }} />
      <Screen>
        <Card>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}>
            <View>
              <Text variant="label" color="textSecondary">
                Total spent
              </Text>
              <Text variant="title" numeric>
                {money(total)}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              {members.length} people · {bills.length} bill{bills.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Divider />
          {members.map((member) => {
            const balance = balances.get(member.id) ?? 0;
            return (
              <View
                key={member.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <IconBadge
                  icon="person"
                  color={member.isMe ? colors.primary : group.color}
                  size={32}
                />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {member.name}
                </Text>
                <Text
                  variant="label"
                  numeric
                  color={balance > 0 ? 'income' : balance < 0 ? 'expense' : 'textSecondary'}>
                  {balance > 0
                    ? `gets back ${money(balance)}`
                    : balance < 0
                      ? `owes ${money(-balance)}`
                      : 'settled'}
                </Text>
              </View>
            );
          })}
        </Card>

        <SectionHeader title="Settle up" />
        <Card>
          {transfers.length === 0 ? (
            <Text color="textSecondary">
              {bills.length === 0 ? 'Add a bill to get started.' : 'Everyone is settled up.'}
            </Text>
          ) : (
            transfers.map((transfer, index) => (
              <View key={`${transfer.from}-${transfer.to}`} style={{ gap: space.md }}>
                {index > 0 ? <Divider /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">
                      {name(transfer.from)} pays {name(transfer.to)}
                    </Text>
                    <Text variant="label" color="textSecondary" numeric>
                      {money(transfer.amount)}
                    </Text>
                  </View>
                  <Button
                    title="Mark paid"
                    variant="secondary"
                    onPress={() => markPaid(transfer)}
                  />
                </View>
              </View>
            ))
          )}
        </Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            title="Record repayment"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() =>
              router.push({
                pathname: '/split-expense',
                params: { groupId: id, kind: 'settlement' },
              })
            }
          />
          <Button
            title="Share"
            icon="share"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={share}
          />
        </View>

        <Button
          title="Add a bill"
          icon="add"
          onPress={() => router.push({ pathname: '/split-expense', params: { groupId: id } })}
        />

        <SectionHeader
          title="Bills"
          actionLabel="Edit group"
          onAction={() => router.push({ pathname: '/split-group-edit', params: { id } })}
        />
        {expenses.length === 0 ? (
          <Card>
            <Text color="textSecondary">
              No bills yet. Add one for anything the group shared: a dinner, a taxi, the rent.
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: 0, paddingVertical: space.xs }}>
            {expenses.map((expense, index) => {
              const settlement = expense.kind === 'settlement';
              const myShare = expense.shares.find((s) => s.memberId === me?.id)?.amount ?? 0;
              const receivers = expense.shares.map((share) => name(share.memberId));
              const title = settlement
                ? `${name(expense.paidBy)} paid ${receivers.length > 2 ? `${receivers.length} people` : receivers.join(' and ')}`
                : expense.description || 'Bill';
              const subtitle = settlement
                ? `Payment · ${formatDay(expense.occurredOn)}`
                : `${name(expense.paidBy)} paid · ${formatDay(expense.occurredOn)}${myShare > 0 ? ` · your share ${money(myShare)}` : ''}`;
              return (
                <View key={expense.id}>
                  {index > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${money(expense.amount)}, ${subtitle}. Edit`}
                    onPress={() =>
                      router.push({
                        pathname: '/split-expense',
                        params: { groupId: id, id: expense.id },
                      })
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      minHeight: 56,
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <IconBadge
                      icon={settlement ? 'transfer' : 'list'}
                      color={settlement ? colors.income : group.color}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {title}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {subtitle}
                      </Text>
                    </View>
                    <Text variant="bodyStrong" numeric color={settlement ? 'income' : 'text'}>
                      {money(expense.amount)}
                    </Text>
                    {expense.transactionId ? (
                      <Icon name="check" size={14} color={colors.textTertiary} />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}
      </Screen>
    </View>
  );
}
