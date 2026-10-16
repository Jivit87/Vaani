import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { packDir } from '../session/runtime';
import { listRecordings, listWhisperModels, runBenchmark } from '../benchmark/runner';
import { toNativePath } from '../speech/fsOps';
import { Button } from './Button';
import { colors, s } from './theme';

export function BenchmarkScreen() {
  const [models, setModels] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [log, setLog] = useState('');
  const [json, setJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setModels(listWhisperModels());
    setFiles(listRecordings());
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await runBenchmark(
        models,
        files,
        toNativePath(`${packDir('silero-vad')}/silero_vad.onnx`),
        setLog,
        'android',
      );
      setJson(JSON.stringify(out, null, 1));
      setLog(`Done: ${out.rows.length} decodes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 10 }]}>
      <Text style={s.h1}>STT benchmark</Text>
      <Text style={s.dim}>
        Put en_*.wav / hi_*.wav (16 kHz mono) in the app&apos;s benchmark/audio folder and extra Whisper
        folders under models/ (see README). Close the Agent tab&apos;s mic first for clean timings.
      </Text>
      <Button title="Scan device" ghost onPress={refresh} />
      <Text style={s.mono}>models: {models.join(', ') || 'none'}</Text>
      <Text style={s.mono}>recordings: {files.length}</Text>
      <Button
        title={busy ? 'Running…' : 'Run benchmark'}
        disabled={busy || !models.length || !files.length}
        onPress={() => void run()}
      />
      {!!log && <Text style={s.text}>{log}</Text>}
      {error && <Text style={{ color: colors.err }}>{error}</Text>}
      {json && (
        <Button
          title="Share results JSON"
          onPress={() => void Share.share({ message: json, title: 'benchmark_results.json' })}
        />
      )}
      <View />
    </ScrollView>
  );
}
