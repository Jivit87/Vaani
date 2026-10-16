import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { requiredPacks, packDir } from '../session/runtime';
import { ensurePack } from '../speech/download';
import { expoFsOps } from '../speech/fsOps';
import { packBytes, type PackId } from '../speech/packs';
import { Button } from './Button';
import { colors, s } from './theme';

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

export function ModelSetup({ onDone }: { onDone: () => void }) {
  const packs = requiredPacks();
  const total = packs.reduce((n, p) => n + packBytes(p), 0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      let base = 0;
      for (const p of packs) {
        setCurrent(p.id);
        await ensurePack(p, packDir(p.id as PackId), expoFsOps, {
          signal: ctl.current.signal,
          onProgress: (pr) => setDone(base + pr.bytesDone),
        });
        base += packBytes(p);
        setDone(base);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  return (
    <View style={[s.screen, s.pad, { gap: 12, justifyContent: 'center' }]}>
      <Text style={s.h1}>Download speech models</Text>
      <Text style={s.dim}>
        Speech recognition and synthesis run on this phone. The models ({mb(total)}) are downloaded once; use
        Wi-Fi.
      </Text>
      {packs.map((p) => (
        <Text key={p.id} style={s.mono}>
          {p.id} · {p.files.length} files · {mb(packBytes(p))}
        </Text>
      ))}
      <View style={s.bar}>
        <View style={[s.barFill, { width: `${Math.min(100, (done / total) * 100)}%` }]} />
      </View>
      <Text style={s.dim}>
        {busy
          ? `Downloading ${current}… ${mb(done)} / ${mb(total)}`
          : done > 0
            ? `${mb(done)} / ${mb(total)}`
            : 'Not started'}
      </Text>
      {error && <Text style={{ color: colors.err }}>{error}</Text>}
      <View style={s.row}>
        <Button title={error ? 'Retry' : 'Download'} onPress={start} disabled={busy} />
        {busy && <Button title="Cancel" ghost onPress={() => ctl.current?.abort()} />}
      </View>
    </View>
  );
}
