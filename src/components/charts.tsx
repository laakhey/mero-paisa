import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/primitives';
import { useTheme } from '@/providers/settings';
import { space } from '@/theme/tokens';

export type DonutSlice = { key: string; value: number; color: string };

/**
 * Collapses everything after the largest `max - 1` slices into "Other" so the
 * ring stays readable no matter how many categories exist.
 */
export function topSlices<T extends { total: number }>(items: T[], max: number): { top: T[]; rest: number } {
  if (items.length <= max) return { top: items, rest: 0 };
  const top = items.slice(0, max - 1);
  const rest = items.slice(max - 1).reduce((sum, item) => sum + item.total, 0);
  return { top, rest };
}

export function DonutChart({
  slices,
  size = 168,
  thickness = 22,
  children,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const colors = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  // A small gap between segments; skipped when a single slice fills the ring.
  const gap = slices.length > 1 ? 3 : 0;
  const arcs = slices.map((slice, index) => {
    const length = total > 0 ? (slice.value / total) * circumference : 0;
    const start = slices.slice(0, index).reduce((sum, s) => sum + (s.value / total) * circumference, 0);
    return { ...slice, start, dash: Math.max(0, length - gap) };
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceMuted} strokeWidth={thickness} fill="none" />
        {total > 0 ? (
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {arcs.map((arc) => (
              <Circle
                key={arc.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={arc.color}
                strokeWidth={thickness}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.start}
                fill="none"
              />
            ))}
          </G>
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

export type BarGroup = { key: string; label: string; income: number; expense: number };

export function IncomeExpenseBars({
  groups,
  height = 150,
  selectedKey,
}: {
  groups: BarGroup[];
  height?: number;
  selectedKey?: string;
}) {
  const colors = useTheme();
  const max = Math.max(1, ...groups.flatMap((g) => [g.income, g.expense]));
  const barWidth = 10;
  const barGap = 4;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
      {groups.map((group) => {
        const incomeHeight = Math.max(2, (group.income / max) * height);
        const expenseHeight = Math.max(2, (group.expense / max) * height);
        const selected = group.key === selectedKey;
        return (
          <View key={group.key} style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
            <Svg width={barWidth * 2 + barGap} height={height}>
              <Rect
                x={0}
                y={height - incomeHeight}
                width={barWidth}
                height={incomeHeight}
                rx={barWidth / 2}
                fill={colors.income}
                opacity={selected || !selectedKey ? 1 : 0.45}
              />
              <Rect
                x={barWidth + barGap}
                y={height - expenseHeight}
                width={barWidth}
                height={expenseHeight}
                rx={barWidth / 2}
                fill={colors.expense}
                opacity={selected || !selectedKey ? 1 : 0.45}
              />
            </Svg>
            <Text variant="caption" color={selected ? 'text' : 'textTertiary'}>
              {group.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export type MonthBar = { key: string; label: string; value: number };

/** Single-series monthly bars; tapping a bar selects that month. */
export function MonthBars({
  bars,
  color,
  selectedKey,
  onSelect,
  formatValue,
  height = 120,
}: {
  bars: MonthBar[];
  color: string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  /** Used for the screen-reader label of each bar. */
  formatValue: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
      {bars.map((bar) => {
        const selected = bar.key === selectedKey;
        const barHeight = Math.max(3, (bar.value / max) * height);
        return (
          <Pressable
            key={bar.key}
            accessibilityRole="button"
            accessibilityLabel={`${bar.label}, ${formatValue(bar.value)}`}
            accessibilityState={{ selected }}
            disabled={!onSelect}
            onPress={() => onSelect?.(bar.key)}
            style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
            <View style={{ height, width: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
              <View
                style={{
                  width: 18,
                  height: barHeight,
                  borderRadius: 9,
                  backgroundColor: color,
                  opacity: selected || !selectedKey ? 1 : 0.4,
                }}
              />
            </View>
            <Text variant="caption" color={selected ? 'text' : 'textTertiary'}>
              {bar.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
          <Text variant="caption" color="textSecondary">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
