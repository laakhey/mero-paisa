import { Platform } from 'react-native';

export const palette = {
  light: {
    background: '#F4F5F8',
    surface: '#FFFFFF',
    surfaceMuted: '#ECEEF3',
    border: '#E2E5EC',
    text: '#0F1222',
    textSecondary: '#5B6275',
    textTertiary: '#8B91A3',
    primary: '#4F46E5',
    primaryMuted: '#EAE9FD',
    onPrimary: '#FFFFFF',
    income: '#0E9F6E',
    incomeMuted: '#DEF7EC',
    expense: '#E02D4C',
    expenseMuted: '#FDE8EC',
    warning: '#D97706',
    warningMuted: '#FEF3C7',
    overlay: 'rgba(15, 18, 34, 0.45)',
  },
  dark: {
    background: '#0B0C12',
    surface: '#16181F',
    surfaceMuted: '#20232D',
    border: '#2A2E3A',
    text: '#F3F4F8',
    textSecondary: '#A6ACBD',
    textTertiary: '#737A8E',
    primary: '#8B85FF',
    primaryMuted: '#25234A',
    onPrimary: '#0B0C12',
    income: '#34D399',
    incomeMuted: '#0F2F26',
    expense: '#FB7185',
    expenseMuted: '#3A1620',
    warning: '#FBBF24',
    warningMuted: '#3A2A0B',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ThemeColors = { [K in keyof typeof palette.light]: string };

/** 4pt spacing grid. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Minimum touch target recommended by both Apple HIG (44pt) and Material (48dp). */
export const hitTarget = 48;

export const maxContentWidth = 640;

export const typography = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TextVariant = keyof typeof typography;

/** Colours offered when creating categories and accounts. */
export const swatches = [
  '#16A34A', '#0D9488', '#0891B2', '#2563EB', '#4F46E5', '#7C3AED',
  '#DB2777', '#DC2626', '#EA580C', '#CA8A04', '#64748B', '#0F172A',
] as const;

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(15,18,34,0.06), 0 4px 12px rgba(15,18,34,0.05)' },
  default: {
    shadowColor: '#0F1222',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
}) as object;
