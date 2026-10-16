import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelCfg } from '../src/agent/types';
import { callWithFallback, createLlmClient, LlmHttpError, LlmTimeoutError } from '../src/llm/client';
import { TOOLS } from '../src/llm/tools.schema';

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const delta = (d: object) => sse({ choices: [{ delta: d }] });

let server: http.Server;
let baseUrl = '';
let lastBody: any;
let lastAuth = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastBody = JSON.parse(raw || '{}');
      lastAuth = String(req.headers.authorization);
      const model: string = lastBody.model;
      if (model === 'rate-limited') {
        res.writeHead(429).end('{"error":"slow down"}');
        return;
      }
      if (model === 'hang') return; // never respond
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (model === 'text') {
        // Split one event across two socket writes to exercise buffering.
        const ev = delta({ content: 'Hello ' }) + delta({ content: 'there.' });
        res.write(ev.slice(0, 20));
        setTimeout(() => {
          res.write(ev.slice(20));
          res.end('data: [DONE]\n\n');
        }, 10);
      } else if (model === 'think') {
        res.write(delta({ content: '<think>hmm</think>Answer' }));
        res.end('data: [DONE]\n\n');
      } else if (model === 'tools') {
        res.write(
          delta({
            tool_calls: [
              { index: 0, id: 'call_a', function: { name: 'get_weather', arguments: '{"city":"Pu' } },
            ],
          }),
        );
        res.write(delta({ tool_calls: [{ index: 0, function: { arguments: 'ne","date":"2026-10-17"}' } }] }));
        res.write(
          delta({
            tool_calls: [
              { index: 1, function: { name: 'get_schedule', arguments: '{"date":"2026-10-17"}' } },
            ],
          }),
        );
        res.end('data: [DONE]\n\n');
      } else {
        res.end('data: [DONE]\n\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const cfg = (id: string): ModelCfg => ({ id, maxTokens: 50, extraBody: { reasoning_effort: 'low' } });
const client = (timeout = 2000) =>
  createLlmClient({ fetch, apiKey: 'test-key', baseUrl, firstTokenTimeoutMs: timeout });

describe('createLlmClient', () => {
  it('streams text across split SSE events and reports TTFT', async () => {
    const seen: string[] = [];
    const r = await client()({ model: cfg('text'), messages: [], tools: TOOLS, onText: (t) => seen.push(t) });
    expect(seen.join('')).toBe('Hello there.');
    expect(r.text).toBe('Hello there.');
    expect(r.ttftMs).not.toBeNull();
    expect(lastAuth).toBe('Bearer test-key');
    expect(lastBody).toMatchObject({
      stream: true,
      max_tokens: 50,
      reasoning_effort: 'low',
      tool_choice: 'auto',
    });
  });

  it('omits tools and tool_choice when no tools are offered', async () => {
    await client()({ model: cfg('text'), messages: [], tools: [], onText: () => {} });
    expect(lastBody.tools).toBeUndefined();
    expect(lastBody.tool_choice).toBeUndefined();
  });

  it('assembles fragmented tool calls, keeps ids, and orders by index', async () => {
    const r = await client()({ model: cfg('tools'), messages: [], tools: TOOLS, onText: () => {} });
    expect(r.toolCalls.map((c) => c.function.name)).toEqual(['get_weather', 'get_schedule']);
    expect(r.toolCalls[0].id).toBe('call_a');
    expect(r.toolCalls[1].id).toBe('call_1'); // synthesized when the provider sends none
    expect(JSON.parse(r.toolCalls[0].function.arguments)).toEqual({ city: 'Pune', date: '2026-10-17' });
  });

  it('never forwards <think> content to onText', async () => {
    const seen: string[] = [];
    const r = await client()({ model: cfg('think'), messages: [], tools: [], onText: (t) => seen.push(t) });
    expect(seen.join('')).toBe('Answer');
    expect(r.text).toBe('Answer');
  });

  it('throws LlmHttpError carrying the status on 429', async () => {
    await expect(
      client()({ model: cfg('rate-limited'), messages: [], tools: [], onText: () => {} }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('times out when no bytes arrive', async () => {
    await expect(
      client(150)({ model: cfg('hang'), messages: [], tools: [], onText: () => {} }),
    ).rejects.toBeInstanceOf(LlmTimeoutError);
  });

  it('honours an external abort signal', async () => {
    const ctl = new AbortController();
    const p = client(5000)({
      model: cfg('hang'),
      messages: [],
      tools: [],
      onText: () => {},
      signal: ctl.signal,
    });
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toThrow();
  });
});

describe('callWithFallback', () => {
  it('falls back to the backup model on 429 before anything is spoken', async () => {
    const seen: string[] = [];
    const out = await callWithFallback(
      client(),
      { primary: cfg('rate-limited'), backup: cfg('text') },
      { messages: [], tools: [], onText: (t) => seen.push(t) },
    );
    expect(out.model.id).toBe('text');
    expect(seen.join('')).toBe('Hello there.');
  });

  it('does not fall back once text has been emitted', async () => {
    const failing = async (req: any) => {
      req.onText('partial ');
      throw new LlmHttpError(500, 'boom');
    };
    await expect(
      callWithFallback(
        failing,
        { primary: cfg('a'), backup: cfg('b') },
        { messages: [], tools: [], onText: () => {} },
      ),
    ).rejects.toBeInstanceOf(LlmHttpError);
  });

  it('does not fall back after an abort', async () => {
    const ctl = new AbortController();
    ctl.abort();
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error('aborted');
    };
    await expect(
      callWithFallback(
        failing,
        { primary: cfg('a'), backup: cfg('b') },
        { messages: [], tools: [], onText: () => {}, signal: ctl.signal },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
