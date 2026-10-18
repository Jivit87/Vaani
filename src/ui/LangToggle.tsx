import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Lang } from '../agent/types';
import { colors } from './theme';

const SEGMENT = 84;

// a two-way switch with a sliding thumb. it also moves by itself when the app notices you switched language
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const [x] = useState(() => new Animated.Value(lang === 'en' ? 0 : SEGMENT));

  useEffect(() => {
    const move = Animated.timing(x, {
      toValue: lang === 'en' ? 0 : SEGMENT,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    move.start();
    return () => move.stop();
  }, [lang, x]);

  const item = (value: Lang, label: string) => (
    <Pressable
      key={value}
      onPress={() => onChange(value)}
      accessibilityRole="button"
      accessibilityLabel={value === 'en' ? 'English' : 'Hindi'}
      accessibilityState={{ selected: lang === value }}
      style={styles.item}
    >
      <Text style={[styles.label, lang === value && styles.labelOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.thumb, { transform: [{ translateX: x }] }]} />
      {item('en', 'English')}
      {item('hi', 'हिन्दी')}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.raised,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: SEGMENT,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  item: { width: SEGMENT, height: 34, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.dim, fontSize: 14, fontWeight: '600' },
  labelOn: { color: colors.bg },
});
