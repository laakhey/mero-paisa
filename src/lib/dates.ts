/**
 * Transactions are dated with a local calendar day stored as "YYYY-MM-DD".
 * Keeping it as text (not a UTC timestamp) means a purchase made on the 31st
 * stays on the 31st no matter which time zone the phone later travels to.
 */

import NepaliDate from 'nepali-date-converter';

export type DayKey = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

const pad = (n: number) => String(n).padStart(2, '0');

export function toDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): DayKey {
  return toDayKey(new Date());
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

export function toMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/* ------------------------------ Calendars ------------------------------ */

/**
 * Month keys ("YYYY-MM") are read in the active calendar: Gregorian (AD) or
 * Bikram Sambat (BS). Transaction dates are always stored as AD day keys;
 * only months (their boundaries, names and navigation) and how days are
 * displayed change with the calendar.
 *
 * The active calendar is a user setting applied by SettingsProvider, so the
 * many helpers below need no extra argument. Each still accepts an explicit
 * calendar, which tests use.
 */
export type CalendarSystem = 'ad' | 'bs';

let activeCalendar: CalendarSystem = 'ad';

export function setActiveCalendar(calendar: CalendarSystem): void {
  activeCalendar = calendar;
}

export function getActiveCalendar(): CalendarSystem {
  return activeCalendar;
}

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
] as const;

type Ymd = { y: number; m: number; d: number };

/** BS year, month (1-12) and day of an AD day key. */
export function toBs(day: DayKey): Ymd {
  const bs = new NepaliDate(fromDayKey(day));
  return { y: bs.getYear(), m: bs.getMonth() + 1, d: bs.getDate() };
}

/** AD day key of a BS date (month 1-12). */
export function fromBs(y: number, m: number, d: number): DayKey {
  return toDayKey(new NepaliDate(y, m - 1, d).toJsDate());
}

/** Whole days from `from` to `to` (DST-safe). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((fromDayKey(to).getTime() - fromDayKey(from).getTime()) / 86_400_000);
}

export function currentMonth(calendar: CalendarSystem = activeCalendar): MonthKey {
  if (calendar === 'bs') {
    const { y, m } = toBs(today());
    return `${y}-${pad(m)}`;
  }
  return toMonthKey(new Date());
}

/** Month arithmetic is the same in both calendars: twelve months a year. */
export function addMonths(key: MonthKey, months: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + months, 1));
}

/** AD day range of a month — inclusive start, exclusive end — for `>= start AND < end`. */
export function monthRange(key: MonthKey, calendar: CalendarSystem = activeCalendar): { start: DayKey; end: DayKey } {
  if (calendar === 'bs') {
    const [y, m] = key.split('-').map(Number);
    const [ny, nm] = addMonths(key, 1).split('-').map(Number);
    return { start: fromBs(y, m, 1), end: fromBs(ny, nm, 1) };
  }
  return { start: `${key}-01`, end: `${addMonths(key, 1)}-01` };
}

export function daysInMonth(key: MonthKey, calendar: CalendarSystem = activeCalendar): number {
  const { start, end } = monthRange(key, calendar);
  return daysBetween(start, end);
}

/** Days from today to the end of the month, counting today; 0 once it is over. */
export function daysLeftInMonth(key: MonthKey, calendar: CalendarSystem = activeCalendar): number {
  return Math.max(0, daysBetween(today(), monthRange(key, calendar).end));
}

export function formatMonth(
  key: MonthKey,
  style: 'long' | 'short' = 'long',
  calendar: CalendarSystem = activeCalendar
): string {
  const [y, m] = key.split('-').map(Number);
  if (calendar === 'bs') {
    const name = BS_MONTHS[m - 1] ?? '';
    return style === 'short' ? name.slice(0, 3) : `${name} ${y}`;
  }
  const date = new Date(y, m - 1, 1);
  if (style === 'short') return date.toLocaleDateString(undefined, { month: 'short' });
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDay(key: DayKey, calendar: CalendarSystem = activeCalendar): string {
  const now = today();
  if (key === now) return 'Today';
  if (key === addDays(now, -1)) return 'Yesterday';
  const date = fromDayKey(key);
  if (calendar === 'bs') {
    const bs = toBs(key);
    const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
    const sameYear = bs.y === toBs(now).y;
    return `${weekday}, ${BS_MONTHS[bs.m - 1]} ${bs.d}${sameYear ? '' : `, ${bs.y}`}`;
  }
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? null : { year: 'numeric' }),
  });
}

export type CalendarCell = {
  /** AD day key of this cell. */
  day: DayKey;
  /** Day number in the BS month (1-32). */
  bsDay: number;
  /** Day number in the AD month, shown small for reference. */
  adDay: number;
};

/**
 * The days of a BS month laid out for a Sunday-first week grid: `leading`
 * empty cells, then one cell per day. Used by the BS date picker.
 */
export function bsMonthGrid(month: MonthKey): { leading: number; cells: CalendarCell[] } {
  const { start, end } = monthRange(month, 'bs');
  const length = daysBetween(start, end);
  const cells = Array.from({ length }, (_, i) => {
    const day = addDays(start, i);
    return { day, bsDay: i + 1, adDay: fromDayKey(day).getDate() };
  });
  return { leading: fromDayKey(start).getDay(), cells };
}

/** The BS month ("YYYY-MM") a day falls in. */
export function bsMonthOf(day: DayKey): MonthKey {
  const { y, m } = toBs(day);
  return `${y}-${pad(m)}`;
}
