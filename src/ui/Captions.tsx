import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export const SUGGESTIONS = [
  'Explain how a rainbow forms',
  'Set a timer for ten minutes',
  'Tell me a fun fact about space',
];

interface Props {
  user: string;
  reply: string;
  ready: boolean;
  onSuggest: (text: string) => void;
}

/** What you said (small, dim) and what Vaani is saying (large). Empty state offers a few things to try. */
export function Captions({ user, reply, ready, onSuggest }: Props) {
  if (!user && !reply) {
    return (
      <View style={styles.center}>
        <Text style={styles.greeting}>Hi, I&apos;m Vaani</Text>
        <Text style={styles.greetingSub}>
          Ask me anything in English or Hinglish. I can also set alarms, reminders and timers, and check the
          weather and your calendar.
        </Text>
        {ready && (
          <View style={styles.chips}>
            {SUGGESTIONS.map((t) => (
              <Pressable
                key={t}
                onPress={() => onSuggest(t)}
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.chipText}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {!!user && <Text style={styles.user}>{user}</Text>}
      {!!reply && <Text style={styles.reply}>{reply}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  greeting: { color: colors.text, fontSize: 26, fontWeight: '700' },
  greetingSub: {
    color: colors.dim,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  chips: { marginTop: 18, gap: 8, alignItems: 'center' },
  chip: {
    backgroundColor: colors.raised,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.text, fontSize: 14 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  user: { color: colors.dim, fontSize: 16, lineHeight: 23, textAlign: 'center', marginBottom: 14 },
  reply: { color: colors.text, fontSize: 24, lineHeight: 34, fontWeight: '500', textAlign: 'center' },
});
