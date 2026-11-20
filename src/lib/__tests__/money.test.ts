import { defaultNumberStyle, formatMoney, fractionDigits, parseAmount, ratio, toInputString } from '../money';

describe('fractionDigits', () => {
  it('follows the currency', () => {
    expect(fractionDigits('USD')).toBe(2);
    expect(fractionDigits('JPY')).toBe(0);
  });
  it('falls back to 2 for unknown codes', () => {
    expect(fractionDigits('not-a-currency')).toBe(2);
  });
});

describe('parseAmount', () => {
  it('parses whole and fractional input into minor units', () => {
    expect(parseAmount('12', 'USD')).toBe(1200);
    expect(parseAmount('12.5', 'USD')).toBe(1250);
    expect(parseAmount('.5', 'USD')).toBe(50);
    expect(parseAmount('1,234.56', 'USD')).toBe(123456);
  });
  it('avoids floating point drift', () => {
    expect(parseAmount('0.29', 'USD')).toBe(29);
    expect(parseAmount('1.15', 'USD')).toBe(115);
    expect(parseAmount('4.35', 'USD')).toBe(435);
  });
  it('respects zero-decimal currencies', () => {
    expect(parseAmount('500', 'JPY')).toBe(500);
    expect(parseAmount('500.5', 'JPY')).toBeNull();
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '.', 'abc', '-5', '1.234', '1.2.3', '1e3']) {
      expect(parseAmount(bad, 'USD')).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('round-trips through the input string', () => {
    expect(toInputString(123450, 'USD')).toBe('1234.50');
    expect(parseAmount(toInputString(123450, 'USD'), 'USD')).toBe(123450);
  });
  it('formats with sign handling', () => {
    expect(formatMoney(123456, 'USD', { locale: 'en-US' })).toBe('$1,234.56');
    expect(formatMoney(-500, 'USD', { locale: 'en-US' })).toBe('-$5.00');
    expect(formatMoney(500, 'USD', { locale: 'en-US', signed: true })).toBe('+$5.00');
    expect(formatMoney(0, 'USD', { locale: 'en-US', signed: true })).toBe('$0.00');
  });
});

describe('number style', () => {
  // The space after Rs is non-breaking, so the symbol never wraps away from the amount.
  it('defaults to lakh grouping for South Asian rupees', () => {
    expect(defaultNumberStyle('NPR')).toBe('lakh');
    expect(defaultNumberStyle('inr')).toBe('lakh');
    expect(defaultNumberStyle('USD')).toBe('international');
  });
  it('groups rupees in lakhs and crores with the Rs symbol', () => {
    expect(formatMoney(1234567850, 'NPR', { style: 'lakh' })).toBe('Rs\u00a01,23,45,678.50');
    expect(formatMoney(10000000, 'NPR', { style: 'lakh' })).toBe('Rs\u00a01,00,000.00');
    expect(formatMoney(-50000, 'NPR', { style: 'lakh' })).toBe('-Rs\u00a0500.00');
  });
  it('abbreviates in lakhs and crores', () => {
    expect(formatMoney(1234567850, 'NPR', { style: 'lakh', compact: true })).toBe('Rs\u00a01.2Cr');
    expect(formatMoney(25000000, 'NPR', { style: 'lakh', compact: true })).toBe('Rs\u00a02.5L');
  });
  it('uses international grouping when asked', () => {
    expect(formatMoney(10000000, 'NPR', { style: 'international', locale: 'en-US' })).toBe('Rs\u00a0100,000.00');
  });
});

describe('ratio', () => {
  it('is safe for zero totals and may exceed 1', () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(150, 100)).toBe(1.5);
  });
});
