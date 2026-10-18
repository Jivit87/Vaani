import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Lang, TraceEvent } from '../agent/types';
import { config } from '../config';
import { toCsv, type TurnMetrics } from '../pipeline/metrics';
import type { AgentStatus } from '../pipeline/voiceAgent';
import { ensureMicPermission, ensureToolPermissions } from '../session/permissions';
import { isPackComplete } from '../speech/download';
import { expoFsOps } from '../speech/fsOps';
import { getPack } from '../speech/packs';
import type { TtsEngineChoice } from '../speech/ttsSelect';
import { createRuntime, packDir, type Runtime } from '../session/runtime';
import { BenchmarkScreen } from './BenchmarkScreen';
import { Button } from './Button';
import { Captions } from './Captions';
import { ControlBar } from './ControlBar';
import { ArrowUpIcon, CloseIcon } from './icons';
import { LatencyOverlay } from './LatencyOverlay';
import { OfflineScreen } from './OfflineScreen';
import { Orb } from './Orb';
import { DevScroll, FullSheet, MenuSheet, TranscriptList, type Line, type SheetName } from './Sheets';
import { colors } from './theme';

const LABEL: Record<AgentStatus, string> = {
  idle: 'Getting ready…',
  listening: 'Listening',
  muted: 'Microphone is off',
  thinking: 'Thinking…',
  acting: 'Working on it…',
  speaking: 'Speaking',
  error: 'Something went wrong',
};

export function VoiceScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState<Lang>('en');
  const [voice, setVoice] = useState<TtsEngineChoice>(config.ttsEngine);
  const [naturalAvailable, setNaturalAvailable] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [userText, setUserText] = useState('');
  const [reply, setReply] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [turns, setTurns] = useState<TurnMetrics[]>([]);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [attempt, setAttempt] = useState(0);
  const rt = useRef<Runtime | null>(null);
  const nextId = useRef(1);

  const addLine = useCallback((who: Line['who'], text: string) => {
    if (!text.trim()) return;
    setLines((l) => [...l, { id: nextId.current++, who, text }].slice(-80));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await ensureMicPermission())) {
          setNeedsPermission(true);
          throw new Error('Vaani needs the microphone to hear you.');
        }
        await ensureToolPermissions();
        const created = await createRuntime(lang, {
          onStatus: setStatus,
          onTranscript: (t) => {
            setUserText(t);
            setReply('');
            addLine('you', t);
          },
          onSpeaking: (sentence) => setReply((r) => (r ? `${r} ${sentence}` : sentence)),
          onReply: (t) => {
            setReply(t);
            addLine('agent', t);
          },
          onTrace: (e) => setTrace((x) => [...x, e].slice(-20)),
          onMetrics: (m) => setTurns((x) => [...x, m]),
        });
        if (cancelled) return void (await created.destroy());
        rt.current = created;
        setRuntime(created);
        await created.agent.start();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void rt.current?.destroy();
      rt.current = null;
      setRuntime(null);
    };
    // the runtime is created once per attempt, language changes go through setLanguage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // only offer the "Natural" voice when its files are already on the phone
  useEffect(() => {
    const kokoro = getPack('kokoro-int8-multi-lang-v1_0');
    void isPackComplete(kokoro, packDir(kokoro.id as never), expoFsOps).then(setNaturalAvailable);
  }, []);

  const switchVoice = async (next: TtsEngineChoice) => {
    if (next === voice || switching) return;
    setSwitching(true);
    setStatus('thinking');
    try {
      await rt.current?.setTtsEngine(next);
      setVoice(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      setSwitching(false);
    }
  };

  const switchLang = async (next: Lang) => {
    if (next === lang || switching) return;
    setSwitching(true);
    setStatus('thinking');
    try {
      await rt.current?.setLanguage(next);
      setLang(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    } finally {
      setSwitching(false);
    }
  };

  const retry = () => {
    setError(null);
    setNeedsPermission(false);
    setStatus('idle');
    setAttempt((a) => a + 1);
  };

  const ready = !!runtime && status !== 'error';
  const submit = (text: string) => {
    const t = text.trim();
    if (!t || !rt.current) return;
    void rt.current.agent.submitText(t);
    setTyped('');
    setTyping(false); // back to the voice view, the reply shows up there
  };

  const onMain = () => {
    const agent = rt.current?.agent;
    if (!agent) return;
    if (status === 'thinking' || status === 'acting' || status === 'speaking') void agent.interrupt();
    else if (status === 'listening') agent.setMuted(true);
    else if (status === 'muted') agent.setMuted(false);
  };

  const newConversation = () => {
    rt.current?.memory.reset();
    setUserText('');
    setReply('');
    setLines([]);
    setMenu(false);
  };

  const open = (s: SheetName) => {
    setMenu(false);
    setSheet(s);
  };

  return (
    // padding (not height) is what works with android's edge-to-edge layout, the screen moves up with the keyboard
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={[styles.screen, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.header}>
          <Text style={styles.brand}>Vaani</Text>
          <Pressable
            onPress={() => void switchLang(lang === 'en' ? 'hi' : 'en')}
            disabled={switching || !runtime}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            style={({ pressed }) => [styles.langChip, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.langText}>{lang === 'en' ? 'English' : 'हिन्दी · Hinglish'}</Text>
          </Pressable>
        </View>

        <View style={styles.orbArea}>
          <Orb status={switching ? 'thinking' : status} size={typing ? 112 : 168} />
          <Text style={[styles.status, status === 'error' && { color: colors.err }]}>
            {switching ? 'Switching language…' : LABEL[status]}
          </Text>
        </View>

        <View style={styles.captions}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <View style={styles.row}>
                {needsPermission && (
                  <Button title="Open settings" ghost onPress={() => void Linking.openSettings()} />
                )}
                <Button title="Try again" onPress={retry} />
              </View>
            </View>
          ) : (
            <Captions user={userText} reply={reply} ready={ready} compact={typing} onSuggest={submit} />
          )}
        </View>

        {typing && (
          <View style={styles.typeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to voice"
              onPress={() => setTyping(false)}
              style={styles.typeClose}
            >
              <CloseIcon size={20} color={colors.text} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={setTyped}
              placeholder="Message Vaani"
              placeholderTextColor={colors.dim}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => submit(typed)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={() => submit(typed)}
              style={[styles.send, !typed.trim() && { opacity: 0.4 }]}
            >
              <ArrowUpIcon size={22} color={colors.bg} />
            </Pressable>
          </View>
        )}

        {!typing && (
          <ControlBar
            status={status}
            typing={typing}
            onKeyboard={() => setTyping(true)}
            onMain={onMain}
            onMenu={() => setMenu(true)}
          />
        )}

        <MenuSheet
          visible={menu}
          lang={lang}
          switching={switching}
          canExport={turns.length > 0}
          onClose={() => setMenu(false)}
          onLang={(l) => {
            setMenu(false);
            void switchLang(l);
          }}
          voice={voice}
          naturalAvailable={naturalAvailable}
          onVoice={(v) => {
            setMenu(false);
            void switchVoice(v);
          }}
          onNew={newConversation}
          onOpen={open}
          onExport={() => void Share.share({ message: toCsv(turns), title: 'vaani-latency.csv' })}
        />
        <FullSheet title="Transcript" visible={sheet === 'transcript'} onClose={() => setSheet(null)}>
          <TranscriptList lines={lines} />
        </FullSheet>
        <FullSheet title="Latency and trace" visible={sheet === 'latency'} onClose={() => setSheet(null)}>
          <DevScroll>
            <LatencyOverlay turns={turns} trace={trace} />
          </DevScroll>
        </FullSheet>
        <FullSheet title="Offline test" visible={sheet === 'offline'} onClose={() => setSheet(null)}>
          <OfflineScreen runtime={runtime} />
        </FullSheet>
        <FullSheet title="Speech benchmark" visible={sheet === 'benchmark'} onClose={() => setSheet(null)}>
          <BenchmarkScreen />
        </FullSheet>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 6,
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: 0.4 },
  langChip: {
    backgroundColor: colors.raised,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  orbArea: { alignItems: 'center', justifyContent: 'center' },
  status: { color: colors.dim, fontSize: 14, marginTop: -34, letterSpacing: 0.3 },
  captions: { flex: 1, marginTop: 6 },
  row: { flexDirection: 'row', gap: 10 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  errorText: { color: colors.text, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingBottom: 10 },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.raised,
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 16,
  },
  typeClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
