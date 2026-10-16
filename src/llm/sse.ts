/** Incremental Server-Sent-Events parser: feed arbitrary text chunks, get `data:` payloads out. */
export class SseParser {
  private buf = '';

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    // Events end with a blank line; tolerate \r\n and \r.
    const normalized = this.buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split('\n\n');
    this.buf = parts.pop() ?? '';
    for (const part of parts) {
      const data = part
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) out.push(data);
    }
    return out;
  }
}

/**
 * Removes <think>…</think> blocks from a token stream, including tags split across chunks.
 * Reasoning text must never reach the TTS engine.
 */
export class ThinkFilter {
  private inThink = false;
  private pending = '';

  push(delta: string): string {
    let buf = this.pending + delta;
    this.pending = '';
    let out = '';
    for (;;) {
      const tag = this.inThink ? '</think>' : '<think>';
      const idx = buf.indexOf(tag);
      if (idx >= 0) {
        if (!this.inThink) out += buf.slice(0, idx);
        buf = buf.slice(idx + tag.length);
        this.inThink = !this.inThink;
        if (!this.inThink) buf = buf.replace(/^\s+/, '');
        continue;
      }
      const keep = partialSuffix(buf, tag);
      if (!this.inThink) out += buf.slice(0, buf.length - keep);
      this.pending = buf.slice(buf.length - keep);
      return out;
    }
  }

  /** Text held back while waiting to see whether it was a tag; call once at end of stream. */
  flush(): string {
    const rest = this.inThink ? '' : this.pending;
    this.pending = '';
    return rest;
  }
}

/** Length of the longest suffix of `s` that is a proper prefix of `tag`. */
function partialSuffix(s: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (tag.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}
