// Pure data, no React Native imports, so the eval script can import it from Node.
export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const TOOLS: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description: 'Set an alarm in the Clock app.',
      parameters: {
        type: 'object',
        required: ['hour', 'minute'],
        properties: {
          hour: { type: 'integer', minimum: 0, maximum: 23, description: '0-23' },
          minute: { type: 'integer', minimum: 0, maximum: 59 },
          label: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description: 'Schedule a reminder notification.',
      parameters: {
        type: 'object',
        required: ['datetime_iso', 'text'],
        properties: {
          datetime_iso: {
            type: 'string',
            description: 'ISO 8601 with +05:30, e.g. 2026-10-17T17:00:00+05:30',
          },
          text: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schedule',
      description: 'Read calendar events for one day.',
      parameters: {
        type: 'object',
        required: ['date'],
        properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Weather forecast for a city, today up to 7 days ahead.',
      parameters: {
        type: 'object',
        required: ['city', 'date'],
        properties: {
          city: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_timer',
      description: 'Start a countdown timer.',
      parameters: {
        type: 'object',
        required: ['seconds'],
        properties: {
          seconds: { type: 'integer', minimum: 1, maximum: 86400, description: 'duration in seconds' },
          label: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_wikipedia',
      description:
        'Look up facts about a person, place, event or topic, including recent changes you may not know.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'a short search phrase' },
          language: { type: 'string', enum: ['en', 'hi'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Exact arithmetic: + - * / ^ %, parentheses, sqrt, abs, round, pow, min, max, pi.',
      parameters: {
        type: 'object',
        required: ['expression'],
        properties: { expression: { type: 'string', description: 'e.g. 15% * 2480 + 1375' } },
      },
    },
  },
];
