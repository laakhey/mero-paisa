import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLockGate } from '@/components/app-lock';
import { DatabaseError } from '@/components/database-error';
import { DATABASE_NAME, migrate } from '@/db/migrations';
import { SettingsProvider, useSettings } from '@/providers/settings';
import { SyncProvider } from '@/sync/provider';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [error, setError] = useState<Error | null>(null);
  // Bumping the key remounts the provider, which reopens the database.
  const [attempt, setAttempt] = useState(0);

  const [deferError] = useState(() => (e: Error) => queueMicrotask(() => setError(e)));

  useEffect(() => {
    if (error) SplashScreen.hideAsync().catch(() => {});
  }, [error]);

  useEffect(() => {
    // Browsers may evict a site's storage under disk pressure unless it is marked persistent.
    if (Platform.OS === 'web') globalThis.navigator?.storage?.persist?.().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      {error ? (
        <DatabaseError
          error={error}
          onRetry={() => {
            // On web a failed open leaves the SQLite worker unusable, so only a full reload recovers.
            if (Platform.OS === 'web') return globalThis.location.reload();
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <SQLiteProvider
          key={attempt}
          databaseName={DATABASE_NAME}
          onInit={migrate}
          // The provider reports errors while rendering; defer the state update past that render.
          onError={deferError}>
          <SettingsProvider>
            <SyncProvider>
              <Navigation />
            </SyncProvider>
          </SettingsProvider>
        </SQLiteProvider>
      )}
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { colors, scheme } = useSettings();

  useEffect(() => {
    // Settings are loaded once this component mounts, so the first frame is real UI.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppLockGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="transaction"
            options={{ presentation: 'modal', title: 'Transaction' }}
          />
          <Stack.Screen name="budget" options={{ presentation: 'modal', title: 'Budget' }} />
          <Stack.Screen name="categories" options={{ title: 'Categories' }} />
          <Stack.Screen name="category" options={{ presentation: 'modal', title: 'Category' }} />
          <Stack.Screen name="labels" options={{ title: 'Labels' }} />
          <Stack.Screen name="split" options={{ title: 'Split bills' }} />
          <Stack.Screen name="split-group" options={{ title: 'Group' }} />
          <Stack.Screen name="split-group-edit" options={{ presentation: 'modal', title: 'Group' }} />
          <Stack.Screen name="split-expense" options={{ presentation: 'modal', title: 'Bill' }} />
          <Stack.Screen name="category-report" options={{ title: 'Category' }} />
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account' }} />
        </Stack>
      </AppLockGate>
    </ThemeProvider>
  );
}
