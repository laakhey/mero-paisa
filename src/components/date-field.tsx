import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BsCalendar } from '@/components/bs-calendar';
import { Icon } from '@/components/ui/icon';
import { IconButton, Text } from '@/components/ui/primitives';
import { addDays, formatDay, fromDayKey, toDayKey, today, type DayKey } from '@/lib/dates';
import { useSettings } from '@/providers/settings';
import { hitTarget, radius, space } from '@/theme/tokens';

/**
 * Day stepper with a calendar on tap. Most entries are for today or
 * yesterday, so one-tap stepping is faster than opening a calendar each time.
 * The calendar is the system one for AD and the app's own for Bikram Sambat.
 */
export function DateField({ value, onChange }: { value: DayKey; onChange: (value: DayKey) => void }) {
  const { colors, scheme, calendar } = useSettings();
  const [open, setOpen] = useState(false);
  const isToday = value >= today();

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconButton icon="back" label="Previous day" onPress={() => onChange(addDays(value, -1))} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Date, ${formatDay(value)}. Tap to pick another date`}
          onPress={() => setOpen((prev) => !prev)}
          style={styles.label}>
          <Icon name="calendar" size={18} color={colors.textSecondary} />
          <Text variant="bodyStrong">{formatDay(value)}</Text>
        </Pressable>
        <View style={{ opacity: isToday ? 0.3 : 1 }}>
          <IconButton
            icon="forward"
            label="Next day"
            onPress={() => {
              if (!isToday) onChange(addDays(value, 1));
            }}
          />
        </View>
      </View>
      {open && calendar === 'bs' ? (
        <BsCalendar
          value={value}
          onChange={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      ) : open ? (
        <DateTimePicker
          value={fromDayKey(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          themeVariant={scheme}
          accentColor={colors.primary}
          onChange={(event, date) => {
            // Android shows a dialog that must be dismissed on any outcome.
            if (Platform.OS !== 'ios') setOpen(false);
            if (event.type === 'set' && date) onChange(toDayKey(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: hitTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.xs,
  },
  label: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: hitTarget,
  },
});
