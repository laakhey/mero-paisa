import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton, Text, hapticTap } from '@/components/ui/primitives';
import {
  addMonths,
  bsMonthGrid,
  bsMonthOf,
  formatMonth,
  fromDayKey,
  today,
  type DayKey,
} from '@/lib/dates';
import { useTheme } from '@/providers/settings';
import { radius, space } from '@/theme/tokens';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A Bikram Sambat month calendar for picking a day. Plain JavaScript, so it
 * works the same in Expo Go, builds and on web (the system date pickers only
 * know AD). Each day shows its BS number, with the AD date small in the corner
 * as on printed Nepali calendars.
 */
export function BsCalendar({
  value,
  onChange,
  maxDay = today(),
}: {
  value: DayKey;
  onChange: (day: DayKey) => void;
  /** Days after this cannot be picked. */
  maxDay?: DayKey;
}) {
  const colors = useTheme();
  const [month, setMonth] = useState(() => bsMonthOf(value));
  const { leading, cells } = bsMonthGrid(month);
  const now = today();
  const canGoForward = month < bsMonthOf(maxDay);

  // AD months the BS month spans, e.g. "Oct – Nov 2026", to orient the user.
  const first = fromDayKey(cells[0].day);
  const last = fromDayKey(cells[cells.length - 1].day);
  const adSpan = `${first.toLocaleDateString(undefined, { month: 'short' })} – ${last.toLocaleDateString(
    undefined,
    {
      month: 'short',
      year: 'numeric',
    }
  )}`;

  const slots: ((typeof cells)[number] | null)[] = [...Array<null>(leading).fill(null), ...cells];
  while (slots.length % 7 !== 0) slots.push(null);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          label="Previous month"
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <View style={{ alignItems: 'center' }}>
          <Text variant="bodyStrong" accessibilityRole="header" accessibilityLiveRegion="polite">
            {formatMonth(month, 'long', 'bs')}
          </Text>
          <Text variant="caption" color="textSecondary">
            {adSpan}
          </Text>
        </View>
        <View style={{ opacity: canGoForward ? 1 : 0.3 }}>
          <IconButton
            icon="forward"
            label="Next month"
            onPress={() => {
              if (canGoForward) setMonth(addMonths(month, 1));
            }}
          />
        </View>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday} variant="caption" color="textTertiary" style={styles.weekday}>
            {weekday}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {slots.map((cell, index) => {
          if (!cell) return <View key={`empty-${index}`} style={styles.cell} />;
          const selected = cell.day === value;
          const isToday = cell.day === now;
          const disabled = cell.day > maxDay;
          return (
            <Pressable
              key={cell.day}
              accessibilityRole="button"
              accessibilityLabel={`${formatMonth(month, 'long', 'bs').split(' ')[0]} ${cell.bsDay}, ${fromDayKey(cell.day).toDateString()}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                hapticTap();
                onChange(cell.day);
              }}
              style={({ pressed }) => [
                styles.cell,
                styles.day,
                selected && { backgroundColor: colors.primary },
                !selected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
              ]}>
              <Text
                variant="caption"
                style={[
                  styles.adDay,
                  { color: selected ? colors.onPrimary : colors.textTertiary },
                ]}>
                {cell.adDay}
              </Text>
              <Text
                variant="bodyStrong"
                numeric
                style={{ color: selected ? colors.onPrimary : colors.text }}>
                {cell.bsDay}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, borderWidth: 1, padding: space.sm, gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, maxHeight: 52 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  adDay: { position: 'absolute', top: 3, right: 5, fontSize: 9, lineHeight: 11 },
});
