import { describe, expect, it } from 'vitest';
import { ChatGPTParser } from './chatgpt';
import { ClaudeParser } from './claude';
import { GeminiParser } from './gemini';

describe('Parser role normalization edge cases', () => {
  it('ChatGPTParser handles object role values in mapping exports', async () => {
    const parser = new ChatGPTParser();

    const result = await parser.parse(
      {
        title: 'Mapping Export',
        create_time: 1700000000,
        mapping: {
          root: {
            id: 'root',
            parent: null,
            children: ['msg_node'],
            message: null,
          },
          msg_node: {
            id: 'msg_node',
            parent: 'root',
            children: [],
            message: {
              id: 'm1',
              author: { role: { type: 'assistant' } },
              content: { parts: [{ text: 'hello' }, 'world'] },
              create_time: 1700000001,
            },
          },
        },
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[0].content).toContain('hello');
  });

  it('ChatGPTParser handles scalar content with nested role aliases', async () => {
    const parser = new ChatGPTParser();

    const result = await parser.parse(
      {
        id: 'conv_scalar',
        title: 'Scalar Content',
        messages: [
          {
            id: 'msg_scalar',
            role: { sender: { name: 'assistant-model' } },
            content: 42,
            timestamp: 1700000003,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[0].content).toBe('42');
  });

  it('ClaudeParser handles non-string sender values', async () => {
    const parser = new ClaudeParser();

    const result = await parser.parse(
      {
        uuid: 'conv_1',
        name: 'Sender Variants',
        created_at: 1700000000,
        chat_messages: [
          {
            uuid: 'msg_1',
            sender: { role: 'assistant' },
            text: 'assistant response',
            created_at: 1700000001,
          },
          {
            uuid: 'msg_2',
            sender: 12345,
            text: 'numeric sender defaults safely',
            created_at: 1700000002,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(2);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[1].role).toBe('user');
  });

  it('GeminiParser handles object role values and non-string content', async () => {
    const parser = new GeminiParser();

    const result = await parser.parse(
      {
        id: 'conv_g1',
        title: 'Gemini Edge Case',
        turns: [
          {
            id: 'msg_1',
            role: { type: 'model' },
            parts: [{ text: 'model output' }, { text: 42 }],
            timestamp: 1700000001,
          },
          {
            id: 'msg_2',
            author: { role: 'user' },
            content: { text: 'user payload object' },
            timestamp: 1700000002,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(2);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[1].role).toBe('user');
    expect(result.conversations[0].messages[0].content).toContain('model output');
  });

  it('GeminiParser tolerates circular content objects', async () => {
    const parser = new GeminiParser();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const result = await parser.parse(
      {
        id: 'conv_g2',
        turns: [
          {
            id: 'msg_circular',
            role: { name: 'gemini-pro' },
            content: circular,
            timestamp: 1700000003,
          },
        ],
      },
      'fixture.json'
    );

    expect(result.stats.parse_errors).toBe(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].role).toBe('assistant');
    expect(result.conversations[0].messages[0].content).toContain('[object Object]');
  });
});
