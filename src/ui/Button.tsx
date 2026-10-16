import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, s } from './theme';

export function Button(p: {
  title: string;
  onPress: () => void;
  ghost?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!p.disabled }}
      disabled={p.disabled}
      onPress={p.onPress}
      style={({ pressed }) => [
        p.ghost ? s.btnGhost : s.btn,
        (p.disabled || pressed) && { opacity: 0.55 },
        p.style,
      ]}
    >
      <Text style={[s.btnText, p.ghost && { color: colors.text }]}>{p.title}</Text>
    </Pressable>
  );
}
