import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, EmptyState, Fab, Input, Segmented, Text } from '@/components/ui/primitives';
import { MonthSwitcher, TransactionItem } from '@/components/widgets';
import { listLabels, listTransactions } from '@/db/repositories';
import { useQuery } from '@/db/store';
import type { TransactionRow, TransactionType } from '@/db/types';
import { formatDay } from '@/lib/dates';
import { useMonthState } from '@/hooks/use-month-state';
import { useSettings } from '@/providers/settings';
import { maxContentWidth, radius, space } from '@/theme/tokens';

type TypeFilter = 'all' | TransactionType;

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
];

type Section = { day: string; net: number; data: TransactionRow[] };

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, money } = useSettings();
  const [month, setMonth] = useMonthState();
  const [type, setType] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [labelId, setLabelId] = useState<number | undefined>(undefined);
  const deferredSearch = useDeferredValue(search);

  const { data: labels = [] } = useQuery(listLabels);
  // A label deleted elsewhere must not leave an invisible filter applied.
  const activeLabelId = labels.some((label) => label.id === labelId) ? labelId : undefined;

  const { data } = useQuery(
    (db) =>
      listTransactions(db, {
        // A search looks across all months; otherwise show the selected one.
        month: deferredSearch.trim() ? undefined : month,
        type: type === 'all' ? undefined : type,
        labelId: activeLabelId,
        search: deferredSearch,
        limit: deferredSearch.trim() ? 200 : undefined,
      }),
    [month, type, activeLabelId, deferredSearch]
  );


  const sections = useMemo<Section[]>(() => {
    const byDay = new Map<string, Section>();
    for (const item of data ?? []) {
      let section = byDay.get(item.occurredOn);
      if (!section) {
        section = { day: item.occurredOn, net: 0, data: [] };
        byDay.set(item.occurredOn, section);
      }
      section.data.push(item);
      if (item.type === 'income') section.net += item.amount;
      else if (item.type === 'expense') section.net -= item.amount;
    }
    return [...byDay.values()];
  }, [data]);

  const searching = deferredSearch.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text variant="title" accessibilityRole="header">
          Activity
        </Text>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search notes, categories, labels"
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search transactions"
        />
        <Segmented options={FILTERS} value={type} onChange={setType} />
        {labels.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginHorizontal: -space.lg, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
            {labels.map((label) => (
              <Chip
                key={label.id}
                label={`#${label.name}`}
                tint={label.color}
                selected={label.id === activeLabelId}
                onPress={() => setLabelId(label.id === activeLabelId ? undefined : label.id)}
              />
            ))}
          </ScrollView>
        ) : null}
        {searching ? null : <MonthSwitcher month={month} onChange={setMonth} />}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: 96 }]}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="label" color="textSecondary">
              {formatDay(section.day)}
            </Text>
            {section.net !== 0 ? (
              <Text variant="caption" color="textTertiary" numeric>
                {money(section.net, { signed: true })}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.item,
              { backgroundColor: colors.surface, borderColor: colors.border },
              index === 0 && styles.itemFirst,
              index === section.data.length - 1 && styles.itemLast,
            ]}>
            <TransactionItem
              item={item}
              onPress={() => router.push({ pathname: '/transaction', params: { id: item.id } })}
            />
          </View>
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon={searching ? 'search' : 'list'}
              title={searching ? 'No matches' : 'Nothing here yet'}
              message={
                searching
                  ? 'Try a different word or clear the filters.'
                  : activeLabelId !== undefined
                    ? 'No transactions with this label in this month.'
                    : 'Transactions you add for this month will show up here.'
              }
            />
          ) : undefined
        }
      />
      <Fab label="Add transaction" onPress={() => router.push('/transaction')} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    gap: space.md,
    paddingBottom: space.sm,
  },
  list: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', paddingHorizontal: space.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  item: { paddingHorizontal: space.lg, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  itemFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: StyleSheet.hairlineWidth },
  itemLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
