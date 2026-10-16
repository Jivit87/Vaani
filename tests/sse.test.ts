import { describe, expect, it } from 'vitest';
import { SseParser, ThinkFilter } from '../src/llm/sse';

describe('SseParser', () => {
  it('emits data payloads across arbitrary chunk boundaries', () => {
    const p = new SseParser();
    const out = [...p.push('data: {"a"'), ...p.push(':1}\n\ndata: [DO'), ...p.push('NE]\n\n')];
    expect(out).toEqual(['{"a":1}', '[DONE]']);
  });
  it('handles CRLF and ignores comment/keepalive lines', () => {
    const p = new SseParser();
    expect(p.push(': keepalive\r\n\r\ndata: x\r\n\r\n')).toEqual(['x']);
  });
});

describe('ThinkFilter', () => {
  const run = (parts: string[]) => {
    const f = new ThinkFilter();
    return parts.map((x) => f.push(x)).join('') + f.flush();
  };
  it('passes plain text through', () => expect(run(['Hello ', 'world'])).toBe('Hello world'));
  it('drops a think block in one chunk', () =>
    expect(run(['<think>secret</think>Hi there'])).toBe('Hi there'));
  it('drops a think block split across chunks and tags', () =>
    expect(run(['<thi', 'nk>plan', 'ning</th', 'ink>', 'Answer'])).toBe('Answer'));
  it('does not swallow a literal "<" that is not a tag', () =>
    expect(run(['a < b and <th', 'ere'])).toBe('a < b and <there'));
  it('drops an unterminated think block', () => expect(run(['ok <think>never ends'])).toBe('ok '));
});
