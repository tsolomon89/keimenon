import { AnyNode, AnyEdge } from '@keimenon/types';
import { GraphWriteSink } from './GraphWriteSink';
import { GraphBatchPayload, SerializedNode, SerializedEdge } from '../workers/db-worker-protocol';
import { contentHashForNodeType, canonicalizeForNodeType } from '@keimenon/parsers';
import { nanoid } from 'nanoid';

export class GraphBatchAccumulator {
  private skinnyNodes: SerializedNode[] = [];
  private genericNodes: SerializedNode[] = [];
  private edges: SerializedEdge[] = [];

  private sourceSpans: any[] = [];
  private phrases: any[] = [];
  private packets: any[] = [];
  private atomicUnits: any[] = [];

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
      const props = JSON.parse(node.properties as any);
      props.node_id = node.id;

      switch (node.kind) {
        case 'SourceSpan':
          this.sourceSpans.push(props);
          break;
        case 'Phrase':
          this.phrases.push(props);
          break;
        case 'Packet':
          this.packets.push(props);
          break;
        case 'AtomicUnit':
          this.atomicUnits.push(props);
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
    return {
      id: node.id,
      kind: node.kind,
      properties: JSON.stringify(node),
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
