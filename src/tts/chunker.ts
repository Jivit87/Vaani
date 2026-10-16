const MIN_CHUNK_CHARS = 12; // kokoro is weak on very short utterances, so merge tiny sentences
const FIRST_COMMA_MIN = 25; // first chunk only: flush early on a comma once it's long enough

// turns a token stream into speakable chunks. a terminator only ends a sentence when
// whitespace follows it, so "3.5 degrees" isn't split at the dot.
export class SentenceChunker {
  private buf = '';
  private carry = '';
  private first = true;

  constructor(private readonly emit: (s: string) => void) {}

  push(t: string) {
    this.buf += t;
    for (;;) {
      const sentence = this.buf.match(/^([\s\S]*?[.!?।]+)\s+/) ?? this.buf.match(/^([\s\S]*?)\n+/);
      if (sentence) {
        this.take(sentence[1], sentence[0].length);
        continue;
      }
      const comma = this.first && !this.carry ? this.buf.match(/^([\s\S]{25,}?,)\s+/) : null;
      if (comma && comma[1].length >= FIRST_COMMA_MIN) {
        this.take(comma[1], comma[0].length);
        continue;
      }
      break;
    }
  }

  // flush whatever is left at the end of the stream, including a last unterminated sentence
  end() {
    const rest = (this.carry + ' ' + this.buf).trim();
    this.buf = '';
    this.carry = '';
    if (rest) this.flush(rest);
  }

  private take(text: string, consumed: number) {
    this.buf = this.buf.slice(consumed);
    const joined = (this.carry ? this.carry + ' ' : '') + text.trim();
    if (joined.length < MIN_CHUNK_CHARS) {
      this.carry = joined;
      return;
    }
    this.carry = '';
    this.flush(joined);
  }

  private flush(s: string) {
    if (!s.trim()) return;
    this.first = false;
    this.emit(s.trim());
  }
}
