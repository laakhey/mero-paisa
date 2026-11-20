import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Field, Input, Screen, Text, hapticSuccess } from '@/components/ui/primitives';
import { confirmDestructive } from '@/components/widgets';
import { deleteBudget, getBudgetForCategory, listBudgetProgress, listCategories, setBudget } from '@/db/repositories';
import { useQuery } from '@/db/store';
import { currentMonth } from '@/lib/dates';
import { parseAmount, toInputString } from '@/lib/money';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

export default function BudgetScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { currency } = useSettings();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const editingCategoryId = params.categoryId ? Number(params.categoryId) : undefined;

  const [categoryId, setCategoryId] = useState<number | null>(editingCategoryId ?? null);
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery(async (database) => {
    const [categories, budgets] = await Promise.all([
      listCategories(database, 'expense'),
      listBudgetProgress(database, currentMonth()),
    ]);
    return { categories, budgeted: new Set(budgets.map((b) => b.categoryId)) };
  });

  useEffect(() => {
    if (editingCategoryId === undefined) return;
    getBudgetForCategory(db, editingCategoryId).then((budget) => {
      if (budget) setAmountText(toInputString(budget.amount, currency));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, editingCategoryId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/budgets'));

  // When creating, only offer categories that do not have a budget yet.
  const choices = (data?.categories ?? []).filter(
    (c) => editingCategoryId === c.id || (editingCategoryId === undefined && !data?.budgeted.has(c.id))
  );

  const save = async () => {
    const amount = parseAmount(amountText, currency);
    if (categoryId === null) return setError('Choose a category.');
    if (amount === null || amount <= 0) return setError('Enter a monthly limit greater than zero.');
    await setBudget(db, categoryId, amount);
    hapticSuccess();
    close();
  };

  const remove = async () => {
    if (editingCategoryId === undefined) return;
    if (await confirmDestructive('Remove budget?', 'Your transactions are not affected.', 'Remove')) {
      await deleteBudget(db, editingCategoryId);
      close();
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: editingCategoryId === undefined ? 'New budget' : 'Edit budget' }} />
      <Field label="Category">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {choices.map((category) => (
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
        {data && choices.length === 0 ? (
          <Text color="textSecondary">Every expense category already has a budget.</Text>
        ) : null}
      </Field>

      <Field label={`Monthly limit (${currency})`} error={error}>
        <Input
          value={amountText}
          onChangeText={(text) => {
            setAmountText(text.replace(',', '.'));
            setError(null);
          }}
          placeholder="0"
          keyboardType="decimal-pad"
          accessibilityLabel="Monthly limit"
        />
      </Field>

      <Button title="Save budget" icon="check" onPress={save} />
      {editingCategoryId !== undefined ? (
        <Button title="Remove budget" icon="delete" variant="danger" onPress={remove} />
      ) : null}
    </Screen>
  );
}
