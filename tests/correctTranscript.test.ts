import { describe, expect, it } from 'vitest';
import { correctTranscript } from '../src/pipeline/correctTranscript';

describe('correctTranscript', () => {
  it.each([
    ['What is weather forecast for Bangladesh tomorrow?', 'What is weather forecast for Bangalore tomorrow?'],
    [
      'Can you what is the weather for Bangladesh tomorrow?',
      'Can you what is the weather for Bangalore tomorrow?',
    ],
    ['will it rain in Bangladesh today', 'will it rain in Bangalore today'],
    ['Bangaluru ka mausam kaisa hai', 'Bangalore ka mausam kaisa hai'],
  ])('%s', (heard, fixed) => {
    expect(correctTranscript(heard)).toBe(fixed);
  });

  it('leaves everything else alone, including Bangladesh outside a weather question', () => {
    expect(correctTranscript('What is the capital of Bangladesh?')).toBe(
      'What is the capital of Bangladesh?',
    );
    expect(correctTranscript('Tell me about Bangladesh')).toBe('Tell me about Bangladesh');
    expect(correctTranscript('What is the weather in Pune')).toBe('What is the weather in Pune');
  });
});
