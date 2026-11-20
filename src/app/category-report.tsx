import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MonthBars } from '@/components/charts';
import { MonthSwipeArea } from '@/components/month-swipe';
import {
  Card,
  Divider,
  EmptyState,
  IconBadge,
  ProgressBar,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui/primitives';
import { MonthSwitcher, TransactionItem } from '@/components/widgets';
import {
  getBudgetForCategory,
  getCategory,
  getCategoryMonthlyTotals,
  listTransactions,
} from '@/db/repositories';
import { useQuery } from '@/db/store';
import { addMonths, currentMonth, formatMonth, type MonthKey } from '@/lib/dates';
import { ratio } from '@/lib/money';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

const TREND_MONTHS = 6;

const isMonth = (value: unknown): value is MonthKey =>
  typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);

/** Latest month of the trend window that keeps `month` visible, never past the current month. */
function windowEndFor(month: MonthKey): MonthKey {
  const now = currentMonth();
  return month < addMonths(now, -(TREND_MONTHS - 1)) ? addMonths(month, TREND_MONTHS - 1) : now;
}

export default function CategoryReportScreen() {
  const router = useRouter();
  const { colors, money } = useSettings();
  const params = useLocalSearchParams<{ id: string; month?: string }>();
  const categoryId = Number(params.id);

  const [month, setMonth] = useState<MonthKey>(() =>
    isMonth(params.month) && params.month <= currentMonth() ? params.month : currentMonth()
  );
  const [trendEnd, setTrendEnd] = useState<MonthKey>(() => windowEndFor(month));
  const trendStart = addMonths(trendEnd, -(TREND_MONTHS - 1));

  const changeMonth = (next: MonthKey) => {
    setMonth(next);
    // Slide the chart only when the chosen month would fall outside it.
    if (next > trendEnd) setTrendEnd(next);
    else if (next < trendStart) setTrendEnd(addMonths(next, TREND_MONTHS - 1));
  };

  const { data } = useQuery(
    async (db) => {
      const category = Number.isSafeInteger(categoryId) ? await getCategory(db, categoryId) : null;
      if (!category) return { category: null } as const;
      const [trend, comparison, transactions, budget] = await Promise.all([
        getCategoryMonthlyTotals(db, categoryId, trendEnd, TREND_MONTHS),
        getCategoryMonthlyTotals(db, categoryId, month, 2),
        listTransactions(db, { month, categoryId, type: category.kind }),
        category.kind === 'expense' ? getBudgetForCategory(db, categoryId) : Promise.resolve(null),
      ]);
      return { category, trend, comparison, transactions, budget } as const;
    },
    [categoryId, month, trendEnd]
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (!data.category) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Category' }} />
        <EmptyState
          icon="category"
          title="Category not found"
          message="It may have been deleted on this or another device."
        />
      </Screen>
    );
  }

  const { category, trend, comparison, transactions, budget } = data;
  const [previous, selected] = comparison;
  const total = selected.total;
  const isExpense = category.kind === 'expense';
  const trendAverage = Math.round(trend.reduce((sum, m) => sum + m.total, 0) / TREND_MONTHS);
  const change = previous.total > 0 ? (total - previous.total) / previous.total : null;
  const previousName = formatMonth(previous.month, 'short');

  let changeText = `Nothing ${isExpense ? 'spent' : 'received'} in ${previousName}`;
  if (change !== null) {
    const percent = Math.round(Math.abs(change) * 100);
    changeText =
      percent === 0
        ? `Same as ${previousName}`
        : `${percent}% ${change > 0 ? 'more' : 'less'} than ${previousName}`;
  }

  const used = budget ? ratio(total, budget.amount) : 0;
  const budgetTone = used >= 1 ? colors.expense : used >= 0.8 ? colors.warning : category.color;

  return (
    <MonthSwipeArea month={month} onChange={changeMonth}>
      <Screen>
        <Stack.Screen options={{ title: category.name }} />
        <MonthSwitcher month={month} onChange={changeMonth} />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IconBadge icon={category.icon} color={category.color} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="label" color="textSecondary">
                {isExpense ? 'Spent' : 'Received'} in {formatMonth(month)}
              </Text>
              <Text variant="title" numeric numberOfLines={1} adjustsFontSizeToFit>
                {money(total)}
              </Text>
            </View>
          </View>
          <Text variant="caption" color="textSecondary">
            {changeText} · {selected.count} transaction{selected.count === 1 ? '' : 's'}
            {selected.count > 0 ? ` · ${money(Math.round(total / selected.count))} on average` : ''}
          </Text>
          {category.archived ? (
            <Text variant="caption" color="textTertiary">
              This category is archived: it is kept for history and hidden when adding transactions.
            </Text>
          ) : null}
        </Card>

        {budget ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
              <Text variant="bodyStrong">Monthly budget</Text>
              <Text variant="bodyStrong" color={used >= 1 ? 'expense' : 'text'} numeric>
                {money(Math.abs(budget.amount - total))} {used >= 1 ? 'over' : 'left'}
              </Text>
            </View>
            <ProgressBar value={used} color={budgetTone} />
            <Text variant="caption" color="textSecondary" numeric>
              {money(total)} of {money(budget.amount)} · {Math.round(used * 100)}% used
            </Text>
          </Card>
        ) : null}

        <SectionHeader title={`Last ${TREND_MONTHS} months`} />
        <Card>
          <MonthBars
            bars={trend.map((m) => ({
              key: m.month,
              label: formatMonth(m.month, 'short'),
              value: m.total,
            }))}
            color={category.color}
            selectedKey={month}
            onSelect={changeMonth}
            formatValue={(value) => money(value)}
          />
          <Text variant="caption" color="textSecondary" numeric>
            Average {money(trendAverage)} per month · tap a bar to see that month
          </Text>
        </Card>

        <SectionHeader title="Transactions" />
        {transactions.length === 0 ? (
          <Card>
            <Text color="textSecondary">
              No {isExpense ? 'spending' : 'income'} in {category.name} in {formatMonth(month)}.
            </Text>
          </Card>
        ) : (
          <Card style={{ gap: 0, paddingVertical: space.xs }}>
            {transactions.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <TransactionItem
                  item={item}
                  showDate
                  onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
                />
              </View>
            ))}
          </Card>
        )}
      </Screen>
    </MonthSwipeArea>
  );
}
