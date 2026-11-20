import { getLocales } from 'expo-localization';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { countTransactions, readSettings, writeSetting } from '@/db/repositories';
import { notifyDataChanged } from '@/db/store';
import { setActiveCalendar, type CalendarSystem } from '@/lib/dates';
import { defaultNumberStyle, formatMoney, type NumberStyle } from '@/lib/money';
import { palette, type ColorScheme, type ThemeColors } from '@/theme/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

type Settings = {
  currency: string;
  theme: ThemePreference;
  appLock: boolean;
  /** Digit grouping chosen by the user; null follows the currency (lakh for rupees). */
  numberStyle: NumberStyle | null;
  /** Which calendar months and dates use: Gregorian (AD) or Bikram Sambat (BS). */
  calendar: CalendarSystem;
  /** False until the first-run welcome screen has been completed or skipped. */
  onboarded: boolean;
  /** ISO timestamp of the last backup made on this device, or '' if never. */
  lastBackupAt: string;
};

type SettingsContextValue = Settings & {
  scheme: ColorScheme;
  colors: ThemeColors;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  /** Applies a currency that sync already stored, without marking it as a change made on this device. */
  adoptCurrency: (currency: string) => void;
  /** The digit grouping in effect: the user's choice, or the currency's default. */
  resolvedNumberStyle: NumberStyle;
  /** Formats minor units in the user's currency. */
  money: (minor: number, options?: Parameters<typeof formatMoney>[2]) => string;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function defaultCurrency(): string {
  try {
    return getLocales()[0]?.currencyCode ?? 'USD';
  } catch {
    return 'USD';
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSettings(db)
      .then(async (stored) => {
        let currency = stored.currency;
        if (!currency) {
          // Persist the locale default on first launch so a later change of
          // device region does not silently relabel existing amounts.
          currency = defaultCurrency();
          await writeSetting(db, 'currency', currency);
        }
        // Installs from before the welcome screen existed already have data:
        // never send them through first-run setup.
        let onboarded = stored.onboarded === '1';
        if (!onboarded && (await countTransactions(db)) > 0) {
          onboarded = true;
          await writeSetting(db, 'onboarded', '1');
        }
        if (cancelled) return;
        setSettings({
          onboarded,
          currency,
          theme: (stored.theme as ThemePreference) ?? 'system',
          appLock: stored.appLock === '1',
          calendar: stored.calendar === 'bs' ? 'bs' : 'ad',
          numberStyle:
            stored.numberStyle === 'lakh' || stored.numberStyle === 'international' ? stored.numberStyle : null,
          lastBackupAt: stored.lastBackupAt ?? '',
        });
      })
      .catch(() => {
        if (!cancelled) setSettings({
            currency: defaultCurrency(),
            theme: 'system',
            appLock: false,
            numberStyle: null,
            calendar: 'ad',
            onboarded: true,
            lastBackupAt: '',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const update = useCallback<SettingsContextValue['update']>(
    async (key, value) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
      await writeSetting(db, key, typeof value === 'boolean' ? (value ? '1' : '0') : value === null ? '' : String(value));
      // Every screen's numbers and month boundaries depend on these.
      if (key === 'calendar') notifyDataChanged();
      if (key === 'currency') {
        // Stamped so sync can tell which device changed the currency last.
        await writeSetting(db, 'currencyModifiedAt', new Date().toISOString());
        notifyDataChanged();
      }
    },
    [db]
  );

  const adoptCurrency = useCallback((currency: string) => {
    setSettings((prev) => (prev ? { ...prev, currency } : prev));
  }, []);

  const value = useMemo<SettingsContextValue | null>(() => {
    if (!settings) return null;
    const scheme: ColorScheme =
      settings.theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : settings.theme;
    return {
      ...settings,
      scheme,
      colors: palette[scheme],
      update,
      adoptCurrency,
      resolvedNumberStyle: settings.numberStyle ?? defaultNumberStyle(settings.currency),
      money: (minor, options) =>
        formatMoney(minor, settings.currency, {
          style: settings.numberStyle ?? defaultNumberStyle(settings.currency),
          ...options,
        }),
    };
  }, [settings, systemScheme, update, adoptCurrency]);

  if (!value) return null;
  // Applied while rendering, before any child reads a date helper.
  setActiveCalendar(value.calendar);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}

export function useTheme(): ThemeColors {
  return useSettings().colors;
}
