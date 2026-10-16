export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type Msg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type Lang = 'en' | 'hi';

export interface AgentState {
  lang: Lang;
  last_city?: string;
  last_date?: string;
  last_intent?: string;
  // the last few things the agent actually did, written by tool code, never by the LLM
  actions: string[];
}

export interface StepResult {
  text: string;
  toolCalls: ToolCall[];
  // ms from request start to the first content/tool delta (null if none arrived)
  ttftMs: number | null;
  totalMs: number;
}

export interface ModelCfg {
  id: string;
  maxTokens: number;
  // extra request body fields, e.g. reasoning controls
  extraBody?: Record<string, unknown>;
  // appended to the system prompt, e.g. a "reasoning off" switch
  systemSuffix?: string;
}

export type ToolResult = Record<string, unknown>;

export interface TraceEvent {
  kind: 'tool';
  name: string;
  args: unknown;
  result: ToolResult;
  ms: number;
}
