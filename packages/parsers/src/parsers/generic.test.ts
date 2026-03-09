import { describe, expect, it } from 'vitest';
import { GenericParser } from './generic';

describe('GenericParser', () => {
  it('handles object role values and nested content parts', async () => {
    const parser = new GenericParser();

    const result = await parser.parse(
      {
        messages: [
          {
            id: 'msg_1',
            author: { role: 'assistant' },
            content: { content_type: 'text', parts: ['hello from parts'] },
            create_time: 1700000000,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[0].content).toBe('hello from parts');
  });

  it('does not throw when role is non-string', async () => {
    const parser = new GenericParser();

    const result = await parser.parse(
      {
        messages: [
          {
            id: 'msg_2',
            role: { value: 'user' },
            content: 'safe role coercion',
            timestamp: 1700000001,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].role).toBe('user');
  });
});
