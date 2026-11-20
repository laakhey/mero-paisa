import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BsCalendar } from '@/components/bs-calendar';
import { Icon } from '@/components/ui/icon';
import { IconButton, Text } from '@/components/ui/primitives';
import { addDays, formatDay, today, type DayKey } from '@/lib/dates';
import { useSettings } from '@/providers/settings';
import { hitTarget, radius, space } from '@/theme/tokens';

/**
 * Web variant: the native date picker module has no browser implementation, so
 * AD uses the browser's date input and BS uses the app's own calendar.
 */
export function DateField({
  value,
  onChange,
}: {
  value: DayKey;
  onChange: (value: DayKey) => void;
}) {
  const { colors, calendar } = useSettings();
  const [open, setOpen] = useState(false);
  const isToday = value >= today();

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconButton icon="back" label="Previous day" onPress={() => onChange(addDays(value, -1))} />
        {calendar === 'bs' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Date, ${formatDay(value)}. Tap to pick another date`}
            onPress={() => setOpen((prev) => !prev)}
            style={styles.label}>
            <Icon name="calendar" size={18} color={colors.textSecondary} />
            <Text variant="bodyStrong">{formatDay(value)}</Text>
          </Pressable>
        ) : (
          <View style={styles.label}>
            <Icon name="calendar" size={18} color={colors.textSecondary} />
            <Text variant="bodyStrong">{formatDay(value)}</Text>
            <input
              type="date"
              aria-label="Date"
              value={value}
              max={today()}
              onChange={(event) => {
                if (event.target.value) onChange(event.target.value);
              }}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
              }}
              onClick={(event) => event.currentTarget.showPicker?.()}
            />
          </View>
        )}
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
