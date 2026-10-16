import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0f1115',
  panel: '#1a1d24',
  border: '#2a2f3a',
  text: '#e8eaf0',
  dim: '#8b93a7',
  accent: '#4f8cff',
  ok: '#3ecf8e',
  warn: '#f5a524',
  err: '#ff5c5c',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h1: { color: colors.text, fontSize: 20, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  text: { color: colors.text, fontSize: 15 },
  dim: { color: colors.dim, fontSize: 13 },
  mono: { color: colors.dim, fontSize: 12, fontFamily: 'monospace' },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  input: {
    flex: 1,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.accent },
});
