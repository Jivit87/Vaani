import { Text, View } from 'react-native';
import { summarize, type TurnMetrics } from '../pipeline/metrics';
import type { TraceEvent } from '../agent/types';
import { s } from './theme';

const ms = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${Math.round(n)} ms`);

export function LatencyOverlay({ turns, trace }: { turns: TurnMetrics[]; trace: TraceEvent[] }) {
  const last = turns.at(-1);
  const sum = summarize(turns);
  return (
    <View style={[s.card, { gap: 2 }]} accessibilityLabel="Latency overlay">
      <Text style={s.h2}>Latency</Text>
      {last ? (
        <>
          <Text style={s.mono}>
            first audio {ms(last.firstAudioMs)} · llm ttft {ms(last.llmTtftMs)} · tools {ms(last.toolMs)} ·
            tts {ms(last.ttsFirstChunkMs)}
          </Text>
          <Text style={s.mono}>
            total {ms(last.totalMs)} · {last.model || 'no model'} · steps {last.llmSteps}
          </Text>
        </>
      ) : (
        <Text style={s.dim}>No turns yet.</Text>
      )}
      {last?.error && <Text style={[s.mono, { color: '#ff5c5c' }]}>error: {last.error}</Text>}
      <Text style={s.mono}>
        median first audio: direct {ms(sum.direct.median)} (n={sum.direct.n}) · tool {ms(sum.tool.median)} (n=
        {sum.tool.n})
      </Text>
      {trace.slice(-3).map((t, i) => (
        <Text key={i} style={s.mono}>
          → {t.name}({JSON.stringify(t.args)}) {'error' in t.result ? `✗ ${String(t.result.error)}` : '✓'}{' '}
          {Math.round(t.ms)} ms
        </Text>
      ))}
    </View>
  );
}
