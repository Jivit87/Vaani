import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { AgentStatus } from '../pipeline/voiceAgent';

type Mode = 'calm' | 'think' | 'speak' | 'error' | 'muted';
const MODES: Mode[] = ['calm', 'think', 'speak', 'error', 'muted'];

const PALETTE: Record<Mode, { orb: [string, string, string]; glow: string }> = {
  calm: { orb: ['#F4F8FF', '#8DB8FF', '#3F6DF2'], glow: '#5B8DFF' },
  think: { orb: ['#F3EEFF', '#A58CFF', '#5B3FE0'], glow: '#8B6BFF' },
  speak: { orb: ['#F2FFFD', '#7FE3F2', '#2D8CF0'], glow: '#4FC3F7' },
  error: { orb: ['#FFF1F1', '#FF9A9A', '#D64545'], glow: '#FF6B6B' },
  muted: { orb: ['#EDEDF2', '#9A9CAA', '#575868'], glow: '#7A7C8C' },
};

const modeOf = (s: AgentStatus): Mode =>
  s === 'thinking' || s === 'acting'
    ? 'think'
    : s === 'speaking'
      ? 'speak'
      : s === 'error'
        ? 'error'
        : s === 'muted'
          ? 'muted'
          : 'calm';

/** The glowing orb: breathes while listening, shimmers while thinking, pulses while speaking. */
export function Orb({ status, size = 168 }: { status: AgentStatus; size?: number }) {
  const mode = modeOf(status);
  const [scale] = useState(() => new Animated.Value(1));
  const [fades] = useState(
    () =>
      Object.fromEntries(MODES.map((m) => [m, new Animated.Value(m === 'calm' ? 1 : 0)])) as Record<
        Mode,
        Animated.Value
      >,
  );

  useEffect(() => {
    const anim = Animated.parallel(
      MODES.map((m) =>
        Animated.timing(fades[m], { toValue: m === mode ? 1 : 0, duration: 450, useNativeDriver: true }),
      ),
    );
    anim.start();
    return () => anim.stop();
  }, [mode, fades]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const breathe = (lo: number, hi: number, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: hi,
            duration: ms,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: lo,
            duration: ms,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    if (status === 'speaking') {
      // No audio level is exposed by the native player, so the pulse is a lively random rhythm.
      timer = setInterval(() => {
        Animated.timing(scale, {
          toValue: 1.02 + Math.random() * 0.13,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }, 170);
    } else if (status === 'thinking' || status === 'acting') {
      loop = breathe(0.9, 0.97, 650);
    } else if (status === 'muted') {
      Animated.timing(scale, { toValue: 0.92, duration: 400, useNativeDriver: true }).start();
    } else {
      loop = breathe(1, 1.045, 2200);
    }
    loop?.start();
    return () => {
      loop?.stop();
      if (timer) clearInterval(timer);
    };
  }, [status, scale]);

  const halo = scale.interpolate({ inputRange: [0.9, 1.15], outputRange: [0.92, 1.28] });
  const box = size * 1.75;

  return (
    <View
      accessible
      accessibilityLabel={`Assistant is ${status}`}
      style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}
    >
      {MODES.map((m) => (
        <Animated.View
          key={m}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center', opacity: fades[m] },
          ]}
        >
          {[1.72, 1.58, 1.46, 1.35, 1.25, 1.16].map((k) => (
            <Animated.View
              key={k}
              style={{
                position: 'absolute',
                width: size * k,
                height: size * k,
                borderRadius: size,
                backgroundColor: PALETTE[m].glow,
                opacity: 0.045,
                transform: [{ scale: halo }],
              }}
            />
          ))}
        </Animated.View>
      ))}
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          transform: [{ scale }],
        }}
      >
        {MODES.map((m) => (
          <Animated.View key={m} style={[StyleSheet.absoluteFill, { opacity: fades[m] }]}>
            <LinearGradient
              colors={PALETTE[m].orb}
              start={{ x: 0.2, y: 0.05 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ))}
        {[0.62, 0.5, 0.38, 0.27, 0.17].map((k) => (
          <View
            key={k}
            style={{
              position: 'absolute',
              top: size * (0.3 - k / 2),
              left: size * (0.33 - k / 2),
              width: size * k,
              height: size * k,
              borderRadius: size,
              backgroundColor: '#FFFFFF',
              opacity: 0.07,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
