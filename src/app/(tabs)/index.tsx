import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DonutChart, topSlices } from '@/components/charts';
import { Icon } from '@/components/ui/icon';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Fab,
  IconBadge,
  ProgressBar,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui/primitives';
import { TransactionItem } from '@/components/widgets';
import {
  getCategoryTotals,
  getMonthTotals,
  listAccounts,
  listBudgetProgress,
  listTransactions,
} from '@/db/repositories';
import { seedSampleData } from '@/db/seed';
import { listSplitGroups } from '@/db/split-repositories';
import { notifyDataChanged, useQuery } from '@/db/store';
import { currentMonth, formatMonth } from '@/lib/dates';
import { fractionDigits, ratio } from '@/lib/money';
import { myBalanceLabel } from '@/lib/split-text';
import { useSettings } from '@/providers/settings';
import { radius, space } from '@/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, money, currency } = useSettings();
  const month = currentMonth();
  const [seeding, setSeeding] = useState(false);

  const { data } = useQuery(
    async (database) => {
      const [accounts, totals, categories, budgets, recent, splits] = await Promise.all([
        listAccounts(database),
        getMonthTotals(database, month),
        getCategoryTotals(database, month, 'expense'),
        listBudgetProgress(database, month),
        listTransactions(database, { limit: 6 }),
        listSplitGroups(database),
      ]);
      return { accounts, totals, categories, budgets, recent, splits };
    },
    [month]
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const { accounts, totals, categories, budgets, recent } = data;
  // Tolerates data loaded by an older version of this screen during a development refresh.
  const splits = data.splits ?? [];
  const splitNet = splits.reduce((sum, group) => sum + group.myBalance, 0);
  const splitLabel = myBalanceLabel(splitNet, money);
  const netWorth = accounts.reduce((sum, account) => sum + account.balance, 0);
  const net = totals.income - totals.expense;
  const { top, rest } = topSlices(categories, 5);
  const slices = [
    ...top.map((c) => ({ key: String(c.categoryId), value: c.total, color: c.color })),
    ...(rest > 0 ? [{ key: 'other', value: rest, color: colors.textTertiary }] : []),
  ];
  const legend = [
    ...top.map((c) => ({ key: String(c.categoryId), name: c.name, color: c.color, total: c.total })),
    ...(rest > 0 ? [{ key: 'other', name: 'Other', color: colors.textTertiary, total: rest }] : []),
  ];

  const loadSample = async () => {
    setSeeding(true);
    try {
      await seedSampleData(db, 10 ** fractionDigits(currency));
      notifyDataChanged();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen padTop bottomSpace={72}>
        <View>
          <Text variant="caption" color="textSecondary">
            {formatMonth(month).toUpperCase()}
          </Text>
          <Text variant="title" accessibilityRole="header">
            Overview
          </Text>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <Text variant="label" style={{ color: colors.onPrimary, opacity: 0.8 }}>
            Total balance
          </Text>
          <Text variant="display" numeric numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.onPrimary }}>
            {money(netWorth)}
          </Text>
          <View style={styles.heroStats}>
            <HeroStat label="Income" value={money(totals.income)} icon="down" />
            <HeroStat label="Spent" value={money(totals.expense)} icon="up" />
            <HeroStat label="Net" value={money(net, { signed: true })} icon="transfer" />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space.lg }}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
          {accounts.map((account) => (
            <Card key={account.id} style={styles.account}>
              <IconBadge icon={account.icon} color={account.color} size={34} />
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {account.name}
              </Text>
              <Text variant="bodyStrong" color={account.balance < 0 ? 'expense' : 'text'} numeric numberOfLines={1}>
                {money(account.balance)}
              </Text>
            </Card>
          ))}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Split bills. ${splits.length === 0 ? 'Share costs with friends' : splitLabel.text}. Open`}
          onPress={() => router.push('/split')}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Card>
            <View style={styles.legendRow}>
              <IconBadge icon="group" color={colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">Split bills</Text>
                <Text variant="caption" color={splits.length === 0 ? 'textSecondary' : splitLabel.color} numeric>
                  {splits.length === 0
                    ? 'Share trip, flat or dinner costs with friends'
                    : `${splitLabel.text} · ${splits.length} group${splits.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </View>
          </Card>
        </Pressable>

        {recent.length === 0 ? (
          <Card>
            <EmptyState
              icon="list"
              title="Start tracking"
              message="Add your first transaction, or load sample data to explore the app."
              actionLabel="Add transaction"
              onAction={() => router.push('/transaction')}
            />
            <Button title="Load sample data" variant="ghost" loading={seeding} onPress={loadSample} />
          </Card>
        ) : (
          <>
            <SectionHeader title="Spending this month" actionLabel="Reports" onAction={() => router.push('/reports')} />
            <Card>
              {slices.length === 0 ? (
                <Text color="textSecondary">No spending recorded this month yet.</Text>
              ) : (
                <View style={styles.spending}>
                  <DonutChart slices={slices} size={132} thickness={18}>
                    <Text variant="caption" color="textSecondary">
                      Spent
                    </Text>
                    <Text variant="bodyStrong" numeric>
                      {money(totals.expense, { compact: true })}
                    </Text>
                  </DonutChart>
                  <View style={{ flex: 1, gap: space.sm }}>
                    {legend.map((item) => (
                      <View key={item.key} style={styles.legendRow}>
                        <View style={[styles.dot, { backgroundColor: item.color }]} />
                        <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text variant="label" color="textSecondary" numeric>
                          {Math.round(ratio(item.total, totals.expense) * 100)}%
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Card>

            {budgets.length > 0 ? (
              <>
                <SectionHeader title="Budgets" actionLabel="See all" onAction={() => router.push('/budgets')} />
                <Card>
                  {budgets.slice(0, 3).map((budget) => {
                    const used = ratio(budget.spent, budget.amount);
                    const tone = used >= 1 ? colors.expense : used >= 0.8 ? colors.warning : budget.categoryColor;
                    return (
                      <View key={budget.id} style={{ gap: space.sm }}>
                        <View style={styles.legendRow}>
                          <Text variant="label" style={{ flex: 1 }}>
                            {budget.categoryName}
                          </Text>
                          <Text variant="caption" color={used >= 1 ? 'expense' : 'textSecondary'} numeric>
                            {money(budget.spent)} / {money(budget.amount)}
                          </Text>
                        </View>
                        <ProgressBar value={used} color={tone} />
                      </View>
                    );
                  })}
                </Card>
              </>
            ) : null}

            <SectionHeader title="Recent activity" actionLabel="See all" onAction={() => router.push('/transactions')} />
            <Card style={{ gap: 0, paddingVertical: space.xs }}>
              {recent.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <TransactionItem
                    item={item}
                    onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </Screen>
      <Fab label="Add transaction" onPress={() => router.push('/transaction')} />
    </View>
  );
}

function HeroStat({ label, value, icon }: { label: string; value: string; icon: 'up' | 'down' | 'transfer' }) {
  const { colors } = useSettings();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={12} color={colors.onPrimary} />
        <Text variant="caption" style={{ color: colors.onPrimary, opacity: 0.8 }}>
          {label}
        </Text>
      </View>
      <Text variant="label" numeric numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.onPrimary }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.xs },
  heroStats: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  account: { width: 148, gap: space.xs, padding: space.md },
  spending: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
