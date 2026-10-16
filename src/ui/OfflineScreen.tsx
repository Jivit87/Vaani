import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { Runtime } from '../session/runtime';
import { Button } from './Button';
import { colors, s } from './theme';

const LINES = {
  en: 'This sentence is spoken entirely on the phone, with no internet.',
  hi: 'यह आवाज़ पूरी तरह फ़ोन पर बन रही है, इंटरनेट के बिना।',
};

/** Probes real connectivity so the airplane-mode demo has on-screen proof. */
async function networkReachable(): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    await fetch('https://clients3.google.com/generate_204', { signal: ctl.signal, cache: 'no-store' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function OfflineScreen({ runtime }: { runtime: Runtime | null }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [heard, setHeard] = useState<string[]>([]);
  const [listening, setListening] = useState(false);

  const probe = async () => setOnline(await networkReachable());
  useEffect(() => {
    let alive = true;
    void networkReachable().then((v) => alive && setOnline(v));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!runtime) return;
    const off = runtime.onHeard((t) => setHeard((h) => [t, ...h].slice(0, 8)));
    return () => {
      off();
      runtime.agent.setMode('agent'); // never leave the agent stuck in transcribe-only mode
    };
  }, [runtime]);

  if (!runtime)
    return (
      <View style={[s.screen, s.pad]}>
        <Text style={s.dim}>Open the Agent tab first so the engines load.</Text>
      </View>
    );

  return (
    <View style={[s.screen, s.pad, { gap: 12 }]}>
      <Text style={s.h1}>Offline test</Text>
      <Text style={s.dim}>
        Turn on airplane mode, then try both buttons. Neither one touches the network.
      </Text>
      <View style={[s.card, s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.text}>
          Internet reachable:{' '}
          <Text style={{ color: online === null ? colors.dim : online ? colors.warn : colors.ok }}>
            {online === null ? 'checking…' : online ? 'YES' : 'NO (offline)'}
          </Text>
        </Text>
        <Button title="Re-check" ghost onPress={() => void probe()} />
      </View>

      <View style={s.card}>
        <Text style={s.h2}>Speech → text (on-device Whisper)</Text>
        <Button
          title={listening ? 'Stop (agent mode)' : 'Transcribe only (no LLM)'}
          onPress={() => {
            const on = !listening;
            runtime.agent.setMode(on ? 'transcribe' : 'agent');
            setListening(on);
          }}
        />
        <Text style={s.dim}>
          While on, what Whisper hears is listed below and nothing is sent to the LLM.
        </Text>
        {heard.map((h, i) => (
          <Text key={i} style={s.text}>
            • {h}
          </Text>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.h2}>Text → speech (on-device Kokoro)</Text>
        <View style={s.row}>
          <Button title="Speak English" onPress={() => void runtime.speakDirect(LINES.en)} />
          <Button title="Speak Hindi" onPress={() => void runtime.speakDirect(LINES.hi)} />
        </View>
      </View>
    </View>
  );
}
