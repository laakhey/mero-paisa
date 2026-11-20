import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { IconBadge, IconButton, Text } from '@/components/ui/primitives';
import type { TransactionRow } from '@/db/types';
import { addMonths, currentMonth, formatDay, formatMonth, type MonthKey } from '@/lib/dates';
import { useSettings } from '@/providers/settings';
import { hitTarget, space } from '@/theme/tokens';

export function MonthSwitcher({ month, onChange }: { month: MonthKey; onChange: (month: MonthKey) => void }) {
  const isCurrent = month >= currentMonth();
  return (
    <View style={styles.monthSwitcher}>
      <IconButton icon="back" label="Previous month" filled onPress={() => onChange(addMonths(month, -1))} />
      <Text variant="bodyStrong" accessibilityLiveRegion="polite">
        {formatMonth(month)}
      </Text>
      <View style={{ opacity: isCurrent ? 0.3 : 1 }}>
        <IconButton
          icon="forward"
          label="Next month"
          filled
          onPress={() => {
            if (!isCurrent) onChange(addMonths(month, 1));
          }}
        />
      </View>
    </View>
  );
}

export function TransactionItem({
  item,
  onPress,
  showDate = false,
}: {
  item: TransactionRow;
  onPress: () => void;
  /** For flat lists; lists grouped under day headers already show the date. */
  showDate?: boolean;
}) {
  const { colors, money } = useSettings();
  const isTransfer = item.type === 'transfer';
  const title = isTransfer ? 'Transfer' : (item.categoryName ?? 'Uncategorised');
  const subtitle = [
    showDate ? formatDay(item.occurredOn) : '',
    ...(isTransfer ? [`${item.accountName} → ${item.toAccountName ?? ''}`] : [item.note, item.accountName]),
  ]
    .filter(Boolean)
    .join(' · ');
  const amountColor = item.type === 'income' ? 'income' : item.type === 'expense' ? 'text' : 'textSecondary';
  const sign = item.type === 'income' ? '+' : item.type === 'expense' ? '-' : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, `${sign}${money(item.amount)}`, subtitle, ...item.labels.map((l) => `label ${l.name}`)]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.transaction, { opacity: pressed ? 0.6 : 1 }]}>
      {isTransfer ? (
        <IconBadge icon="transfer" color={colors.textSecondary} />
      ) : (
        <IconBadge icon={item.categoryIcon ?? 'tag'} color={item.categoryColor ?? colors.textSecondary} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {item.labels.length > 0 ? (
          <Text variant="caption" color="primary" numberOfLines={1}>
            {item.labels.map((label) => `#${label.name}`).join('  ')}
          </Text>
        ) : null}
      </View>
      <Text variant="bodyStrong" color={amountColor} numeric>
        {sign}
        {money(item.amount)}
      </Text>
    </Pressable>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'income' | 'expense';
}) {
  const { colors } = useSettings();
  return (
    <View style={[styles.stat, { backgroundColor: colors[`${tone}Muted`] }]}>
      <View style={styles.statLabel}>
        <Icon name={tone === 'income' ? 'down' : 'up'} size={14} color={colors[tone]} />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </View>
      <Text variant="heading" numeric numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** Destructive confirmation that works on native (Alert) and web (window.confirm). */
export function confirmDestructive(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export function notify(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  monthSwitcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transaction: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hitTarget + 8 },
  stat: { flex: 1, borderRadius: 14, padding: space.md, gap: space.xs },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
