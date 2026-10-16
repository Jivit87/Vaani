import { describe, expect, it, vi } from 'vitest';
import { Memory } from '../src/agent/memory';
import { MAX_STEPS, runTurn, type Speaker } from '../src/agent/runTurn';
import { createToolRunner, type ToolBackends } from '../src/agent/toolRunner';
import type { StepResult, ToolCall } from '../src/agent/types';
import { LlmHttpError, type LlmClient, type LlmRequest } from '../src/llm/client';

const NOW = new Date('2026-10-16T04:30:00Z');
const MODELS = { primary: { id: 'p', maxTokens: 100 }, backup: { id: 'b', maxTokens: 100 } };

const call = (id: string, name: string, args: unknown): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});
const step = (text: string, toolCalls: ToolCall[] = []): StepResult => ({
  text,
  toolCalls,
  ttftMs: 5,
  totalMs: 10,
});

/** Scripted LLM: each request pops the next step and streams its text token by token. */
function scriptedLlm(script: (StepResult | Error)[]) {
  const requests: LlmRequest[] = [];
  const llm: LlmClient = async (req) => {
    requests.push(JSON.parse(JSON.stringify({ ...req, onText: undefined, signal: undefined })));
    const next = script.shift();
    if (!next) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    for (const tok of next.text.match(/\S+\s*/g) ?? []) req.onText(tok);
    return next;
  };
  return { llm, requests };
}

function harness(script: (StepResult | Error)[], backendOver: Partial<ToolBackends> = {}) {
  const said: string[] = [];
  const fillers: string[] = [];
  const speaker: Speaker = { say: (s) => said.push(s), playFiller: (l) => fillers.push(l) };
  const backends: ToolBackends = {
    setAlarm: vi.fn(async () => {}),
    setReminder: vi.fn(async () => {}),
    setTimer: vi.fn(async () => {}),
    searchWikipedia: vi.fn(async (q: string) => ({ title: q, summary: 'A short summary.', url: 'u' })),
    getSchedule: vi.fn(async () => [{ title: 'Standup', start_hhmm: '10:30' }]),
    getWeather: vi.fn(async (city, date) => ({
      city,
      date,
      max_c: 31,
      min_c: 22,
      rain_pct: 20,
      summary: 'Sunny',
    })),
    ...backendOver,
  };
  const { llm, requests } = scriptedLlm(script);
  const mem = new Memory(() => NOW);
  const deps = { llm, models: MODELS, runTool: createToolRunner(backends, () => NOW), speaker };
  return { said, fillers, backends, requests, mem, deps };
}

describe('runTurn', () => {
  it('answers directly without tools and speaks sentence by sentence', async () => {
    const h = harness([step('The capital of France is Paris. It is lovely this time of year.')]);
    const r = await runTurn('capital of france?', h.mem, h.deps);
    expect(h.said).toEqual(['The capital of France is Paris.', 'It is lovely this time of year.']);
    expect(h.fillers).toEqual([]);
    expect(r.timings.llmSteps).toBe(1);
    expect(h.requests[0].tools.length).toBeGreaterThan(0);
  });

  it('runs a tool, feeds the result back with the matching id, then answers', async () => {
    const h = harness([
      step('', [call('c1', 'set_alarm', { hour: 7, minute: 0 })]),
      step('Your alarm is set for seven AM.'),
    ]);
    const r = await runTurn('alarm laga do subah saat baje', h.mem, h.deps);

    expect(h.backends.setAlarm).toHaveBeenCalledWith({ hour: 7, minute: 0, label: undefined });
    expect(h.fillers).toEqual(['en']); // model said nothing first, so a filler covers the gap
    const second = h.requests[1].messages;
    expect(second.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1' }] });
    expect(second.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'c1',
      content: '{"ok":true,"alarm":"07:00","alarm_12h":"7:00 AM"}',
    });
    expect(h.said).toEqual(['Your alarm is set for seven AM.']);
    expect(r.toolsCalled[0]).toMatchObject({ name: 'set_alarm', result: { ok: true } });
  });

  it('does not play a filler when the model already spoke before calling a tool', async () => {
    const h = harness([
      step('Let me check that for you.', [call('c1', 'get_schedule', { date: '2026-10-16' })]),
      step('You have standup at ten thirty.'),
    ]);
    await runTurn('schedule?', h.mem, h.deps);
    expect(h.fillers).toEqual([]);
  });

  it('runs parallel tool calls and returns both results in order', async () => {
    const h = harness([
      step('', [
        call('a', 'get_schedule', { date: '2026-10-16' }),
        call('b', 'get_weather', { city: 'Pune', date: '2026-10-16' }),
      ]),
      step('Standup at ten thirty and it is sunny.'),
    ]);
    const r = await runTurn('schedule aur weather', h.mem, h.deps);
    const tail = h.requests[1].messages.slice(-2);
    expect(tail.map((m: any) => m.tool_call_id)).toEqual(['a', 'b']);
    expect(r.toolsCalled.map((t) => t.name)).toEqual(['get_schedule', 'get_weather']);
  });

  it('turns malformed tool arguments into an error result instead of crashing', async () => {
    const h = harness([step('', [call('c1', 'set_alarm', '{"hour": 7,')]), step('Sorry, which time?')]);
    await runTurn('alarm', h.mem, h.deps);
    expect((h.requests[1].messages.at(-1) as any).content).toBe('{"error":"bad_arguments_json"}');
    expect(h.backends.setAlarm).not.toHaveBeenCalled();
  });

  it('feeds validation errors back so the model can explain or ask', async () => {
    const h = harness([
      step('', [call('c1', 'set_alarm', { hour: 25, minute: 0 })]),
      step('That time is not valid. What time?'),
    ]);
    await runTurn('alarm at twenty five', h.mem, h.deps);
    expect((h.requests[1].messages.at(-1) as any).content).toContain('invalid_argument');
  });

  it('lets a clarifying question through with no tool call', async () => {
    const h = harness([step('Kitne baje ka alarm lagana hai?')]);
    const r = await runTurn('alarm laga do', h.mem, h.deps);
    expect(r.toolsCalled).toEqual([]);
    expect(h.said.join(' ')).toContain('?');
  });

  it(`stops after ${MAX_STEPS} steps and withholds tools on the last one`, async () => {
    const loop = (i: number) =>
      step('', [call(`c${i}`, 'get_weather', { city: 'Pune', date: '2026-10-16' })]);
    const h = harness([loop(1), loop(2), step('It is sunny in Pune today.')]);
    await runTurn('weather', h.mem, h.deps);
    expect(h.requests.map((r) => r.tools.length > 0)).toEqual([true, true, false]);
    expect(h.said).toEqual(['It is sunny in Pune today.']);
  });

  it('commits only user text and spoken reply to memory, never tool payloads', async () => {
    const h = harness([
      step('', [call('c1', 'get_weather', { city: 'Pune', date: '2026-10-17' })]),
      step('Sunny tomorrow.'),
    ]);
    await runTurn('weather pune kal', h.mem, h.deps);
    expect(h.mem.window).toEqual([
      { role: 'user', content: 'weather pune kal' },
      { role: 'assistant', content: 'Sunny tomorrow.' },
    ]);
    expect(h.mem.state).toMatchObject({ last_city: 'Pune', last_date: '2026-10-17' });
    // A follow-up sees the structured state in its system prompt.
    const h2 = harness([step('Cloudy.')]);
    h2.mem.state = { ...h.mem.state };
    await runTurn('aur parso?', h2.mem, h2.deps);
    expect((h2.requests[0].messages[0] as any).content).toContain('"last_city":"Pune"');
  });

  it('never claims success when the model said nothing and no tool ran', async () => {
    const h = harness([step('')]);
    const r = await runTurn('shaam ko 6 baje alarm laga do', h.mem, h.deps);
    expect(r.spoken).not.toBe('Done.');
    expect(r.spoken).toContain("didn't get that");
    expect(h.backends.setAlarm).not.toHaveBeenCalled();
  });

  it('does not say Done when the only tool call failed validation', async () => {
    const h = harness([step('', [call('c1', 'set_alarm', { hour: 99, minute: 0 })]), step('')]);
    const r = await runTurn('alarm', h.mem, h.deps);
    expect(r.spoken).toContain("didn't get that");
  });

  it('says Done when the model is silent but a tool succeeded', async () => {
    const h = harness([step('', [call('c1', 'set_alarm', { hour: 7, minute: 0 })]), step('')]);
    const r = await runTurn('alarm at seven', h.mem, h.deps);
    expect(r.spoken).toBe('Done.');
  });

  it('uses the Hindi filler and fallback when the session language is Hindi', async () => {
    const h = harness([step('', [call('c1', 'get_schedule', { date: '2026-10-16' })]), step('')]);
    h.mem.setLang('hi');
    const r = await runTurn('aaj ka schedule', h.mem, h.deps);
    expect(h.fillers).toEqual(['hi']);
    expect(r.spoken).toBe('हो गया।'); // get_schedule succeeded, so claiming completion is honest
  });

  it('falls back to the backup model on a 429 and reports which model answered', async () => {
    const h = harness([new LlmHttpError(429, 'rate'), step('Hello from backup.')]);
    const r = await runTurn('hi', h.mem, h.deps);
    expect(r.model.id).toBe('b');
    expect(h.requests.map((q: any) => q.model.id)).toEqual(['p', 'b']);
  });

  it('on abort: speaks no partial sentence and does not commit the turn', async () => {
    const ctl = new AbortController();
    const h = harness([]);
    h.deps.llm = async (req) => {
      req.onText('I was in the mid');
      ctl.abort();
      throw new Error('aborted');
    };
    await expect(runTurn('hi', h.mem, h.deps, ctl.signal)).rejects.toThrow('aborted');
    expect(h.said).toEqual([]);
    expect(h.mem.window).toEqual([]);
  });

  it('reports tool wall-time as the slowest parallel tool, not the sum', async () => {
    let t = 0;
    const clock = () => t;
    const slow = (ms: number) => async () => {
      t += ms;
      return [];
    };
    const h = harness(
      [
        step('', [
          call('a', 'get_schedule', { date: '2026-10-16' }),
          call('b', 'get_schedule', { date: '2026-10-17' }),
        ]),
        step('ok done here.'),
      ],
      { getSchedule: slow(100) },
    );
    const r = await runTurn('x', h.mem, { ...h.deps, clock });
    expect(r.timings.toolMs).toBeGreaterThan(0);
    expect(r.timings.llmSteps).toBe(2);
  });
});
