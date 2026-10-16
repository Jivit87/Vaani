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
      description: 'Set an alarm in the phone Clock app for the next occurrence of the given time.',
      parameters: {
        type: 'object',
        required: ['hour', 'minute'],
        properties: {
          hour: { type: 'integer', minimum: 0, maximum: 23, description: '24-hour clock' },
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
      description: 'Schedule a reminder notification at an exact future time.',
      parameters: {
        type: 'object',
        required: ['datetime_iso', 'text'],
        properties: {
          datetime_iso: {
            type: 'string',
            description: 'ISO 8601 with +05:30 offset, e.g. 2026-10-17T17:00:00+05:30',
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
      description: "Read the user's calendar events for one day, sorted by start time.",
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
      description: 'Daily weather forecast for a city, from today up to 7 days ahead.',
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
];

export type ToolName = 'set_alarm' | 'set_reminder' | 'get_schedule' | 'get_weather';
