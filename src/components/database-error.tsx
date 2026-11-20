import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { palette, radius, space, typography } from '@/theme/tokens';

/**
 * Shown when the database cannot be opened. It renders outside the settings
 * provider (which itself needs the database), so it reads the palette directly.
 */
export function DatabaseError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const colors = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
  // On web the database file is exclusively locked by whichever tab opened it first.
  const lockedByAnotherTab = Platform.OS === 'web' && /access handle/i.test(error.message);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.title, styles.center, { color: colors.text }]} accessibilityRole="header">
        {lockedByAnotherTab ? 'Open in another tab' : "Couldn't open your data"}
      </Text>
      <Text style={[typography.body, styles.center, { color: colors.textSecondary }]}>
        {lockedByAnotherTab
          ? 'Mero Paisa is already open in another tab or window. Close it there, then try again.'
          : 'Something went wrong while opening the database. Your data has not been changed.'}
      </Text>
      {lockedByAnotherTab ? null : (
        <Text style={[typography.caption, styles.center, { color: colors.textTertiary }]} selectable>
          {error.message}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[typography.bodyStrong, { color: colors.onPrimary }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  center: { textAlign: 'center', maxWidth: 420 },
  button: {
    minHeight: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
});
