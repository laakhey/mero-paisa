import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { hapticTap } from '@/components/ui/primitives';
import { useTheme } from '@/providers/settings';
import { space, swatches } from '@/theme/tokens';

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {swatches.map((swatch) => {
        const selected = swatch === value;
        return (
          <Pressable
            key={swatch}
            accessibilityRole="radio"
            accessibilityLabel={`Colour ${swatch}`}
            accessibilityState={{ selected }}
            onPress={() => {
              hapticTap();
              onChange(swatch);
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: swatch,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: selected ? 3 : 0,
              borderColor: colors.text,
            }}>
            {selected ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconPicker({
  icons,
  value,
  color,
  onChange,
}: {
  icons: IconName[];
  value: IconName;
  color: string;
  onChange: (icon: IconName) => void;
}) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {icons.map((icon) => {
        const selected = icon === value;
        return (
          <Pressable
            key={icon}
            accessibilityRole="radio"
            accessibilityLabel={`Icon ${icon}`}
            accessibilityState={{ selected }}
            onPress={() => {
              hapticTap();
              onChange(icon);
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? `${color}22` : colors.surface,
              borderWidth: 1,
              borderColor: selected ? color : colors.border,
            }}>
            <Icon name={icon} size={22} color={selected ? color : colors.textSecondary} />
          </Pressable>
        );
      })}
    </View>
  );
}
