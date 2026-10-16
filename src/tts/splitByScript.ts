export type ScriptLang = 'hi' | 'en';

// splits text into runs of Devanagari (hi) and Latin (en). spaces, digits and punctuation
// stay with the current run. for the optional dual-voice TTS idea.
export function splitByScript(text: string): [string, ScriptLang][] {
  const out: [string, ScriptLang][] = [];
  let buf = '';
  let cur: ScriptLang | null = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const l: ScriptLang | null = cp >= 0x0900 && cp <= 0x097f ? 'hi' : /\p{L}/u.test(ch) ? 'en' : cur;
    if (l && cur && l !== cur) {
      out.push([buf, cur]);
      buf = '';
    }
    if (l) cur = l;
    buf += ch;
  }
  if (buf.trim()) out.push([buf, cur ?? 'en']);
  return out;
}
