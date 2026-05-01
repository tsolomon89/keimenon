import { AnyNode, AnyEdge } from '@keimenon/types';
import { GraphWriteSink } from './GraphWriteSink';
import {
  GraphBatchPayload,
  SerializedNode,
  SerializedEdge,
  SourceSpanPayload,
  PhrasePayload,
  PacketPayload,
  AtomicUnitPayload,
} from '../workers/db-worker-protocol';
import { contentHashForNodeType, canonicalizeForNodeType } from '@keimenon/parsers';
import { nanoid } from 'nanoid';

/**
 * Safely extract properties from a node.
 * Handles: JSON string, plain object, null, undefined.
 */
function safeExtractProperties(node: AnyNode): Record<string, any> {
  const raw = (node as any).properties;

  if (raw == null) {
    // properties missing — use node itself as the property source
    return { ...(node as any) };
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      // Unparseable string — use node itself
      return { ...(node as any) };
    }
  }

  if (typeof raw === 'object') {
    // Already an object
    return raw;
  }

  // Fallback
  return { ...(node as any) };
}

export class GraphBatchAccumulator {
  private skinnyNodes: SerializedNode[] = [];
  private genericNodes: SerializedNode[] = [];
  private edges: SerializedEdge[] = [];

  private sourceSpans: SourceSpanPayload[] = [];
  private phrases: PhrasePayload[] = [];
  private packets: PacketPayload[] = [];
  private atomicUnits: AtomicUnitPayload[] = [];

  private batchCount = 0;

  constructor(
    private sink: GraphWriteSink,
    private accountId: string,
    private userId: string,
    private importId?: string,
    private maxItemsPerBatch = 1000
  ) {}

  async addNode(node: AnyNode): Promise<void> {
    const serialized = this.serializeNode(node);

    if (['SourceSpan', 'Phrase', 'Packet', 'AtomicUnit'].includes(node.kind)) {
      this.skinnyNodes.push(serialized);
      const props = safeExtractProperties(node);

      switch (node.kind) {
        case 'SourceSpan':
          this.sourceSpans.push({
            node_id: node.id,
            source_id: props.source_id || '',
            message_id: props.message_id || null,
            conversation_id: props.conversation_id || null,
            text: props.text || '',
            normalized_text: props.normalized_text || (props.text || '').toLowerCase(),
            start_char: typeof props.start_char === 'number' ? props.start_char : 0,
            end_char: typeof props.end_char === 'number' ? props.end_char : 0,
            boundary_kind: props.boundary_kind || 'sentence',
            span_hash: props.span_hash || props.content_hash || '',
            metadata: props.metadata || null,
          });
          break;
        case 'Phrase':
          this.phrases.push({
            node_id: node.id,
            text: props.text || '',
            normalized_text: props.normalized_text || (props.text || '').toLowerCase(),
            type: props.type || 'n-gram',
            entity_type: props.entity_type || null,
            frequency: typeof props.frequency === 'number' ? props.frequency : 0,
            metadata: props.metadata || null,
          });
          break;
        case 'Packet':
          this.packets.push({
            node_id: node.id,
            text: props.text || '',
            normalized_text: props.normalized_text || (props.text || '').toLowerCase(),
            occurrences: typeof props.occurrences === 'number' ? props.occurrences : 1,
            mass: typeof props.mass === 'number' ? props.mass : 0,
            coverage: typeof props.coverage === 'number' ? props.coverage : 0,
            idf: typeof props.idf === 'number' ? props.idf : 0,
            entropy_factor: typeof props.entropy_factor === 'number' ? props.entropy_factor : 0,
            packet_hash: props.packet_hash || props.content_hash || '',
            metadata: props.metadata || null,
          });
          break;
        case 'AtomicUnit':
          this.atomicUnits.push({
            node_id: node.id,
            unit_type: props.unit_type || '',
            value: props.value || '',
            normalized_value: props.normalized_value || (props.value || '').toLowerCase(),
            unit_hash: props.unit_hash || props.content_hash || '',
            metadata: props.metadata || null,
          });
          break;
      }
    } else {
      this.genericNodes.push(serialized);
    }

    await this.checkFlush();
  }

  async addEdge(edge: AnyEdge): Promise<void> {
    this.edges.push(this.serializeEdge(edge));
    await this.checkFlush();
  }

  private async checkFlush(force = false): Promise<void> {
    const totalItems = this.skinnyNodes.length + this.genericNodes.length + this.edges.length;
    if (totalItems >= this.maxItemsPerBatch || (force && totalItems > 0)) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    const totalItems = this.skinnyNodes.length + this.genericNodes.length + this.edges.length;
    if (totalItems === 0) return;

    this.batchCount++;
    const payload: GraphBatchPayload = {
      batchId: `batch_${Date.now()}_${nanoid(6)}`,
      importId: this.importId,
      accountId: this.accountId,
      createdBy: this.userId,
      metadata: {
        batchIndex: this.batchCount,
        totalBatches: -1, // Unknown until complete
        isFinalBatch: false,
      },
      skinnyNodes: [...this.skinnyNodes],
      genericNodes: [...this.genericNodes],
      edges: [...this.edges],
      normalizedPayloads: {
        sourceSpans: [...this.sourceSpans],
        phrases: [...this.phrases],
        packets: [...this.packets],
        atomicUnits: [...this.atomicUnits],
      },
    };

    // Clear internal queues
    this.skinnyNodes = [];
    this.genericNodes = [];
    this.edges = [];
    this.sourceSpans = [];
    this.phrases = [];
    this.packets = [];
    this.atomicUnits = [];

    await this.sink.writeGraphBatch(payload);
  }

  async complete(): Promise<void> {
    await this.checkFlush(true);
    await this.sink.flush();
  }

  private serializeNode(node: AnyNode): SerializedNode {
    const nodeData: any = node;
    // For properties: if it's already a string, use it; otherwise stringify the node
    const propsStr =
      typeof nodeData.properties === 'string' ? nodeData.properties : JSON.stringify(node);
    return {
      id: node.id,
      kind: node.kind,
      properties: propsStr,
      account_id: nodeData.account_id || this.accountId,
      created_by: nodeData.created_by || this.userId,
      created_at: node.created_at || Date.now(),
      updated_at: node.updated_at || Date.now(),
      data_tag: nodeData.data_tag || 'real',
      content_hash: contentHashForNodeType(node.kind, node),
      canonical_content: canonicalizeForNodeType(node.kind, node),
      is_duplicate: 0,
      original_node_id: null,
    };
  }

  private serializeEdge(edge: AnyEdge): SerializedEdge {
    const edgeData: any = edge;
    return {
      id: edge.id,
      kind: edge.kind,
      from_id: edge.from,
      to_id: edge.to,
      properties: JSON.stringify(edge),
      account_id: edgeData.account_id || this.accountId,
      created_by: edgeData.created_by || this.userId,
      created_at: edge.created_at || Date.now(),
      data_tag: edgeData.data_tag || 'real',
    };
  }
}
