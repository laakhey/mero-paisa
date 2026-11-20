import {
  addDays,
  addMonths,
  bsMonthGrid,
  bsMonthOf,
  daysBetween,
  daysInMonth,
  formatMonth,
  fromBs,
  fromDayKey,
  monthRange,
  toBs,
  toDayKey,
} from '../dates';

describe('day keys', () => {
  it('round-trips local dates', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDayKey(fromDayKey('2026-12-31'))).toBe('2026-12-31');
  });
  it('steps across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('months', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('gives a half-open range', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });
  it('counts days', () => {
    expect(daysInMonth('2026-02', 'ad')).toBe(28);
    expect(daysInMonth('2028-02', 'ad')).toBe(29);
  });
});

describe('Bikram Sambat', () => {
  it('converts known new-year dates both ways', () => {
    // 1 Baisakh of 2080, 2081, 2082 and 2083 BS.
    expect(toBs('2023-04-14')).toEqual({ y: 2080, m: 1, d: 1 });
    expect(toBs('2024-04-13')).toEqual({ y: 2081, m: 1, d: 1 });
    expect(toBs('2025-04-14')).toEqual({ y: 2082, m: 1, d: 1 });
    expect(fromBs(2083, 1, 1)).toBe('2026-04-14');
    expect(toBs('2026-11-15')).toEqual({ y: 2083, m: 7, d: 29 });
  });
  it('gives each BS month its AD date range', () => {
    const range = monthRange('2083-07', 'bs');
    expect(toBs(range.start)).toEqual({ y: 2083, m: 7, d: 1 });
    expect(toBs(range.end)).toEqual({ y: 2083, m: 8, d: 1 });
    expect(daysInMonth('2083-07', 'bs')).toBe(daysBetween(range.start, range.end));
  });
  it('rolls BS months over the year end (Chaitra to Baisakh)', () => {
    expect(addMonths('2083-12', 1)).toBe('2084-01');
    expect(toBs(monthRange('2083-12', 'bs').end)).toEqual({ y: 2084, m: 1, d: 1 });
  });
  it('covers every day exactly once across consecutive BS months', () => {
    let total = 0;
    for (let m = 1; m <= 12; m++) total += daysInMonth(`2083-${String(m).padStart(2, '0')}`, 'bs');
    expect(total).toBe(daysBetween(fromBs(2083, 1, 1), fromBs(2084, 1, 1)));
    expect(total === 365 || total === 366).toBe(true);
  });
  it('names BS months', () => {
    expect(formatMonth('2083-07', 'long', 'bs')).toBe('Kartik 2083');
    expect(formatMonth('2083-07', 'short', 'bs')).toBe('Kar');
  });
});

describe('BS month grid', () => {
  it('lays out Kartik 2083 from its first day', () => {
    const { leading, cells } = bsMonthGrid('2083-07');
    const first = monthRange('2083-07', 'bs').start;
    expect(cells[0]).toEqual({ day: first, bsDay: 1, adDay: fromDayKey(first).getDate() });
    expect(leading).toBe(fromDayKey(first).getDay());
    expect(cells).toHaveLength(daysInMonth('2083-07', 'bs'));
    // 15 Nov 2026 is Kartik 29.
    expect(cells.find((c) => c.day === '2026-11-15')?.bsDay).toBe(29);
  });
  it('has consecutive days with no gaps', () => {
    const { cells } = bsMonthGrid('2083-01');
    cells.forEach((cell, i) => i > 0 && expect(daysBetween(cells[i - 1].day, cell.day)).toBe(1));
  });
  it('finds the BS month of a day', () => {
    expect(bsMonthOf('2026-11-15')).toBe('2083-07');
    expect(bsMonthOf('2026-04-14')).toBe('2083-01');
  });
});
