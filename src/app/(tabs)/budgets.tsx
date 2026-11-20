import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, Card, EmptyState, IconBadge, ProgressBar, Screen, Text } from '@/components/ui/primitives';
import { MonthSwitcher } from '@/components/widgets';
import { listBudgetProgress } from '@/db/repositories';
import { useQuery } from '@/db/store';
import { currentMonth, daysLeftInMonth } from '@/lib/dates';
import { ratio } from '@/lib/money';
import { useMonthState } from '@/hooks/use-month-state';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

export default function BudgetsScreen() {
  const router = useRouter();
  const { colors, money } = useSettings();
  const [month, setMonth] = useMonthState();
  const { data: budgets } = useQuery((db) => listBudgetProgress(db, month), [month]);

  const totalBudget = budgets?.reduce((sum, b) => sum + b.amount, 0) ?? 0;
  const totalSpent = budgets?.reduce((sum, b) => sum + b.spent, 0) ?? 0;
  const remaining = totalBudget - totalSpent;
  const isCurrent = month === currentMonth();
  const daysLeft = isCurrent ? daysLeftInMonth(month) : 0;

  return (
    <Screen padTop>
      <Text variant="title" accessibilityRole="header">
        Budgets
      </Text>
      <MonthSwitcher month={month} onChange={setMonth} />

      {budgets && budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon="budget"
            title="No budgets yet"
            message="Set a monthly limit for a category and see at a glance how much is left to spend."
            actionLabel="Create budget"
            onAction={() => router.push('/budget')}
          />
        </Card>
      ) : null}

      {budgets && budgets.length > 0 ? (
        <>
          <Card>
            <Text variant="label" color="textSecondary">
              {remaining >= 0 ? 'Left to spend' : 'Over budget'}
            </Text>
            <Text variant="display" numeric color={remaining >= 0 ? 'text' : 'expense'} numberOfLines={1} adjustsFontSizeToFit>
              {money(Math.abs(remaining))}
            </Text>
            <ProgressBar
              value={ratio(totalSpent, totalBudget)}
              color={remaining < 0 ? colors.expense : colors.primary}
            />
            <Text variant="caption" color="textSecondary" numeric>
              {money(totalSpent)} of {money(totalBudget)} spent
              {isCurrent && remaining > 0 && daysLeft > 0
                ? ` · about ${money(Math.floor(remaining / daysLeft))} per day for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}`
                : ''}
            </Text>
          </Card>

          {budgets.map((budget) => {
            const used = ratio(budget.spent, budget.amount);
            const left = budget.amount - budget.spent;
            const tone = used >= 1 ? colors.expense : used >= 0.8 ? colors.warning : budget.categoryColor;
            return (
              <Pressable
                key={budget.id}
                accessibilityRole="button"
                accessibilityLabel={`${budget.categoryName} budget, ${Math.round(used * 100)} percent used. Edit`}
                onPress={() => router.push({ pathname: '/budget', params: { categoryId: budget.categoryId } })}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <IconBadge icon={budget.categoryIcon} color={budget.categoryColor} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{budget.categoryName}</Text>
                      <Text variant="caption" color="textSecondary" numeric>
                        {money(budget.spent)} of {money(budget.amount)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong" color={left < 0 ? 'expense' : 'text'} numeric>
                        {money(Math.abs(left))}
                      </Text>
                      <Text variant="caption" color={left < 0 ? 'expense' : 'textSecondary'}>
                        {left < 0 ? 'over' : 'left'}
                      </Text>
                    </View>
                  </View>
                  <ProgressBar value={used} color={tone} />
                </Card>
              </Pressable>
            );
          })}
          <Button title="Add budget" icon="add" variant="secondary" onPress={() => router.push('/budget')} />
        </>
      ) : null}
    </Screen>
  );
}
