/**
 * DB Worker Protocol
 *
 * Typed operation/result definitions for the off-main-thread SQLite worker.
 * The worker runs long-running DB operations (import flushes, authority scoring,
 * bulk deletes, index rebuilds) on a dedicated thread so the main thread's
 * event loop is never blocked.
 *
 * This file is imported by both the worker thread and the main thread client.
 * It must not import anything that depends on Express, SSE, or main-thread
 * infrastructure.
 */

// ---------------------------------------------------------------------------
// Serialized graph entities (structured-clone safe for postMessage)
// ---------------------------------------------------------------------------

export interface SerializedNode {
  id: string;
  kind: string;
  properties: string; // pre-stringified JSON
  account_id: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  data_tag: string;
  content_hash: string;
  canonical_content: string;
  is_duplicate: number; // 0 or 1
  original_node_id: string | null;
}

export interface SerializedEdge {
  id: string;
  kind: string;
  from_id: string;
  to_id: string;
  properties: string; // pre-stringified JSON
  account_id: string;
  created_by: string;
  created_at: number;
  data_tag: string;
}

// ---------------------------------------------------------------------------
// Worker initialization (passed as workerData)
// ---------------------------------------------------------------------------

export interface DbWorkerInit {
  dbPath: string;
}

// ---------------------------------------------------------------------------
// Operations (main thread → worker)
// ---------------------------------------------------------------------------

export interface FlushImportBatchOp {
  type: 'flushImportBatch';
  id: string;
  payload: {
    nodes: SerializedNode[];
    edges: SerializedEdge[];
  };
}

export interface SourceSpanPayload {
  node_id: string;
  source_id: string;
  message_id?: string | null;
  conversation_id?: string | null;
  text: string;
  normalized_text: string;
  start_char: number;
  end_char: number;
  boundary_kind?: string;
  span_hash: string;
  metadata?: Record<string, unknown> | null;
}

export interface PhrasePayload {
  node_id: string;
  text: string;
  normalized_text: string;
  type?: string;
  entity_type?: string | null;
  frequency?: number;
  metadata?: Record<string, unknown> | null;
}

export interface PacketPayload {
  node_id: string;
  text: string;
  normalized_text: string;
  occurrences?: number;
  mass?: number;
  coverage?: number;
  idf?: number;
  entropy_factor?: number;
  packet_hash: string;
  metadata?: Record<string, unknown> | null;
}

export interface AtomicUnitPayload {
  node_id: string;
  unit_type: string;
  value: string;
  normalized_value: string;
  unit_hash: string;
  metadata?: Record<string, unknown> | null;
}

export interface GraphBatchPayload {
  batchId: string;
  importId?: string;
  accountId: string;
  createdBy: string;
  metadata: {
    batchIndex: number;
    totalBatches: number;
    source?: string;
    isFinalBatch?: boolean;
  };
  skinnyNodes: SerializedNode[];
  normalizedPayloads: {
    sourceSpans: SourceSpanPayload[];
    phrases: PhrasePayload[];
    packets: PacketPayload[];
    atomicUnits: AtomicUnitPayload[];
  };
  genericNodes: SerializedNode[];
  edges: SerializedEdge[];
  dependencies?: {
    nodeIds: string[];
    edgeEndpointIds: string[];
  };
}

export interface BulkInsertGraphBatchOp {
  type: 'bulkInsertGraphBatch';
  id: string;
  payload: GraphBatchPayload;
}

export interface ComputeAuthorityOp {
  type: 'computeAuthority';
  id: string;
  payload: {
    accountId: string;
  };
}

export interface DeleteSubgraphOp {
  type: 'deleteSubgraph';
  id: string;
  payload: {
    accountId: string;
    scope: 'keimenon' | 'all-clients';
    isAdmin: boolean;
  };
}

export interface RebuildInvertedIndexOp {
  type: 'rebuildInvertedIndex';
  id: string;
  payload: {
    accountId: string;
  };
}

export interface HealthCheckOp {
  type: 'healthCheck';
  id: string;
  payload: Record<string, never>;
}

export type DbWorkerOperation =
  | FlushImportBatchOp
  | BulkInsertGraphBatchOp
  | ComputeAuthorityOp
  | DeleteSubgraphOp
  | RebuildInvertedIndexOp
  | HealthCheckOp;

// ---------------------------------------------------------------------------
// Results (worker → main thread)
// ---------------------------------------------------------------------------

export interface FlushImportBatchResult {
  nodesWritten: number;
  edgesWritten: number;
  totalWritten: number;
  fkFailures: number;
}

export interface BatchResult {
  nodesWritten: number;
  edgesWritten: number;
  payloadsWritten: number;
  quarantinedRows: number;
  success: boolean;
  error?: string;
}

export interface ComputeAuthorityResult {
  phraseScores: number;
  sourceScores: number;
  topicScores: number;
  durationMs: number;
}

export interface DeleteSubgraphResult {
  nodesDeleted: number;
  edgesDeleted: number;
  durationMs: number;
}

export interface RebuildInvertedIndexResult {
  postingCount: number;
  uniqueTerms: number;
  sourceCount: number;
  spanCount: number;
  durationMs: number;
}

export interface HealthCheckResult {
  ok: boolean;
  dbPath: string;
  nodeCount: number;
  edgeCount: number;
}

// ---------------------------------------------------------------------------
// Worker response messages (worker → main thread)
// ---------------------------------------------------------------------------

export interface DbWorkerResultMessage {
  type: 'result';
  id: string;
  data: unknown;
}

export interface DbWorkerErrorMessage {
  type: 'error';
  id: string;
  error: string;
  stack?: string;
}

export interface DbWorkerProgressMessage {
  type: 'progress';
  id: string;
  progress: {
    phase: string;
    current: number;
    total: number;
    message?: string;
  };
}

export interface BulkProgressEvent {
  batchId: string;
  phase:
    | 'validate'
    | 'insert_nodes'
    | 'insert_payloads'
    | 'insert_edges'
    | 'foreign_key_check'
    | 'commit'
    | 'quarantine'
    | 'complete'
    | 'error';
  batchIndex: number;
  totalBatches: number;
  nodesWritten: number;
  edgesWritten: number;
  payloadsWritten: number;
  quarantinedRows: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
  error?: string;
}

export interface DbWorkerBulkProgressMessage {
  type: 'bulk_progress';
  id: string;
  progress: BulkProgressEvent;
}

export type DbWorkerMessage =
  | DbWorkerResultMessage
  | DbWorkerErrorMessage
  | DbWorkerProgressMessage
  | DbWorkerBulkProgressMessage;
