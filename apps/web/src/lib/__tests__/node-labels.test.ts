import { describe, it, expect } from 'vitest';
import { getNodeLabel, truncateText, LabelableNode } from '../node-labels';

describe('getNodeLabel', () => {
  it('returns label property when present', () => {
    const node: LabelableNode = { id: '123', kind: 'Source', label: 'My Document' };
    expect(getNodeLabel(node)).toBe('My Document');
  });

  it('returns title when label is absent', () => {
    const node: LabelableNode = { id: '123', kind: 'Source', title: 'Research Paper' };
    expect(getNodeLabel(node)).toBe('Research Paper');
  });

  it('returns name when label and title are absent', () => {
    const node: LabelableNode = { id: '123', kind: 'Topic', name: 'AI Ethics' };
    expect(getNodeLabel(node)).toBe('AI Ethics');
  });

  it('returns lemma for Lexeme nodes', () => {
    const node: LabelableNode = { id: '123', kind: 'Lexeme', lemma: 'algorithm' };
    expect(getNodeLabel(node)).toBe('algorithm');
  });

  it('returns text for Phrase nodes', () => {
    const node: LabelableNode = { id: '123', kind: 'Phrase', text: 'machine learning' };
    expect(getNodeLabel(node)).toBe('machine learning');
  });

  it('returns normalized_text for Phrase nodes when text is absent', () => {
    const node: LabelableNode = { id: '123', kind: 'Phrase', normalized_text: 'natural language' };
    expect(getNodeLabel(node)).toBe('natural language');
  });

  it('returns claim_text for VerifiedClaim nodes', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'VerifiedClaim',
      claim_text: 'GPT-4 was released in March 2023',
    };
    // Default maxLength is 24, so 23 chars + ellipsis
    expect(getNodeLabel(node)).toBe('GPT-4 was released in M\u2026');
  });

  it('returns role-based label for messages', () => {
    const node: LabelableNode = { id: '123', kind: 'Message', role: 'user' };
    expect(getNodeLabel(node)).toBe('User message');
  });

  it('returns role-based label for assistant messages', () => {
    const node: LabelableNode = { id: '123', kind: 'Message', role: 'assistant' };
    expect(getNodeLabel(node)).toBe('Assistant message');
  });

  it('returns language-based label for code blocks', () => {
    const node: LabelableNode = { id: '123', kind: 'CodeBlock', language: 'TypeScript' };
    expect(getNodeLabel(node)).toBe('TypeScript code');
  });

  it('truncates long labels to default maxLength', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Source',
      title: 'A very long document title that exceeds the limit',
    };
    const label = getNodeLabel(node);
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label).toContain('\u2026');
  });

  it('respects custom maxLength parameter', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Source',
      title: 'A very long document title that exceeds the limit',
    };
    const label = getNodeLabel(node, 15);
    expect(label.length).toBeLessThanOrEqual(15);
    expect(label).toBe('A very long do\u2026');
  });

  it('does not truncate short labels', () => {
    const node: LabelableNode = { id: '123', kind: 'Source', title: 'Short' };
    expect(getNodeLabel(node, 24)).toBe('Short');
  });

  it('falls back to formatted node type when no label data', () => {
    const node: LabelableNode = { id: '123', kind: 'VerifiedSource' };
    expect(getNodeLabel(node)).toBe('Verified Source');
  });

  it('formats camelCase node types correctly', () => {
    const node: LabelableNode = { id: '123', kind: 'sourceDoc' };
    expect(getNodeLabel(node)).toBe('Source Doc');
  });

  // World Model V5: Principal nodes
  it('returns display_name for Principal nodes', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Principal',
      display_name: 'Alice Smith',
      principal_kind: 'human',
    };
    expect(getNodeLabel(node)).toBe('Alice Smith');
  });

  it('returns platform name for agent Principals without display_name', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Principal',
      principal_kind: 'agent',
      platform: 'chatgpt',
    };
    expect(getNodeLabel(node)).toBe('ChatGPT');
  });

  it('returns email for human Principals without display_name', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Principal',
      principal_kind: 'human',
      email: 'alice@example.com',
    };
    expect(getNodeLabel(node)).toBe('alice@example.com');
  });

  it('returns User for human Principal with no label data', () => {
    const node: LabelableNode = { id: '123', kind: 'Principal', principal_kind: 'human' };
    expect(getNodeLabel(node)).toBe('User');
  });

  it('returns AI Assistant for agent Principal with no label data', () => {
    const node: LabelableNode = { id: '123', kind: 'Principal', principal_kind: 'agent' };
    expect(getNodeLabel(node)).toBe('AI Assistant');
  });

  // World Model V5: ConversationThread nodes
  it('returns title for ConversationThread nodes', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'ConversationThread',
      title: 'Code Review Discussion',
    };
    expect(getNodeLabel(node)).toBe('Code Review Discussion');
  });

  it('returns purpose-based label for ConversationThread without title', () => {
    const node: LabelableNode = { id: '123', kind: 'ConversationThread', purpose: 'coding' };
    expect(getNodeLabel(node)).toBe('Coding thread');
  });

  it('returns Conversation for ConversationThread with no label data', () => {
    const node: LabelableNode = { id: '123', kind: 'ConversationThread' };
    expect(getNodeLabel(node)).toBe('Conversation');
  });

  it('prefers label over other properties', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Source',
      label: 'Label Value',
      title: 'Title Value',
      name: 'Name Value',
    };
    expect(getNodeLabel(node)).toBe('Label Value');
  });

  it('prefers title over name and other properties', () => {
    const node: LabelableNode = {
      id: '123',
      kind: 'Source',
      title: 'Title Value',
      name: 'Name Value',
      role: 'user',
    };
    expect(getNodeLabel(node)).toBe('Title Value');
  });
});

describe('truncateText', () => {
  it('does not truncate text shorter than maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('does not truncate text equal to maxLength', () => {
    expect(truncateText('hello', 5)).toBe('hello');
  });

  it('truncates text longer than maxLength and adds ellipsis', () => {
    expect(truncateText('hello world', 8)).toBe('hello w\u2026');
  });

  it('handles single character maxLength', () => {
    expect(truncateText('hello', 1)).toBe('\u2026');
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('uses unicode ellipsis character', () => {
    const result = truncateText('hello world', 6);
    expect(result).toContain('\u2026');
    expect(result).not.toContain('...');
  });
});
