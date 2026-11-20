import * as Haptics from 'expo-haptics';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text as RNText,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScrollView, useKeyboardScope } from '@/components/keyboard';

import { useTheme } from '@/providers/settings';
import {
  hitTarget,
  maxContentWidth,
  radius,
  shadow,
  space,
  typography,
  type TextVariant,
  type ThemeColors,
} from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export function hapticTap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export function hapticSuccess() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

/* ------------------------------- Text ------------------------------- */

type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: keyof ThemeColors;
  /** Tabular digits keep columns of amounts aligned. */
  numeric?: boolean;
  center?: boolean;
};

export function Text({ variant = 'body', color = 'text', numeric, center, style, ...rest }: AppTextProps) {
  const colors = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: colors[color] },
        numeric && styles.numeric,
        center && styles.center,
        style,
      ]}
    />
  );
}

/* ------------------------------ Layout ------------------------------ */

type ScreenProps = ScrollViewProps & {
  /** Set for tab screens that draw their own header under the status bar. */
  padTop?: boolean;
  /** Extra bottom space, e.g. to clear a floating action button. */
  bottomSpace?: number;
};

export function Screen({ padTop, bottomSpace = 0, contentContainerStyle, children, ...rest }: ScreenProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <FormScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.background }, rest.style]}
      contentContainerStyle={[
        styles.screenContent,
        {
          paddingTop: (padTop ? insets.top : 0) + space.lg,
          paddingBottom: insets.bottom + space.xl + bottomSpace,
        },
        contentContainerStyle,
      ]}>
      {children}
    </FormScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useTheme();
  return (
    <View style={[styles.card, shadow, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Text variant="label" color="primary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider() {
  const colors = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

/* ------------------------------ Buttons ----------------------------- */

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = 'primary', icon, loading, disabled, style, onPress, ...rest }: ButtonProps) {
  const colors = useTheme();
  const background = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    danger: colors.expenseMuted,
    ghost: 'transparent',
  }[variant];
  const foreground = {
    primary: colors.onPrimary,
    secondary: colors.text,
    danger: colors.expense,
    ghost: colors.primary,
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={(event) => {
        hapticTap();
        onPress?.(event);
      }}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={foreground} /> : null}
          <RNText style={[typography.bodyStrong, { color: foreground }]}>{title}</RNText>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  filled,
}: {
  icon: IconName;
  /** Read by screen readers; icon-only buttons have no visible text. */
  label: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: filled ? colors.surfaceMuted : 'transparent', opacity: pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.fab,
        shadow,
        // The tab bar sits below the screen and already absorbs the bottom inset.
        { backgroundColor: colors.primary, bottom: space.lg, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}>
      <Icon name="add" size={26} color={colors.onPrimary} />
    </Pressable>
  );
}

/* --------------------------- Small elements ------------------------- */

export function IconBadge({ icon, color, size = 40 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // 8-digit hex: the category colour at ~12% opacity as a tinted backdrop.
        backgroundColor: `${color}22`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const colors = useTheme();
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.progressFill, { width: `${clamped * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                hapticTap();
                onChange(option.value);
              }
            }}
            style={[styles.segment, selected && [shadow, { backgroundColor: colors.surface }]]}>
            <Text variant="label" color={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  tint,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  tint?: string;
}) {
  const colors = useTheme();
  const accent = tint ?? colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[
        styles.chip,
        {
          borderColor: selected ? accent : colors.border,
          backgroundColor: selected ? `${accent}1F` : colors.surface,
        },
      ]}>
      {icon ? <Icon name={icon} size={16} color={selected ? accent : colors.textSecondary} /> : null}
      <Text variant="label" color={selected ? 'text' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primaryMuted }]}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      <Text color="textSecondary" center>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={{ marginTop: space.sm, alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}

/* ------------------------------- Forms ------------------------------ */

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" color="expense" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Input({ style, onFocus, ...rest }: TextInputProps) {
  const colors = useTheme();
  const keyboardScope = useKeyboardScope();
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textTertiary}
      {...rest}
      onFocus={(event) => {
        onFocus?.(event);
        // Lets the surrounding form scroll this field above the keyboard.
        keyboardScope?.fieldFocused(ref.current);
      }}
      style={[
        typography.body,
        styles.input,
        { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    />
  );
}

/** A tappable settings/list row with leading icon, title, optional value and chevron. */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  trailing,
  destructive,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}) {
  const colors = useTheme();
  const content = (
    <View style={styles.row}>
      {icon ? <IconBadge icon={icon} color={iconColor ?? (destructive ? colors.expense : colors.primary)} size={36} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={destructive ? 'expense' : 'text'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text color="textSecondary" numeric>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress && !trailing ? <Icon name="forward" size={16} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  numeric: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  screenContent: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  button: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: space.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  input: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hitTarget },
});
