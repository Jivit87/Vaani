import { useEffect, useRef, useState } from 'react';
import { FlatList, Share, Text, TextInput, View } from 'react-native';
import { createRuntime, type Runtime } from '../session/runtime';
import { ensureMicPermission, ensureToolPermissions } from '../session/permissions';
import type { Lang, TraceEvent } from '../agent/types';
import { toCsv, type TurnMetrics } from '../pipeline/metrics';
import type { AgentStatus } from '../pipeline/voiceAgent';
import { Button } from './Button';
import { LatencyOverlay } from './LatencyOverlay';
import { colors, s } from './theme';

interface Line {
  id: number;
  who: 'you' | 'agent';
  text: string;
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: colors.dim,
  listening: colors.ok,
  thinking: colors.warn,
  acting: colors.warn,
  speaking: colors.accent,
  error: colors.err,
};

export function AgentScreen({ onRuntime }: { onRuntime: (r: Runtime | null) => void }) {
  const [lang, setLang] = useState<Lang>('hi');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [turns, setTurns] = useState<TurnMetrics[]>([]);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const rt = useRef<Runtime | null>(null);
  const nextId = useRef(1);

  const add = (who: Line['who'], text: string) =>
    setLines((l) => [...l, { id: nextId.current++, who, text }].slice(-60));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await ensureMicPermission())) throw new Error('Microphone permission is required.');
        await ensureToolPermissions();
        const runtime = await createRuntime(lang, {
          onStatus: setStatus,
          onTranscript: (t) => add('you', t),
          onReply: (t) => add('agent', t),
          onTrace: (e) => setTrace((x) => [...x, e].slice(-20)),
          onMetrics: (m) => setTurns((x) => [...x, m]),
        });
        if (cancelled) return void (await runtime.destroy());
        rt.current = runtime;
        onRuntime(runtime);
        await runtime.agent.start();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      void rt.current?.destroy();
      rt.current = null;
      onRuntime(null);
    };
    // The runtime is created once; language changes go through setLanguage below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchLang = async (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    setStatus('thinking');
    try {
      await rt.current?.setLanguage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <View style={[s.screen, s.pad, { gap: 10 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={s.row}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLOR[status] }} />
          <Text style={s.text}>{status}</Text>
        </View>
        <View style={s.row}>
          <Button title="English" ghost={lang !== 'en'} onPress={() => void switchLang('en')} />
          <Button title="Hinglish" ghost={lang !== 'hi'} onPress={() => void switchLang('hi')} />
        </View>
      </View>
      {error && <Text style={{ color: colors.err }}>{error}</Text>}

      <FlatList
        style={{ flex: 1 }}
        data={lines}
        keyExtractor={(l) => String(l.id)}
        renderItem={({ item }) => (
          <Text style={[s.text, { marginVertical: 3, color: item.who === 'you' ? colors.dim : colors.text }]}>
            {item.who === 'you' ? 'You: ' : 'Agent: '}
            {item.text}
          </Text>
        )}
        ListEmptyComponent={
          <Text style={s.dim}>Say something, or type below. The mic pauses while the agent speaks.</Text>
        }
      />

      <LatencyOverlay turns={turns} trace={trace} />

      <View style={s.row}>
        <TextInput
          style={s.input}
          value={typed}
          onChangeText={setTyped}
          placeholder="Type instead of speaking"
          placeholderTextColor={colors.dim}
          onSubmitEditing={() => {
            if (typed.trim()) void rt.current?.agent.submitText(typed);
            setTyped('');
          }}
        />
        <Button title="Stop" ghost onPress={() => void rt.current?.agent.interrupt()} />
      </View>
      <View style={s.row}>
        <Button
          title="New chat"
          ghost
          onPress={() => {
            rt.current?.memory.reset();
            setLines([]);
          }}
        />
        <Button
          title="Export CSV"
          ghost
          disabled={!turns.length}
          onPress={() => void Share.share({ message: toCsv(turns), title: 'latency.csv' })}
        />
      </View>
    </View>
  );
}
