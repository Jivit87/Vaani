import { View } from 'react-native';

// Drawn with plain Views so the app needs no icon font or SVG library.
interface IconProps {
  size?: number;
  color?: string;
}

export function MicIcon({ size = 28, color = '#fff' }: IconProps) {
  const w = size * 0.36;
  const stroke = size * 0.075;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.04,
          width: w,
          height: size * 0.56,
          borderRadius: w / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.34,
          width: size * 0.62,
          height: size * 0.4,
          borderBottomLeftRadius: size * 0.31,
          borderBottomRightRadius: size * 0.31,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.73,
          width: stroke,
          height: size * 0.15,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.87,
          width: size * 0.32,
          height: stroke,
          borderRadius: stroke,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function MicOffIcon({ size = 28, color = '#fff' }: IconProps) {
  return (
    <View style={{ width: size, height: size }}>
      <MicIcon size={size} color={color} />
      <View
        style={{
          position: 'absolute',
          top: size * 0.46,
          left: -size * 0.08,
          width: size * 1.16,
          height: size * 0.09,
          borderRadius: size,
          backgroundColor: color,
          transform: [{ rotate: '-42deg' }],
        }}
      />
    </View>
  );
}

export function StopIcon({ size = 28, color = '#fff' }: IconProps) {
  const side = size * 0.46;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: side, height: side, borderRadius: size * 0.1, backgroundColor: color }} />
    </View>
  );
}

export function KeyboardIcon({ size = 24, color = '#fff' }: IconProps) {
  const k = size * 0.1;
  const row = (n: number, top: number, left: number) => (
    <View style={{ position: 'absolute', top, left, flexDirection: 'row', gap: size * 0.075 }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ width: k, height: k, borderRadius: k / 4, backgroundColor: color }} />
      ))}
    </View>
  );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.96,
          height: size * 0.64,
          borderRadius: size * 0.12,
          borderWidth: size * 0.07,
          borderColor: color,
        }}
      />
      {row(4, size * 0.3, size * 0.2)}
      {row(3, size * 0.45, size * 0.27)}
      <View
        style={{
          position: 'absolute',
          top: size * 0.6,
          left: size * 0.3,
          width: size * 0.4,
          height: k,
          borderRadius: k / 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function DotsIcon({ size = 24, color = '#fff' }: IconProps) {
  const d = size * 0.16;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: d * 0.7,
      }}
    >
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function CloseIcon({ size = 24, color = '#fff' }: IconProps) {
  const bar = {
    position: 'absolute' as const,
    width: size * 0.72,
    height: size * 0.09,
    borderRadius: size,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

export function ArrowUpIcon({ size = 24, color = '#fff' }: IconProps) {
  const stroke = size * 0.1;
  const wing = {
    position: 'absolute' as const,
    top: size * 0.2,
    width: size * 0.4,
    height: stroke,
    borderRadius: stroke,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.2,
          width: stroke,
          height: size * 0.6,
          borderRadius: stroke,
          backgroundColor: color,
        }}
      />
      <View style={[wing, { left: size * 0.25, transform: [{ rotate: '-45deg' }] }]} />
      <View style={[wing, { right: size * 0.25, transform: [{ rotate: '45deg' }] }]} />
    </View>
  );
}
