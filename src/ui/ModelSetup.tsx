import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { packDir, requiredPacks } from '../session/runtime';
import { ensurePack, isPackComplete } from '../speech/download';
import { expoFsOps } from '../speech/fsOps';
import { packBytes, type ModelPack, type PackId } from '../speech/packs';
import { Button } from './Button';
import { Orb } from './Orb';
import { colors, s } from './theme';

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

// first launch: download the on-device speech models once, with progress, retry and resume
export function ModelSetup({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [packs, setPacks] = useState<ModelPack[]>(requiredPacks);
  const total = packs.reduce((n, p) => n + packBytes(p), 0);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  // only packs that aren't complete yet count toward the size and the progress bar
  useEffect(() => {
    let alive = true;
    void Promise.all(requiredPacks().map((p) => isPackComplete(p, packDir(p.id as PackId), expoFsOps))).then(
      (done) => {
        const missing = requiredPacks().filter((_, i) => !done[i]);
        if (alive && missing.length) setPacks(missing);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      let base = 0;
      for (const p of packs) {
        await ensurePack(p, packDir(p.id as PackId), expoFsOps, {
          signal: ctl.current.signal,
          onProgress: (pr) => setDone(base + pr.bytesDone),
        });
        base += packBytes(p);
        setDone(base);
      }
      onDone();
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'download aborted'
          ? 'Download paused. Tap Resume to continue.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  }, [onDone, packs]);

  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <View
      style={[
        s.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 },
      ]}
    >
      <View style={styles.hero}>
        <Orb status={busy ? 'thinking' : 'idle'} size={170} />
        <Text style={styles.title}>Welcome to Vaani</Text>
        <Text style={styles.sub}>
          Vaani listens and speaks on your phone, so your voice never leaves it. Download the voice models
          once to get started.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {(busy || done > 0) && (
          <>
            <View style={s.bar}>
              <View style={[s.barFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progress}>
              {pct}% · {mb(done)} of {mb(total)}
            </Text>
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {busy ? (
          <Button title="Pause" ghost onPress={() => ctl.current?.abort()} />
        ) : (
          <Button
            title={error ? (done > 0 ? 'Resume' : 'Try again') : `Download voice (${mb(total)})`}
            onPress={start}
          />
        )}
        <Text style={styles.note}>Wi-Fi recommended. This is a one-time download.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginTop: 4 },
  sub: { color: colors.dim, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 330 },
  progress: { color: colors.dim, fontSize: 13, textAlign: 'center' },
  error: { color: colors.err, fontSize: 14, textAlign: 'center' },
  note: { color: colors.dim, fontSize: 12, textAlign: 'center' },
});
