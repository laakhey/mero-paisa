import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Button, Text } from '@/components/ui/primitives';
import { needsRelock } from '@/lib/app-lock';
import { useSettings } from '@/providers/settings';
import { space } from '@/theme/tokens';

export async function canUseAppLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Covers the app with a lock screen until biometrics (or the device passcode)
 * succeed.
 *
 * Opening the app always asks. After that, leaving for another app and coming
 * back within a short grace period (see `LOCK_GRACE_MS`) does not ask again;
 * staying away longer does. While the app is in the background its content is
 * hidden behind a plain cover, so it is not readable from the app switcher.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { appLock } = useSettings();
  const enabled = appLock && Platform.OS !== 'web';
  const [locked, setLocked] = useState(enabled);
  const [hidden, setHidden] = useState(false);
  const prompting = useRef(false);
  const leftAt = useRef<number | null>(null);
  const lockedRef = useRef(locked);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await authenticate('Unlock Mero Paisa');
    prompting.current = false;
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      // The system biometric sheet itself makes the app "inactive"; only a
      // real trip to the background counts as leaving.
      if (state === 'background') {
        leftAt.current = Date.now();
        setHidden(true);
        return;
      }
      if (state !== 'active') return;

      const relock = leftAt.current !== null && needsRelock(leftAt.current, Date.now());
      leftAt.current = null;
      setHidden(false);
      if (lockedRef.current) {
        // Already locked when the user left: the prompt could not show in the
        // background, so ask now.
        unlock();
      } else if (relock) {
        // Mounting the lock cover shows the prompt.
        setLocked(true);
      }
    });
    return () => subscription.remove();
  }, [enabled, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && locked ? <LockCover onUnlock={unlock} /> : enabled && hidden ? <PrivacyCover /> : null}
    </View>
  );
}

/** Hides the app's content while it is in the background, without asking for anything. */
function PrivacyCover() {
  const { colors } = useSettings();
  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.primaryMuted }]}>
        <Icon name="lock" size={32} color={colors.primary} />
      </View>
    </View>
  );
}

/** Mounting the cover is what triggers the prompt, so every lock asks exactly once. */
function LockCover({ onUnlock }: { onUnlock: () => void }) {
  const { colors } = useSettings();
  useEffect(() => {
    if (AppState.currentState === 'active') onUnlock();
  }, [onUnlock]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.primaryMuted }]}>
        <Icon name="lock" size={32} color={colors.primary} />
      </View>
      <Text variant="title" center>
        Mero Paisa is locked
      </Text>
      <Text color="textSecondary" center>
        Authenticate to view your finances.
      </Text>
      <Button title="Unlock" icon="lock" onPress={onUnlock} style={{ marginTop: space.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
});
