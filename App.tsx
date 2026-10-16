import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { packDir, requiredPacks } from './src/session/runtime';
import { isPackComplete } from './src/speech/download';
import { expoFsOps } from './src/speech/fsOps';
import type { PackId } from './src/speech/packs';
import { ModelSetup } from './src/ui/ModelSetup';
import { colors, s } from './src/ui/theme';
import { VoiceScreen } from './src/ui/VoiceScreen';

export default function App() {
  const [ready, setReady] = useState<boolean | null>(null);

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
    <SafeAreaProvider>
      <StatusBar style="light" />
      {ready === null ? (
        <View style={[s.screen, { justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : ready ? (
        <VoiceScreen />
      ) : (
        <ModelSetup onDone={() => setReady(true)} />
      )}
    </SafeAreaProvider>
  );
}
