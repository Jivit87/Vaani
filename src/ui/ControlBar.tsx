import { Pressable, StyleSheet, View } from 'react-native';
import type { AgentStatus } from '../pipeline/voiceAgent';
import { DotsIcon, KeyboardIcon, MicIcon, MicOffIcon, StopIcon } from './icons';
import { colors } from './theme';

interface Props {
  status: AgentStatus;
  typing: boolean;
  onKeyboard: () => void;
  onMain: () => void;
  onMenu: () => void;
}

const BUSY: AgentStatus[] = ['thinking', 'acting', 'speaking'];

export function ControlBar({ status, typing, onKeyboard, onMain, onMenu }: Props) {
  const busy = BUSY.includes(status);
  const muted = status === 'muted';
  return (
    <View style={styles.bar}>
      <Round label="Type a message" onPress={onKeyboard} active={typing}>
        <KeyboardIcon size={24} color={colors.text} />
      </Round>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? 'Stop' : muted ? 'Turn microphone on' : 'Turn microphone off'}
        onPress={onMain}
        style={({ pressed }) => [
          styles.main,
          muted && styles.mainMuted,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        {busy ? (
          <StopIcon size={34} color={colors.bg} />
        ) : muted ? (
          <MicOffIcon size={32} color={colors.text} />
        ) : (
          <MicIcon size={32} color={colors.bg} />
        )}
      </Pressable>
      <Round label="Menu" onPress={onMenu}>
        <DotsIcon size={26} color={colors.text} />
      </Round>
    </View>
  );
}

function Round({
  children,
  onPress,
  label,
  active,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        active && { backgroundColor: '#2C2C38' },
        pressed && { opacity: 0.6 },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 34,
    paddingVertical: 8,
  },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainMuted: { backgroundColor: '#2A2A34' },
});
