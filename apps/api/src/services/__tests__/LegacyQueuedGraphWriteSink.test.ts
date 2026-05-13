/**
 * LegacyQueuedGraphWriteSink – Normalized Payload Persistence Tests
 *
 * Verifies that the legacy fallback sink correctly converts normalized
 * payload data (SourceSpan, Phrase, Packet, AtomicUnit) into AnyNode
 * objects that the DatabaseWriteQueue can persist via SQLiteClient.createNode.
 *
 * This ensures graph identity rows are always created alongside their
 * required payload rows — preserving search, authority scoring,
 * semantic spine, and Migration 040 FK invariants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LegacyQueuedGraphWriteSink } from '../GraphWriteSink';
import type { GraphBatchPayload } from '../../workers/db-worker-protocol';
import type { DatabaseWriteQueue } from '../DatabaseWriteQueue';

/**
 * Minimal mock of DatabaseWriteQueue that tracks enqueue calls
 * without requiring a real SQLite database.
 */
function createMockWriteQueue(): DatabaseWriteQueue {
  return {
    enqueueNodes: vi.fn(),
    enqueueEdges: vi.fn(),
    forceFlush: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseWriteQueue;
}

/**
 * Build a minimal GraphBatchPayload for testing.
 */
function createBatchPayload(overrides: Partial<GraphBatchPayload> = {}): GraphBatchPayload {
  return {
    batchId: `test_batch_${Date.now()}`,
    accountId: 'test_account',
    createdBy: 'test_user',
    metadata: {
      batchIndex: 1,
      totalBatches: 1,
      isFinalBatch: true,
    },
    skinnyNodes: [],
    genericNodes: [],
    edges: [],
    normalizedPayloads: {
      sourceSpans: [],
      phrases: [],
      packets: [],
      atomicUnits: [],
    },
    ...overrides,
  };
}

describe('LegacyQueuedGraphWriteSink – normalized payload persistence', () => {
  let mockQueue: DatabaseWriteQueue;
  let sink: LegacyQueuedGraphWriteSink;

  beforeEach(() => {
    mockQueue = createMockWriteQueue();
    sink = new LegacyQueuedGraphWriteSink(mockQueue);
  });

  it('should persist Phrase payload rows as AnyNode objects', async () => {
    const batch = createBatchPayload({
      skinnyNodes: [
        {
          id: 'phrase_node_1',
          kind: 'Phrase',
          properties: JSON.stringify({
            id: 'phrase_node_1',
            kind: 'Phrase',
            text: 'test phrase',
            account_id: 'test_account',
            created_by: 'test_user',
          }),
          account_id: 'test_account',
          created_by: 'test_user',
          created_at: Date.now(),
          updated_at: Date.now(),
          data_tag: 'real',
          content_hash: 'hash_phrase_1',
          canonical_content: 'test phrase',
          is_duplicate: 0,
          original_node_id: null,
        },
      ],
      normalizedPayloads: {
        sourceSpans: [],
        phrases: [
          {
            node_id: 'phrase_node_1',
            text: 'test phrase',
            normalized_text: 'test phrase',
            type: 'n-gram',
            entity_type: null,
            frequency: 3,
            metadata: null,
          },
        ],
        packets: [],
        atomicUnits: [],
      },
    });

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.payloadsWritten).toBe(1);
    // 1 skinny node + 1 phrase payload = 2 nodes enqueued
    expect(result.nodesWritten).toBe(2);

    // Verify enqueueNodes was called with both the skinny node and the phrase payload
    expect(mockQueue.enqueueNodes).toHaveBeenCalledTimes(1);
    const enqueuedNodes = (mockQueue.enqueueNodes as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(enqueuedNodes).toHaveLength(2);

    // The phrase payload node should have kind: 'Phrase'
    const phraseNode = enqueuedNodes.find(
      (n: any) => n.kind === 'Phrase' && n.text === 'test phrase'
    );
    expect(phraseNode).toBeDefined();
    expect(phraseNode.id).toBe('phrase_node_1');
    expect(phraseNode.account_id).toBe('test_account');
  });

  it('should persist SourceSpan payload rows as AnyNode objects', async () => {
    const batch = createBatchPayload({
      skinnyNodes: [
        {
          id: 'span_node_1',
          kind: 'SourceSpan',
          properties: JSON.stringify({
            id: 'span_node_1',
            kind: 'SourceSpan',
            text: 'a test span',
            source_id: 'source_1',
            account_id: 'test_account',
            created_by: 'test_user',
          }),
          account_id: 'test_account',
          created_by: 'test_user',
          created_at: Date.now(),
          updated_at: Date.now(),
          data_tag: 'real',
          content_hash: 'hash_span_1',
          canonical_content: 'a test span',
          is_duplicate: 0,
          original_node_id: null,
        },
      ],
      normalizedPayloads: {
        sourceSpans: [
          {
            node_id: 'span_node_1',
            source_id: 'source_1',
            text: 'a test span',
            normalized_text: 'a test span',
            start_char: 0,
            end_char: 11,
            boundary_kind: 'sentence',
            span_hash: 'hash_span_1',
            metadata: null,
          },
        ],
        phrases: [],
        packets: [],
        atomicUnits: [],
      },
    });

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.payloadsWritten).toBe(1);

    const enqueuedNodes = (mockQueue.enqueueNodes as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Should have 2 nodes: 1 skinny + 1 payload-derived
    expect(enqueuedNodes).toHaveLength(2);
    // The payload-derived node has span_hash set (the skinny node parsed from JSON does not)
    const spanNode = enqueuedNodes.find((n: any) => n.kind === 'SourceSpan' && n.span_hash);
    expect(spanNode).toBeDefined();
    expect(spanNode.source_id).toBe('source_1');
    expect(spanNode.span_hash).toBe('hash_span_1');
  });

  it('should persist mixed payload types with correct counts', async () => {
    const batch = createBatchPayload({
      normalizedPayloads: {
        sourceSpans: [
          {
            node_id: 'span_1',
            source_id: 'source_1',
            text: 'span',
            normalized_text: 'span',
            start_char: 0,
            end_char: 4,
            span_hash: 'h1',
          },
        ],
        phrases: [
          {
            node_id: 'phrase_1',
            text: 'phrase',
            normalized_text: 'phrase',
          },
        ],
        packets: [
          {
            node_id: 'packet_1',
            text: 'packet',
            normalized_text: 'packet',
            packet_hash: 'h2',
          },
        ],
        atomicUnits: [
          {
            node_id: 'unit_1',
            unit_type: 'code',
            value: 'x = 1',
            normalized_value: 'x = 1',
            unit_hash: 'h3',
          },
        ],
      },
    });

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.payloadsWritten).toBe(4);
    expect(result.nodesWritten).toBe(4); // All payloads converted to nodes

    const enqueuedNodes = (mockQueue.enqueueNodes as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(enqueuedNodes).toHaveLength(4);

    // Verify each kind is represented
    const kinds = enqueuedNodes.map((n: any) => n.kind);
    expect(kinds).toContain('SourceSpan');
    expect(kinds).toContain('Phrase');
    expect(kinds).toContain('Packet');
    expect(kinds).toContain('AtomicUnit');
  });

  it('should report correct payloadsWritten count for multiple phrases', async () => {
    const batch = createBatchPayload({
      normalizedPayloads: {
        sourceSpans: [],
        phrases: [
          {
            node_id: 'p1',
            text: 'a',
            normalized_text: 'a',
          },
          {
            node_id: 'p2',
            text: 'b',
            normalized_text: 'b',
          },
        ],
        packets: [],
        atomicUnits: [],
      },
    });

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.payloadsWritten).toBe(2);
    expect(result.nodesWritten).toBe(2);
  });

  it('should succeed for batches with empty normalized payloads', async () => {
    const batch = createBatchPayload({
      skinnyNodes: [],
      genericNodes: [
        {
          id: 'group_node_1',
          kind: 'Group',
          properties: JSON.stringify({
            id: 'group_node_1',
            kind: 'Group',
            name: 'Test Group',
            account_id: 'test_account',
            created_by: 'test_user',
          }),
          account_id: 'test_account',
          created_by: 'test_user',
          created_at: Date.now(),
          updated_at: Date.now(),
          data_tag: 'real',
          content_hash: null,
          canonical_content: null,
          is_duplicate: 0,
          original_node_id: null,
        },
      ],
      normalizedPayloads: {
        sourceSpans: [],
        phrases: [],
        packets: [],
        atomicUnits: [],
      },
    });

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.nodesWritten).toBe(1);
    expect(result.payloadsWritten).toBe(0);
    expect(mockQueue.enqueueNodes).toHaveBeenCalledTimes(1);
  });

  it('should succeed for batches with no normalizedPayloads property', async () => {
    // Construct a batch that doesn't have normalizedPayloads at all
    // (pre-normalization era batches)
    const batch = createBatchPayload();
    // Remove normalized payloads to simulate a pre-normalization batch
    (batch as any).normalizedPayloads = undefined;

    const result = await sink.writeGraphBatch(batch);

    expect(result.success).toBe(true);
    expect(result.payloadsWritten).toBe(0);
  });
});
