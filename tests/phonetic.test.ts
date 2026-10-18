import { describe, expect, it, vi } from 'vitest';
import type { StepResult } from '../src/agent/types';
import type { LlmClient } from '../src/llm/client';
import { createPhoneticizer } from '../src/tts/phonetic';

const model = { id: 'small', maxTokens: 500 };
const reply =
  (text: string): LlmClient =>
  async (req) => {
    req.onText(text);
    return { text, toolCalls: [], ttftMs: 1, totalMs: 1 } as StepResult;
  };

describe('createPhoneticizer', () => {
  it('rewrites a sentence with latin letters and asks a small model for it', async () => {
    const llm = vi.fn(reply('टुमॉरो विल बी सनी।'));
    const p = createPhoneticizer({ llm, model });
    expect(await p('Tomorrow will be sunny.')).toBe('टुमॉरो विल बी सनी।');
    const req = llm.mock.calls[0][0];
    expect(req.model.maxTokens).toBe(300);
    expect(req.tools).toEqual([]);
    expect(req.messages.at(-1)).toEqual({ role: 'user', content: 'Tomorrow will be sunny.' });
  });

  it('skips the model for text that is already devanagari', async () => {
    const llm = vi.fn(reply('x'));
    const p = createPhoneticizer({ llm, model });
    expect(await p('आपका अलार्म सेट हो गया है।')).toBe('आपका अलार्म सेट हो गया है।');
    expect(await p('1 2 3')).toBe('1 2 3');
    expect(llm).not.toHaveBeenCalled();
  });

  it('remembers answers, so a repeated sentence costs nothing', async () => {
    const llm = vi.fn(reply('ओके।'));
    const p = createPhoneticizer({ llm, model });
    await p('Okay.');
    await p('Okay.');
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it('gives the sentence back unchanged when the answer is empty or not devanagari', async () => {
    const p1 = createPhoneticizer({ llm: reply('   '), model });
    expect(await p1('Hello there.')).toBe('Hello there.');
    const p2 = createPhoneticizer({ llm: reply('Hello there.'), model });
    expect(await p2('Hello there.')).toBe('Hello there.');
  });

  it('strips quotes the model adds around its answer', async () => {
    const p = createPhoneticizer({ llm: reply('“हेलो देयर।”'), model });
    expect(await p('Hello there.')).toBe('हेलो देयर।');
  });

  it('survives an error and then stays off for a while instead of waiting on a dead provider', async () => {
    let clock = 1000;
    const llm = vi.fn(async () => {
      throw new Error('HTTP 429');
    });
    const p = createPhoneticizer({ llm, model, now: () => clock });
    expect(await p('First one.')).toBe('First one.');
    expect(await p('Second one.')).toBe('Second one.');
    expect(llm).toHaveBeenCalledTimes(1); // second call skipped during the backoff
    clock += 60_000;
    await p('Third one.');
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const llm: LlmClient = (req) =>
      new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const p = createPhoneticizer({ llm, model });
    const pending = p('Slow one.');
    await vi.advanceTimersByTimeAsync(3100);
    expect(await pending).toBe('Slow one.');
    vi.useRealTimers();
  });
});
