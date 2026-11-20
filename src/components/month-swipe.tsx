import { useMemo, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';

import { hapticTap } from '@/components/ui/primitives';
import { addMonths, currentMonth, type MonthKey } from '@/lib/dates';
import { swipeStep } from '@/lib/swipe';

/** Sideways travel, in points, before a drag is treated as a swipe rather than a tap or scroll. */
const CLAIM_DISTANCE = 25;

/**
 * Swipe left for the next month and right for the previous one — the same as
 * the arrow buttons, including not going past the current month.
 *
 * Built on React Native's own touch system, so it behaves the same in Expo Go,
 * installed builds and on web. It only claims clearly sideways drags (well
 * past 25pt and at least twice as horizontal as vertical), so scrolling the
 * screen and tapping rows keep working as before.
 */
export function MonthSwipeArea({
  month,
  onChange,
  children,
}: {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
  children: ReactNode;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture phase, so a sideways drag that starts on a row still counts.
        onMoveShouldSetPanResponderCapture: (_event, { dx, dy }) =>
          Math.abs(dx) > CLAIM_DISTANCE && Math.abs(dx) > Math.abs(dy) * 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, { dx, vx }) => {
          // vx is in points per millisecond.
          const step = swipeStep(dx, vx * 1000);
          if (step === 0) return;
          const next = addMonths(month, step);
          if (next > currentMonth()) return;
          hapticTap();
          onChange(next);
        },
      }),
    [month, onChange]
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
