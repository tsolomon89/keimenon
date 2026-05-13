import { describe, it, expect } from 'vitest';
import { buildConversationContextFromSelection } from '../conversation-context';
import { KeimenonNode } from '@/store/keimenonStore';

describe('buildConversationContextFromSelection', () => {
  const createMockNode = (id: string, kind: string): KeimenonNode => ({
    id,
    type: kind,
    kind,
    position: { x: 0, y: 0 },
    data: { label: id },
  });

  it('maps eligible source-like kinds to source_ids', () => {
    const nodes = [
      createMockNode('s1', 'Source'),
      createMockNode('s2', 'SourceDoc'),
      createMockNode('s3', 'VerifiedSource'),
    ];

    const result = buildConversationContextFromSelection(nodes);

    expect(result.contextSpec.source_ids).toEqual(['s1', 's2', 's3']);
    expect(result.contextSpec.group_ids).toEqual([]);
    expect(result.selectedNodeCount).toBe(3);
    expect(result.unsupportedNodeCount).toBe(0);
  });

  it('maps eligible group-like kinds to group_ids', () => {
    const nodes = [createMockNode('g1', 'Group'), createMockNode('g2', 'Folder')];

    const result = buildConversationContextFromSelection(nodes);

    expect(result.contextSpec.source_ids).toEqual([]);
    expect(result.contextSpec.group_ids).toEqual(['g1', 'g2']);
    expect(result.selectedNodeCount).toBe(2);
    expect(result.unsupportedNodeCount).toBe(0);
  });

  it('ignores ineligible kinds and counts them as unsupported', () => {
    const nodes = [
      createMockNode('u1', 'Phrase'),
      createMockNode('u2', 'SourceSpan'),
      createMockNode('u3', 'AccountNode'),
      createMockNode('u4', 'Topic'),
      createMockNode('u5', 'Packet'),
      createMockNode('u6', 'AtomicUnit'),
      createMockNode('u7', 'Message'),
      createMockNode('u8', 'ConversationThread'),
      createMockNode('u9', 'CodeBlock'),
      createMockNode('u10', 'Principal'),
    ];

    const result = buildConversationContextFromSelection(nodes);

    expect(result.contextSpec.source_ids).toEqual([]);
    expect(result.contextSpec.group_ids).toEqual([]);
    expect(result.selectedNodeCount).toBe(10);
    expect(result.unsupportedNodeCount).toBe(10);
  });

  it('handles a mixed selection correctly', () => {
    const nodes = [
      createMockNode('s1', 'Source'),
      createMockNode('g1', 'Group'),
      createMockNode('u1', 'Phrase'),
      createMockNode('s2', 'SourceDoc'),
    ];

    const result = buildConversationContextFromSelection(nodes);

    expect(result.contextSpec.source_ids).toEqual(['s1', 's2']);
    expect(result.contextSpec.group_ids).toEqual(['g1']);
    expect(result.selectedNodeCount).toBe(4);
    expect(result.unsupportedNodeCount).toBe(1);
  });
});
