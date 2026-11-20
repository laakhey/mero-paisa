import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { DonutChart, IncomeExpenseBars, Legend, topSlices } from '@/components/charts';
import { MonthSwipeArea } from '@/components/month-swipe';
import { Icon } from '@/components/ui/icon';
import {
  Card,
  Divider,
  IconBadge,
  ProgressBar,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  hapticTap,
} from '@/components/ui/primitives';
import { MonthSwitcher, StatTile } from '@/components/widgets';
import { getCategoryTotals, getMonthlyTrend, getPrioritySplit } from '@/db/repositories';
import { useQuery } from '@/db/store';
import type { CategoryKind } from '@/db/types';
import { formatMonth } from '@/lib/dates';
import { ratio } from '@/lib/money';
import { PRIORITY_LABELS, priorityShares, type PrioritySplit } from '@/lib/priorities';
import { useMonthState } from '@/hooks/use-month-state';
import { useSettings } from '@/providers/settings';
import { radius, space } from '@/theme/tokens';

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
];

/**
 * Needs, wants and savings & debt as shares of the month's income, each next
 * to its 50/30/20 target, above one bar showing the split.
 */
function PrioritySplitCard({ split, income }: { split: PrioritySplit; income: number }) {
  const { colors, money } = useSettings();
  const { base, rows } = priorityShares(split, income);
  const colorOf = { need: colors.primary, want: colors.warning, savings: colors.income, unsorted: colors.textTertiary };
  const parts = rows.map((row) => ({
    ...row,
    label: row.key === 'unsorted' ? 'Not sorted' : PRIORITY_LABELS[row.key],
    color: colorOf[row.key],
    // Needs and wants should stay at or under target, savings at or above it.
    offTarget:
      row.target !== null && (row.key === 'savings' ? row.percent < row.target : row.percent > row.target),
  }));
  const unspent = Math.max(0, income - split.total);

  return (
    <Card style={{ gap: space.md }}>
      <Text variant="caption" color="textSecondary">
        {base === 'income'
          ? `Share of ${money(income)} income, against the 50/30/20 guide`
          : 'Share of this month’s spending (no income recorded)'}
      </Text>
      <View
        accessible
        accessibilityLabel={parts.map((part) => `${part.label} ${part.percent} percent`).join(', ')}
        style={{
          flexDirection: 'row',
          height: 12,
          borderRadius: radius.pill,
          overflow: 'hidden',
          gap: 2,
          backgroundColor: colors.surfaceMuted,
        }}>
        {parts.map((part) => (
          <View key={part.key} style={{ flex: part.value, backgroundColor: part.color }} />
        ))}
        {unspent > 0 ? <View style={{ flex: unspent }} /> : null}
      </View>
      {parts.map((part) => (
        <View key={part.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: part.color }} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{part.label}</Text>
            {part.target !== null ? (
              <Text variant="caption" color="textSecondary">
                Target {part.target}%
              </Text>
            ) : null}
          </View>
          <Text variant="label" color={part.offTarget ? 'expense' : 'textSecondary'} numeric>
            {part.percent}%
          </Text>
          <Text variant="bodyStrong" numeric>
            {money(part.value)}
          </Text>
        </View>
      ))}
      {split.withdrawn > 0 ? (
        <Text variant="caption" color="textSecondary">
          {money(split.withdrawn)} was moved out of savings accounts this month.
        </Text>
      ) : null}
    </Card>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const { colors, money } = useSettings();
  const [month, setMonth] = useMonthState();
  const [kind, setKind] = useState<CategoryKind>('expense');

  const { data } = useQuery(
    async (db) => {
      const [trend, categories, priorities] = await Promise.all([
        getMonthlyTrend(db, month, 6),
        getCategoryTotals(db, month, kind),
        getPrioritySplit(db, month),
      ]);
      return { trend, categories, priorities };
    },
    [month, kind]
  );

  const trend = data?.trend ?? [];
  const categories = data?.categories ?? [];
  const selected = trend[trend.length - 1];
  const income = selected?.income ?? 0;
  const expense = selected?.expense ?? 0;
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : null;
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  const { top, rest } = topSlices(categories, 6);
  const slices = [
    ...top.map((c) => ({ key: String(c.categoryId), value: c.total, color: c.color })),
    ...(rest > 0 ? [{ key: 'other', value: rest, color: colors.textTertiary }] : []),
  ];

  return (
    <MonthSwipeArea month={month} onChange={setMonth}>
      <Screen padTop>
        <Text variant="title" accessibilityRole="header">
          Reports
        </Text>
        <MonthSwitcher month={month} onChange={setMonth} />

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <StatTile label="Income" value={money(income)} tone="income" />
          <StatTile label="Expenses" value={money(expense)} tone="expense" />
        </View>

        <Card>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}>
            <View>
              <Text variant="label" color="textSecondary">
                Net cash flow
              </Text>
              <Text variant="title" numeric color={net < 0 ? 'expense' : 'income'}>
                {money(net, { signed: true })}
              </Text>
            </View>
            {savingsRate !== null ? (
              <Text variant="caption" color="textSecondary">
                {savingsRate >= 0
                  ? `${savingsRate}% of income saved`
                  : `Spent ${-savingsRate}% more than earned`}
              </Text>
            ) : null}
          </View>
        </Card>

        {data && (data.priorities.total > 0 || data.priorities.withdrawn > 0) ? (
          <>
            <SectionHeader
              title="Needs, wants & savings"
              actionLabel={data.priorities.unsorted > 0 ? 'Sort categories' : undefined}
              onAction={() => router.push('/categories')}
            />
            <PrioritySplitCard split={data.priorities} income={income} />
          </>
        ) : null}

        <SectionHeader title="Last 6 months" />
        <Card>
          <IncomeExpenseBars
            selectedKey={month}
            groups={trend.map((t) => ({
              key: t.month,
              label: formatMonth(t.month, 'short'),
              income: t.income,
              expense: t.expense,
            }))}
          />
          <Legend
            items={[
              { label: 'Income', color: colors.income },
              { label: 'Expenses', color: colors.expense },
            ]}
          />
        </Card>

        <SectionHeader title="By category" />
        <Segmented options={KINDS} value={kind} onChange={setKind} />
        <Card>
          {categories.length === 0 ? (
            <Text color="textSecondary">
              No {kind === 'expense' ? 'expenses' : 'income'} recorded in {formatMonth(month)}.
            </Text>
          ) : (
            <>
              <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
                <DonutChart slices={slices}>
                  <Text variant="caption" color="textSecondary">
                    Total
                  </Text>
                  <Text variant="heading" numeric>
                    {money(total, { compact: true })}
                  </Text>
                </DonutChart>
              </View>
              {categories.map((category, index) => {
                const share = ratio(category.total, total);
                const row = (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <IconBadge icon={category.icon} color={category.color} size={36} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          gap: space.sm,
                        }}>
                        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                          {category.name}
                        </Text>
                        <Text variant="bodyStrong" numeric>
                          {money(category.total)}
                        </Text>
                      </View>
                      <ProgressBar value={share} color={category.color} />
                      <Text variant="caption" color="textSecondary" numeric>
                        {Math.round(share * 100)}% · {category.count} transaction
                        {category.count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {category.categoryId !== null ? (
                      <Icon name="forward" size={16} color={colors.textTertiary} />
                    ) : null}
                  </View>
                );
                const { categoryId } = category;
                return (
                  <View key={String(categoryId)} style={{ gap: space.md }}>
                    {index > 0 ? <Divider /> : null}
                    {categoryId === null ? (
                      row
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${category.name}, ${money(category.total)}, ${Math.round(share * 100)} percent. Show details`}
                        onPress={() => {
                          hapticTap();
                          router.push({
                            pathname: '/category-report',
                            params: { id: categoryId, month },
                          });
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                        {row}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </Card>
      </Screen>
    </MonthSwipeArea>
  );
}
