import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text, View } from 'react-native';
import { packDir, requiredPacks, type Runtime } from './src/session/runtime';
import { isPackComplete } from './src/speech/download';
import { expoFsOps } from './src/speech/fsOps';
import type { PackId } from './src/speech/packs';
import { AgentScreen } from './src/ui/AgentScreen';
import { BenchmarkScreen } from './src/ui/BenchmarkScreen';
import { Button } from './src/ui/Button';
import { ModelSetup } from './src/ui/ModelSetup';
import { OfflineScreen } from './src/ui/OfflineScreen';
import { colors, s } from './src/ui/theme';

type Tab = 'agent' | 'offline' | 'benchmark';

export default function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('agent');
  const [runtime, setRuntime] = useState<Runtime | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all(requiredPacks().map((p) => isPackComplete(p, packDir(p.id as PackId), expoFsOps))).then(
      (results) => alive && setReady(results.every(Boolean)),
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="light" />
      {ready === null ? (
        <View style={[s.screen, { justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !ready ? (
        <ModelSetup onDone={() => setReady(true)} />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {/* The agent stays mounted so the engines and the conversation survive tab switches. */}
            <View style={{ flex: 1, display: tab === 'agent' ? 'flex' : 'none' }}>
              <AgentScreen onRuntime={setRuntime} />
            </View>
            {tab === 'offline' && <OfflineScreen runtime={runtime} />}
            {tab === 'benchmark' && <BenchmarkScreen />}
          </View>
          <View
            style={[
              s.row,
              { padding: 8, justifyContent: 'space-around', borderTopWidth: 1, borderColor: colors.border },
            ]}
          >
            {(['agent', 'offline', 'benchmark'] as Tab[]).map((t) => (
              <Button key={t} title={t} ghost={tab !== t} onPress={() => setTab(t)} />
            ))}
          </View>
          <Text style={[s.dim, { textAlign: 'center', paddingBottom: 4 }]}>
            Speech runs on-device · LLM via cloud API
          </Text>
        </>
      )}
    </SafeAreaView>
  );
}
