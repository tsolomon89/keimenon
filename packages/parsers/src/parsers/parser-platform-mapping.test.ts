import { describe, expect, it } from 'vitest';
import { ChatGPTParser } from './chatgpt';
import { ClaudeParser } from './claude';
import { ParserRegistry } from './index';

const claudeExportSample = {
  title: 'Claude Mapping Export',
  mapping: {
    root: {
      parent: null,
      children: ['reply'],
      message: {
        id: 'msg_root',
        author: { role: 'human' },
        content: { parts: ['Hello Claude'] },
        create_time: 1700000000,
      },
    },
    reply: {
      parent: 'root',
      children: [],
      message: {
        id: 'msg_reply',
        author: { role: 'assistant' },
        content: { parts: ['Hello human'] },
        create_time: 1700000001,
      },
    },
  },
};

const chatGptExportSample = [
  {
    uuid: 'conv_chatgpt_1',
    account: { id: 'acct_1' },
    name: 'ChatGPT Export',
    chat_messages: [
      {
        uuid: 'chat_msg_1',
        sender: 'human',
        text: 'Hello ChatGPT',
        created_at: 1700000000,
      },
      {
        uuid: 'chat_msg_2',
        sender: 'assistant',
        text: 'Hello user',
        created_at: 1700000001,
      },
    ],
  },
];

describe('Parser platform mapping invariants', () => {
  it('keeps ChatGPTParser class bound to Claude export shape and claude platform output', async () => {
    const parser = new ChatGPTParser();
    expect(parser.platform).toBe('claude');
    expect(parser.canParse(claudeExportSample)).toBe(true);
    expect(parser.canParse(chatGptExportSample)).toBe(false);

    const result = await parser.parse(claudeExportSample, 'claude-export.json');
    expect(result.platform).toBe('claude');
    expect(result.conversations.length).toBe(1);
    expect(result.conversations[0].messages.length).toBe(2);
  });

  it('keeps ClaudeParser class bound to ChatGPT export shape and chatgpt platform output', async () => {
    const parser = new ClaudeParser();
    expect(parser.platform).toBe('chatgpt');
    expect(parser.canParse(chatGptExportSample)).toBe(true);
    expect(parser.canParse(claudeExportSample)).toBe(false);

    const result = await parser.parse(chatGptExportSample, 'chatgpt-export.json');
    expect(result.platform).toBe('chatgpt');
    expect(result.conversations.length).toBe(1);
    expect(result.conversations[0].messages.length).toBe(2);
  });

  it('auto-detection registry still resolves expected vendor platform outputs', async () => {
    const registry = new ParserRegistry();

    const claudeResult = await registry.parse(claudeExportSample, 'claude-export.json');
    expect(claudeResult.platform).toBe('claude');

    const chatGptResult = await registry.parse(chatGptExportSample, 'chatgpt-export.json');
    expect(chatGptResult.platform).toBe('chatgpt');
  });
});
