import type { ReactNode } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lang } from '../agent/types';
import type { TtsEngineChoice } from '../speech/ttsSelect';
import { CloseIcon } from './icons';
import { colors } from './theme';

export interface Line {
  id: number;
  who: 'you' | 'agent';
  text: string;
}

export type SheetName = 'transcript' | 'latency' | 'offline' | 'benchmark';

interface MenuProps {
  visible: boolean;
  lang: Lang;
  switching: boolean;
  canExport: boolean;
  onClose: () => void;
  onLang: (l: Lang) => void;
  voice: TtsEngineChoice;
  /** False when the other voice's files are not on the phone yet. */
  naturalAvailable: boolean;
  onVoice: (v: TtsEngineChoice) => void;
  onNew: () => void;
  onOpen: (s: SheetName) => void;
  onExport: () => void;
}

/** Bottom sheet: language, conversation, and a Developer section for the measurement tools. */
export function MenuSheet(p: MenuProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={p.visible}
      transparent
      animationType="slide"
      onRequestClose={p.onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={p.onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.grab} />
        <Text style={styles.sectionLabel}>Language</Text>
        <View style={styles.seg}>
          {(
            [
              ['en', 'English'],
              ['hi', 'हिन्दी · Hinglish'],
            ] as [Lang, string][]
          ).map(([l, label]) => (
            <Pressable
              key={l}
              disabled={p.switching}
              onPress={() => p.onLang(l)}
              style={[styles.segItem, p.lang === l && styles.segOn]}
              accessibilityState={{ selected: p.lang === l }}
            >
              <Text style={[styles.segText, p.lang === l && { color: colors.bg, fontWeight: '700' }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>Sets both what Vaani listens for and the language it answers in.</Text>

        <Text style={styles.sectionLabel}>Voice</Text>
        <View style={styles.seg}>
          {(
            [
              ['piper', 'Fast'],
              ['kokoro', 'Natural'],
            ] as [TtsEngineChoice, string][]
          ).map(([v, label]) => {
            const off = p.switching || (v === 'kokoro' && !p.naturalAvailable);
            return (
              <Pressable
                key={v}
                disabled={off}
                onPress={() => p.onVoice(v)}
                style={[
                  styles.segItem,
                  p.voice === v && styles.segOn,
                  off && v !== p.voice && { opacity: 0.4 },
                ]}
                accessibilityState={{ selected: p.voice === v }}
              >
                <Text style={[styles.segText, p.voice === v && { color: colors.bg, fontWeight: '700' }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {p.naturalAvailable
            ? 'Fast speaks without pauses. Natural sounds richer but pauses between sentences on this phone.'
            : 'Fast speaks without pauses. Natural needs a one-time extra download.'}
        </Text>

        <Text style={styles.sectionLabel}>Conversation</Text>
        <Row title="New conversation" onPress={p.onNew} />
        <Row title="Transcript" onPress={() => p.onOpen('transcript')} />

        <Text style={styles.sectionLabel}>Developer</Text>
        <Row title="Latency and agent trace" onPress={() => p.onOpen('latency')} />
        <Row title="Offline test" onPress={() => p.onOpen('offline')} />
        <Row title="Speech benchmark" onPress={() => p.onOpen('benchmark')} />
        <Row title="Export latency CSV" onPress={p.onExport} disabled={!p.canExport} />
        <Text style={styles.footer}>
          Speech recognition and voice run on this phone. Only text goes to the cloud.
        </Text>
      </View>
    </Modal>
  );
}

function Row({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, (pressed || disabled) && { opacity: 0.5 }]}
    >
      <Text style={styles.rowText}>{title}</Text>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

/** Full-screen panel with a close button; hosts the transcript and the developer tools. */
export function FullSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.full, { paddingTop: insets.top + 6, paddingBottom: insets.bottom }]}>
        <View style={styles.fullHead}>
          <Text style={styles.fullTitle}>{title}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.closeBtn}
          >
            <CloseIcon size={22} color={colors.text} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

export function TranscriptList({ lines }: { lines: Line[] }) {
  if (!lines.length)
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.dim, fontSize: 15 }}>Nothing said yet.</Text>
      </View>
    );
  return (
    <FlatList
      data={lines}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={{ padding: 20, gap: 14 }}
      renderItem={({ item }) =>
        item.who === 'you' ? (
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        ) : (
          <Text style={styles.agentText}>{item.text}</Text>
        )
      }
    />
  );
}

export function DevScroll({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  grab: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  sectionLabel: {
    color: colors.dim,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  seg: { flexDirection: 'row', backgroundColor: colors.raised, borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11 },
  segOn: { backgroundColor: colors.text },
  segText: { color: colors.text, fontSize: 15 },
  hint: { color: colors.dim, fontSize: 12, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { color: colors.text, fontSize: 16 },
  chev: { color: colors.dim, fontSize: 22 },
  footer: { color: colors.dim, fontSize: 12, marginTop: 14, lineHeight: 17 },
  full: { flex: 1, backgroundColor: colors.bg },
  fullHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  fullTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.raised,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  userText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  agentText: { color: colors.text, fontSize: 17, lineHeight: 26, maxWidth: '92%' },
});
