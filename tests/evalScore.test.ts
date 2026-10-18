import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  argsMatch,
  markdownTable,
  scoreTurn,
  summarizeScores,
  valueMatches,
  type Observed,
} from '../eval/score';
import { TOOLS } from '../src/llm/tools.schema';
import { Memory } from '../src/agent/memory';
import { runTurn } from '../src/agent/runTurn';
import { createToolRunner } from '../src/agent/toolRunner';
import type { StepResult } from '../src/agent/types';
import type { LlmClient } from '../src/llm/client';

const obs = (over: Partial<Observed>): Observed => ({
  tools: [],
  spoken: '',
  speech: '',
  ttftMs: 100,
  totalMs: 500,
  ...over,
});

describe('matchers', () => {
  it('compares case-insensitively, supports ~prefix and any-of', () => {
    expect(valueMatches('Bangalore', ' bangalore ')).toBe(true);
    expect(valueMatches(['Bangalore', 'Bengaluru'], 'Bengaluru')).toBe(true);
    expect(valueMatches('~2026-10-17T09:00', '2026-10-17T09:00:00+05:30')).toBe(true);
    expect(valueMatches('~2026-10-17T09:00', '2026-10-17T10:00:00+05:30')).toBe(false);
    expect(valueMatches(7, 7)).toBe(true);
    expect(valueMatches(7, '7')).toBe(false);
  });
  it('requires every expected arg', () => {
    expect(argsMatch({ hour: 7, minute: 0 }, { hour: 7, minute: 0, label: 'x' })).toBe(true);
    expect(argsMatch({ hour: 7, minute: 0 }, { hour: 7 })).toBe(false);
    expect(argsMatch({ hour: 7 }, null)).toBe(false);
  });
});

describe('scoreTurn', () => {
  const alarm = { user: 'u', expect: { tool: 'set_alarm', args: { hour: 7, minute: 0 } } };
  it('passes a correct tool call', () => {
    const s = scoreTurn('c', alarm, obs({ tools: [{ name: 'set_alarm', args: { hour: 7, minute: 0 } }] }));
    expect([s.toolOk, s.argsOk]).toEqual([true, true]);
  });
  it('separates tool-choice from argument errors', () => {
    const s = scoreTurn('c', alarm, obs({ tools: [{ name: 'set_alarm', args: { hour: 19, minute: 0 } }] }));
    expect([s.toolOk, s.argsOk]).toEqual([true, false]);
  });
  it('fails when the wrong tool or no tool is called', () => {
    expect(scoreTurn('c', alarm, obs({ tools: [{ name: 'get_weather', args: {} }] })).toolOk).toBe(false);
    expect(scoreTurn('c', alarm, obs({})).toolOk).toBe(false);
  });
  it('chit-chat must not call tools', () => {
    const t = { user: 'joke', expect: { tool: null } };
    expect(scoreTurn('c', t, obs({ spoken: 'Why did…' })).toolOk).toBe(true);
    expect(scoreTurn('c', t, obs({ tools: [{ name: 'get_weather', args: {} }] })).toolOk).toBe(false);
  });
  it('clarification needs a question and no tool call', () => {
    const t = { user: 'alarm laga do', expect: { tool: null, asks_question: true } };
    expect(scoreTurn('c', t, obs({ spoken: 'Kitne baje?' })).clarifyOk).toBe(true);
    expect(scoreTurn('c', t, obs({ spoken: 'Alarm set.' })).clarifyOk).toBe(false);
    expect(
      scoreTurn('c', t, obs({ spoken: 'Kitne baje?', tools: [{ name: 'set_alarm', args: {} }] })).clarifyOk,
    ).toBe(false);
  });
  it('parallel expectations need every tool', () => {
    const t = { user: 'x', expect: { tools: ['get_schedule', 'get_weather'] } };
    expect(scoreTurn('c', t, obs({ tools: [{ name: 'get_weather', args: {} }] })).toolOk).toBe(false);
    expect(
      scoreTurn(
        'c',
        t,
        obs({
          tools: [
            { name: 'get_weather', args: {} },
            { name: 'get_schedule', args: {} },
          ],
        }),
      ).toolOk,
    ).toBe(true);
  });
});

describe('general-assistant scoring', () => {
  const chat = { user: 'explain rainbows', expect: { tool: null, max_words: 20 } };
  it('rewards plain, short, non-empty speech', () => {
    expect(
      scoreTurn('c', chat, obs({ spoken: 'Sunlight bends inside raindrops and splits into colours.' }))
        .styleOk,
    ).toBe(true);
  });
  it.each([
    ['', 'empty'],
    ['ERROR fetch failed', 'error text'],
    ['**Rainbows** form when light bends', 'bold markdown'],
    ['- first point\n- second point', 'bullets'],
    ['1. Light enters the drop', 'numbered list'],
    ['See https://example.com for more', 'a link'],
    ['word '.repeat(25), 'over the word limit'],
  ])('flags %j (%s)', (spoken) => {
    expect(scoreTurn('c', chat, obs({ spoken })).styleOk).toBe(false);
  });
  it('allows optional tools on a general turn but not others', () => {
    const t = { user: 'who wrote it', expect: { tool: null, allow: ['search_wikipedia'] } };
    expect(
      scoreTurn('c', t, obs({ spoken: 'x', tools: [{ name: 'search_wikipedia', args: {} }] })).toolOk,
    ).toBe(true);
    expect(scoreTurn('c', t, obs({ spoken: 'x', tools: [{ name: 'set_alarm', args: {} }] })).toolOk).toBe(
      false,
    );
    expect(scoreTurn('c', t, obs({ spoken: 'x' })).toolOk).toBe(true);
  });
});

describe('voice text scoring', () => {
  it('needs a devanagari voice version whenever the screen text has latin letters', () => {
    const t = { user: 'x', expect: { tool: null } };
    expect(scoreTurn('c', t, obs({ spoken: 'Hello there.', speech: 'हेलो देयर।' })).speechOk).toBe(true);
    expect(scoreTurn('c', t, obs({ spoken: 'Hello there.', speech: '' })).speechOk).toBe(false);
    expect(scoreTurn('c', t, obs({ spoken: 'Hello there.', speech: 'हेलो there।' })).speechOk).toBe(false);
  });
  it('is fine with no voice part when the screen text is already devanagari', () => {
    const t = { user: 'x', expect: { tool: null } };
    expect(scoreTurn('c', t, obs({ spoken: 'हो गया।', speech: 'हो गया।' })).speechOk).toBe(true);
    expect(scoreTurn('c', t, obs({ spoken: 'हो गया।', speech: '' })).speechOk).toBe(true);
  });
});

describe('language scoring', () => {
  const t = { user: '', expect: { tool: null } };
  it('english in needs no devanagari out, hindi in needs devanagari out', () => {
    expect(
      scoreTurn('c', { ...t, user: 'What is the weather' }, obs({ spoken: 'It is sunny.' })).langOk,
    ).toBe(true);
    expect(scoreTurn('c', { ...t, user: 'What is the weather' }, obs({ spoken: 'आज धूप है।' })).langOk).toBe(
      false,
    );
    expect(
      scoreTurn('c', { ...t, user: 'aaj ka mausam kya hai' }, obs({ spoken: 'आज धूप है।' })).langOk,
    ).toBe(true);
    expect(
      scoreTurn('c', { ...t, user: 'aaj ka mausam kya hai' }, obs({ spoken: 'It is sunny.' })).langOk,
    ).toBe(false);
  });
  it('a short follow-up uses the previous turn language, and a translation may use the other script', () => {
    expect(scoreTurn('c', { ...t, user: 'Pune' }, obs({ spoken: 'पुणे में धूप है।' }), 'hi').langOk).toBe(
      true,
    );
    const tr = {
      user: 'How do you say good morning in Hindi?',
      expect: { tool: null, other_script_ok: true },
    };
    expect(scoreTurn('c', tr, obs({ spoken: 'सुप्रभात।' })).langOk).toBe(true);
  });
});

describe('summary + table', () => {
  it('aggregates and formats', () => {
    const a = obs({
      tools: [{ name: 'set_alarm', args: { hour: 7, minute: 0 } }],
      ttftMs: 200,
      totalMs: 900,
    });
    const b = obs({ ttftMs: 400, totalMs: 1100 });
    const scores = [
      scoreTurn('1', { user: 'a', expect: { tool: 'set_alarm', args: { hour: 7, minute: 0 } } }, a),
      scoreTurn('2', { user: 'b', expect: { tool: 'set_alarm', args: { hour: 7, minute: 0 } } }, b),
    ];
    const s = summarizeScores(scores, [a, b]);
    expect(s).toMatchObject({ turns: 2, toolAcc: 0.5, argAcc: 0.5, clarifyAcc: null, medianTtftMs: 200 });
    expect(markdownTable([{ model: 'm', s }])).toContain(
      '| m | 2 | 50% | 50% | n/a | 0% | 100% | 0% | 200 | 900 |',
    );
  });
});

describe('eval cases file', () => {
  const file = JSON.parse(readFileSync('eval/tool_cases.json', 'utf8'));
  it('is well-formed with unique ids', () => {
    const ids = file.cases.map((c: any) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.cases.length).toBeGreaterThanOrEqual(25);
    for (const c of file.cases) for (const t of c.turns) expect(t.user.trim()).not.toBe('');
  });
  it('only expects real tools with schema-valid argument names', () => {
    const allowed: Record<string, string[]> = Object.fromEntries(
      TOOLS.map((t) => [t.function.name, Object.keys((t.function.parameters as any).properties)]),
    );
    for (const c of file.cases)
      for (const t of c.turns) {
        for (const n of [t.expect.tool, ...(t.expect.tools ?? [])].filter(Boolean))
          expect(allowed).toHaveProperty(n);
        for (const k of Object.keys(t.expect.args ?? {})) expect(allowed[t.expect.tool]).toContain(k);
      }
  });

  // replays a real case through the real agent loop with a scripted "ideal" model, to check the
  // wiring (memory, tool validation, scoring) end to end without a network
  it('scores a perfect oracle model at 100% on a single-turn case through runTurn', async () => {
    const NOW = new Date(file.now);
    const c = file.cases.find((x: any) => x.id === 'hi_alarm_subah');
    let step = 0;
    const oracle: LlmClient = async (req) => {
      step++;
      const r: StepResult =
        step === 1
          ? {
              text: '',
              toolCalls: [
                {
                  id: 'a',
                  type: 'function',
                  function: { name: 'set_alarm', arguments: '{"hour":7,"minute":0}' },
                },
              ],
              ttftMs: 1,
              totalMs: 2,
            }
          : { text: 'हो गया।', toolCalls: [], ttftMs: 1, totalMs: 2 };
      if (r.text) req.onText(r.text);
      return r;
    };
    const mem = new Memory(() => NOW);
    const r = await runTurn(c.turns[0].user, mem, {
      llm: oracle,
      models: { primary: { id: 'oracle', maxTokens: 10 } },
      runTool: createToolRunner(
        {
          setAlarm: async () => {},
          setReminder: async () => {},
          setTimer: async () => {},
          searchWikipedia: async () => null,
          getSchedule: async () => [],
          getWeather: async () => {
            throw new Error('x');
          },
        },
        () => NOW,
      ),
      speaker: { show: () => {}, say: () => {}, playFiller: () => {} },
    });
    const s = scoreTurn(c.id, c.turns[0], {
      tools: r.toolsCalled.map((t) => ({ name: t.name, args: t.args })),
      spoken: r.spoken,
      speech: '',
      ttftMs: 1,
      totalMs: 2,
    });
    expect([s.toolOk, s.argsOk]).toEqual([true, true]);
  });
});
