import { useState } from 'react';

import { currentMonth, type MonthKey } from '@/lib/dates';
import { useSettings } from '@/providers/settings';

/**
 * The month a screen is showing. Month keys mean different months in AD and
 * BS, so when the calendar setting changes the screen jumps back to the
 * current month instead of reading its old key in the new calendar.
 */
export function useMonthState(): [MonthKey, (month: MonthKey) => void] {
  const { calendar } = useSettings();
  const [state, setState] = useState(() => ({ calendar, month: currentMonth() }));
  if (state.calendar !== calendar) {
    // Adjusting state while rendering is React's recommended way to reset on a prop change.
    setState({ calendar, month: currentMonth() });
  }
  const month = state.calendar === calendar ? state.month : currentMonth();
  return [month, (next) => setState({ calendar, month: next })];
}
