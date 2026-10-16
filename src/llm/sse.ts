// incremental SSE parser: feed it text chunks, get the `data:` payloads back
export class SseParser {
  private buf = '';

  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    // events end with a blank line, handle \r\n and \r too
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

// strips <think>...</think> blocks from a token stream, even when a tag is split across
// chunks. reasoning text must never reach the TTS.
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

  // text held back while we wait to see if it was a tag. call once at the end of the stream
  flush(): string {
    const rest = this.inThink ? '' : this.pending;
    this.pending = '';
    return rest;
  }
}

// length of the longest suffix of s that is a proper prefix of tag
function partialSuffix(s: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (tag.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}
