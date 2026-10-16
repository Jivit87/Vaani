import { renderSystemPrompt } from '../llm/prompts';
import type { AgentState, Lang, Msg } from './types';

export type Summarizer = (previousSummary: string, evicted: Msg[]) => Promise<string>;

const MAX_WINDOW_MESSAGES = 12; // 6 user/assistant turns
const MAX_ACTIONS = 5;
const IDLE_RESET_MS = 10 * 60_000;
const MAX_SUMMARY_CHARS = 500;

/**
 * Bounded three-layer memory (see about.md §7.6):
 *  1. a window of recent turns (user text + what the agent said, never tool payloads),
 *  2. a rolling summary of older turns, updated off the latency path,
 *  3. a small state record written by tool code, so follow-ups never depend on the LLM remembering.
 */
export class Memory {
  window: Msg[] = [];
  summary = '';
  state: AgentState;
  private evicted: Msg[] = [];
  private lastActive: number;

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly systemSuffix?: string,
    lang: Lang = 'en',
  ) {
    this.state = { lang, actions: [] };
    this.lastActive = now().getTime();
  }

  setLang(lang: Lang) {
    this.state.lang = lang;
  }

  buildMessages(userText: string, scratch: Msg[] = []): Msg[] {
    if (this.now().getTime() - this.lastActive > IDLE_RESET_MS) this.reset();
    const block = [this.summary && `Earlier: ${this.summary}`, `State: ${JSON.stringify(this.state)}`]
      .filter(Boolean)
      .join('\n');
    return [
      { role: 'system', content: renderSystemPrompt(this.now(), block, this.systemSuffix, this.state.lang) },
      ...this.window,
      { role: 'user', content: userText },
      ...scratch,
    ];
  }

  /** Stores only the user's words and what the agent actually spoke. */
  commitTurn(user: string, spoken: string) {
    this.window.push({ role: 'user', content: user });
    if (spoken.trim()) this.window.push({ role: 'assistant', content: spoken.trim() });
    while (this.window.length > MAX_WINDOW_MESSAGES) {
      // Evict whole turns so the window always starts on a user message.
      const nextUser = this.window.findIndex((m, i) => i > 0 && m.role === 'user');
      const cut = nextUser === -1 ? this.window.length : nextUser;
      this.evicted.push(...this.window.splice(0, cut));
    }
    this.lastActive = this.now().getTime();
  }

  /** Call when playback has finished so the extra LLM call never delays a reply. */
  async summarizeIfIdle(summarize: Summarizer): Promise<void> {
    if (!this.evicted.length) return;
    const batch = this.evicted.splice(0);
    try {
      this.summary = (await summarize(this.summary, batch)).trim().slice(0, MAX_SUMMARY_CHARS);
    } catch {
      // Memory is best-effort: losing an old turn is better than failing a live one.
    }
  }

  recordAction(action: string) {
    this.state.actions = [...this.state.actions, action].slice(-MAX_ACTIONS);
  }

  reset() {
    this.window = [];
    this.summary = '';
    this.evicted = [];
    this.state = { lang: this.state.lang, actions: [] };
    this.lastActive = this.now().getTime();
  }
}
