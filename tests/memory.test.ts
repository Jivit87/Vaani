import { describe, expect, it } from 'vitest';
import { Memory } from '../src/agent/memory';

const t0 = new Date('2026-10-16T04:30:00Z').getTime();
const clockAt = (ms: { v: number }) => () => new Date(ms.v);

describe('Memory', () => {
  it('keeps at most 6 turns and evicts whole turns', () => {
    const m = new Memory(() => new Date(t0));
    for (let i = 1; i <= 8; i++) m.commitTurn(`u${i}`, `a${i}`);
    expect(m.window.map((x) => (x as any).content)).toEqual([
      'u3',
      'a3',
      'u4',
      'a4',
      'u5',
      'a5',
      'u6',
      'a6',
      'u7',
      'a7',
      'u8',
      'a8',
    ]);
    expect(m.window[0].role).toBe('user');
  });

  it('builds messages: system (date + state) → window → user → scratch', () => {
    const m = new Memory(() => new Date(t0));
    m.commitTurn('hi', 'hello');
    m.recordAction("alarm 07:00 'wake'");
    const msgs = m.buildMessages('aur kal?', [{ role: 'tool', tool_call_id: 'x', content: '{}' }]);
    expect(msgs.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user', 'tool', 'system']);
    const sys = (msgs[0] as any).content as string;
    expect(sys).toContain('2026-10-16T10:00:00+05:30');
    expect(sys).toContain('Friday');
    expect(sys).toContain('alarm 07:00');
  });

  it('tells the model which language to answer in, from the language detected for this message', () => {
    const en = new Memory(() => new Date(t0));
    const hi = new Memory(() => new Date(t0));
    hi.setLang('hi');
    expect((en.buildMessages('hi')[0] as any).content).toContain('speaking ENGLISH');
    expect((hi.buildMessages('hi')[0] as any).content).toContain('HINDI/HINGLISH');
    expect((hi.buildMessages('hi')[0] as any).content).not.toContain('speaking ENGLISH');
  });

  it('keeps the detected language out of the state the model sees', () => {
    const m = new Memory(() => new Date(t0));
    m.setLang('hi');
    const sys = (m.buildMessages('hi')[0] as any).content as string;
    expect(sys).toContain('State: {"actions":[]}');
  });

  it('keeps only the last 5 actions', () => {
    const m = new Memory();
    for (let i = 0; i < 8; i++) m.recordAction(`a${i}`);
    expect(m.state.actions).toEqual(['a3', 'a4', 'a5', 'a6', 'a7']);
  });

  it('summarizes evicted turns off the hot path and caps the summary', async () => {
    const m = new Memory(() => new Date(t0));
    for (let i = 1; i <= 7; i++) m.commitTurn(`u${i}`, `a${i}`);
    let received: any[] = [];
    await m.summarizeIfIdle(async (prev, batch) => {
      received = batch;
      return 'x'.repeat(900);
    });
    expect(received.map((x) => x.content)).toEqual(['u1', 'a1']);
    expect(m.summary.length).toBe(500);
    expect(m.buildMessages('q')[0]).toMatchObject({ role: 'system' });
    expect((m.buildMessages('q')[0] as any).content as string).toContain('Earlier:');
  });

  it('survives a failing summarizer (best-effort)', async () => {
    const m = new Memory(() => new Date(t0));
    for (let i = 1; i <= 5; i++) m.commitTurn(`u${i}`, `a${i}`);
    await expect(
      m.summarizeIfIdle(async () => {
        throw new Error('429');
      }),
    ).resolves.toBeUndefined();
    expect(m.summary).toBe('');
  });

  it('resets after 10 minutes idle but keeps the language', () => {
    const clock = { v: t0 };
    const m = new Memory(clockAt(clock), undefined, 'hi');
    m.commitTurn('u', 'a');
    m.recordAction('x');
    clock.v += 11 * 60_000;
    const msgs = m.buildMessages('new');
    expect(msgs.map((x) => x.role)).toEqual(['system', 'user', 'system']);
    expect(m.state).toEqual({ lang: 'hi', actions: [] });
  });

  it('does not store an empty assistant reply', () => {
    const m = new Memory();
    m.commitTurn('u', '   ');
    expect(m.window).toHaveLength(1);
  });
});
