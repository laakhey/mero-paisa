import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Divider, ListRow, Screen, Segmented, Text } from '@/components/ui/primitives';
import { listCategories } from '@/db/repositories';
import { useQuery } from '@/db/store';
import type { Category, CategoryKind } from '@/db/types';
import { groupByPriority, PRIORITY_LABELS, type CategoryPriority } from '@/lib/priorities';

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const GROUP_HINTS: Record<CategoryPriority | 'unsorted', string> = {
  need: 'Essentials you would pay for anyway.',
  want: 'Spending you could cut back on.',
  savings: 'Money put aside and loan repayments, like an EMI.',
  unsorted: 'Tap a category to mark it as a need, a want or savings.',
};

export default function CategoriesScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const { data: categories = [] } = useQuery((db) => listCategories(db, kind), [kind]);

  const open = (category: Category) =>
    router.push({ pathname: '/category', params: { id: category.id } });

  const list = (items: Category[]) => (
    <Card style={{ gap: 8 }}>
      {items.map((category, index) => (
        <View key={category.id} style={{ gap: 8 }}>
          {index > 0 ? <Divider /> : null}
          <ListRow
            icon={category.icon}
            iconColor={category.color}
            title={category.name}
            onPress={() => open(category)}
          />
        </View>
      ))}
    </Card>
  );

  const groups = groupByPriority(categories);
  const sections = (['need', 'want', 'savings', 'unsorted'] as const).filter((key) => groups[key].length > 0);

  return (
    <Screen>
      <Segmented options={KINDS} value={kind} onChange={setKind} />
      {kind === 'income'
        ? list(categories)
        : sections.map((key) => (
            <View key={key} style={{ gap: 8 }}>
              <View style={{ gap: 2 }}>
                <Text variant="heading" accessibilityRole="header">
                  {key === 'unsorted' ? 'Not sorted' : PRIORITY_LABELS[key]}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {GROUP_HINTS[key]}
                </Text>
              </View>
              {list(groups[key])}
            </View>
          ))}
      <Button
        title="Add category"
        icon="add"
        variant="secondary"
        onPress={() => router.push({ pathname: '/category', params: { kind } })}
      />
    </Screen>
  );
}
