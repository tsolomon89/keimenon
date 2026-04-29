export interface SnapshotNodeRecord {
  id: string;
  kind: string;
  properties: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

export interface SnapshotEdgeRecord {
  id: string;
  kind: string;
  from: string;
  to: string;
  properties: Record<string, unknown>;
  created_at?: number;
}

export type GraphSelectionStrategy = 'anchor_first_v1';

export interface GraphSnapshotMetadata {
  total_nodes: number;
  total_edges: number;
  selected_node_count: number;
  selected_edge_count: number;
  truncated: boolean;
  selection_strategy: GraphSelectionStrategy;
  edge_kind_breakdown: Record<string, number>;
}

export interface GraphSnapshotResponse {
  nodes: SnapshotNodeRecord[];
  edges: SnapshotEdgeRecord[];
  metadata: GraphSnapshotMetadata;
}

export interface BuildGraphSnapshotOptions {
  nodes: SnapshotNodeRecord[];
  edges: SnapshotEdgeRecord[];
  totalNodes: number;
  totalEdges: number;
  nodeBudget: number;
  edgeBudget: number;
  seedNodeIds?: string[];
}

export const DEFAULT_NODE_BUDGET = 8000;
export const DEFAULT_EDGE_BUDGET = 30000;
export const HARD_NODE_BUDGET_MAX = 12000;
export const HARD_EDGE_BUDGET_MAX = 50000;

export const EXCLUDED_DEFAULT_EDGE_KINDS = new Set(['HAS_SPAN', 'OCCURS_IN_SPAN']);

const ANCHOR_NODE_KINDS = new Set([
  'AccountNode',
  'Principal',
  'Group',
  'Source',
  'ObjectiveClaim',
]);

const LOW_VALUE_NODE_KINDS = new Set(['Lexeme', 'SourceSpan', 'AtomicUnit', 'Packet']);

const NODE_KIND_BASE_PRIORITY: Record<string, number> = {
  AccountNode: 200,
  Principal: 195,
  Group: 188,
  Source: 186,
  ObjectiveClaim: 184,
  ConversationThread: 172,
  ChatThread: 170,
  SourceDoc: 166,
  Topic: 162,
  Message: 160,
  CodeBlock: 154,
  Phrase: 148,
  Folder: 140,
  UserNode: 138,
  AgentNode: 138,
  Constellation: 136,
  VerifiedSource: 132,
  VerifiedClaim: 132,
};

const HIERARCHY_EDGE_KINDS = new Set([
  'OWNED_BY',
  'CREATED_BY',
  'IN_GROUP',
  'FOLDS_INTO_FOLDER',
  'HAS_MESSAGE',
  'CONTAINS',
]);

const EDGE_KIND_BASE_PRIORITY: Record<string, number> = {
  OWNED_BY: 200,
  CREATED_BY: 195,
  IN_GROUP: 190,
  FOLDS_INTO_FOLDER: 186,
  HAS_MESSAGE: 172,
  CONTAINS: 168,
  DERIVES_FROM: 162,
  STITCHED_FROM: 156,
  COMPILED_FROM: 154,
  EXTRACTED_FROM: 152,
  SIMILAR_TO: 148,
  DUP_OF: 140,
  COMPOSED_OF_ATOMIC: 120,
};

function parseFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractNodeMass(node: SnapshotNodeRecord): number {
  const props = node.properties || {};
  const candidates = [
    props.mass,
    props.weightedMass,
    props.weighted_mass,
    props.score,
    props.importance,
  ];
  for (const candidate of candidates) {
    const parsed = parseFiniteNumber(candidate, Number.NaN);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function extractEdgeStrength(edge: SnapshotEdgeRecord): number {
  const props = edge.properties || {};
  const candidates = [props.strength, props.score, props.similarity, props.weight];
  for (const candidate of candidates) {
    const parsed = parseFiniteNumber(candidate, Number.NaN);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0.1;
}

function nodePriorityScore(node: SnapshotNodeRecord): number {
  const base =
    NODE_KIND_BASE_PRIORITY[node.kind] ?? (LOW_VALUE_NODE_KINDS.has(node.kind) ? 40 : 90);
  const anchorBoost = ANCHOR_NODE_KINDS.has(node.kind) ? 50 : 0;
  const massBoost = Math.min(25, extractNodeMass(node) * 10);
  const recencyBoost = Math.min(10, parseFiniteNumber(node.created_at, 0) / 1_000_000_000_000);
  return base + anchorBoost + massBoost + recencyBoost;
}

function edgePriorityScore(edge: SnapshotEdgeRecord): number {
  const base = EDGE_KIND_BASE_PRIORITY[edge.kind] ?? 90;
  const hierarchyBoost = HIERARCHY_EDGE_KINDS.has(edge.kind) ? 40 : 0;
  const strengthBoost = Math.min(30, extractEdgeStrength(edge) * 25);
  return base + hierarchyBoost + strengthBoost;
}

function compareNodesByPriority(a: SnapshotNodeRecord, b: SnapshotNodeRecord): number {
  const scoreDelta = edgeAwareCompare(nodePriorityScore(a), nodePriorityScore(b));
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return a.id.localeCompare(b.id);
}

function compareEdgesByPriority(a: SnapshotEdgeRecord, b: SnapshotEdgeRecord): number {
  const scoreDelta = edgeAwareCompare(edgePriorityScore(a), edgePriorityScore(b));
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return a.id.localeCompare(b.id);
}

function edgeAwareCompare(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function normalizeBudget(value: number, fallback: number, hardMax: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(value), hardMax));
}

function boundedArray(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed.length > 0) deduped.add(trimmed);
    if (deduped.size >= 300) break;
  }
  return Array.from(deduped.values());
}

export function buildGraphSnapshotResponse(
  options: BuildGraphSnapshotOptions
): GraphSnapshotResponse {
  const nodeBudget = normalizeBudget(options.nodeBudget, DEFAULT_NODE_BUDGET, HARD_NODE_BUDGET_MAX);
  const edgeBudget = normalizeBudget(options.edgeBudget, DEFAULT_EDGE_BUDGET, HARD_EDGE_BUDGET_MAX);
  const seedNodeIds = boundedArray(options.seedNodeIds);

  const nodeById = new Map<string, SnapshotNodeRecord>();
  for (const node of options.nodes) {
    nodeById.set(node.id, node);
  }

  const anchorNodes = options.nodes
    .filter((node) => ANCHOR_NODE_KINDS.has(node.kind))
    .sort(compareNodesByPriority);

  const selectedNodeIds = new Set<string>();

  for (const seedNodeId of seedNodeIds) {
    if (nodeById.has(seedNodeId)) {
      selectedNodeIds.add(seedNodeId);
    }
  }

  for (const anchorNode of anchorNodes) {
    if (selectedNodeIds.size >= nodeBudget) break;
    selectedNodeIds.add(anchorNode.id);
  }

  const nodeCandidates = [...options.nodes].sort(compareNodesByPriority);
  for (const node of nodeCandidates) {
    if (selectedNodeIds.size >= nodeBudget) break;
    selectedNodeIds.add(node.id);
  }

  const edgeCandidates = options.edges
    .filter((edge) => !EXCLUDED_DEFAULT_EDGE_KINDS.has(edge.kind))
    .sort(compareEdgesByPriority);

  let selectedEdges = edgeCandidates.filter(
    (edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to)
  );

  if (selectedEdges.length === 0 && selectedNodeIds.size > 0 && edgeCandidates.length > 0) {
    for (const edge of edgeCandidates) {
      if (
        selectedNodeIds.size >= nodeBudget &&
        selectedNodeIds.has(edge.from) &&
        selectedNodeIds.has(edge.to)
      ) {
        selectedEdges.push(edge);
        if (selectedEdges.length >= Math.min(edgeBudget, 24)) break;
        continue;
      }

      if (selectedNodeIds.size < nodeBudget && nodeById.has(edge.from) && nodeById.has(edge.to)) {
        selectedNodeIds.add(edge.from);
        if (selectedNodeIds.size < nodeBudget) {
          selectedNodeIds.add(edge.to);
        }
        if (selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to)) {
          selectedEdges.push(edge);
        }
        if (selectedEdges.length >= Math.min(edgeBudget, 24)) break;
      }
    }
  }

  selectedEdges = selectedEdges.slice(0, edgeBudget);

  const selectedNodes = [...selectedNodeIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is SnapshotNodeRecord => !!node)
    .sort(compareNodesByPriority)
    .slice(0, nodeBudget);

  const selectedNodeIdSet = new Set(selectedNodes.map((node) => node.id));
  const filteredEdges = selectedEdges
    .filter((edge) => selectedNodeIdSet.has(edge.from) && selectedNodeIdSet.has(edge.to))
    .slice(0, edgeBudget);

  const edgeKindBreakdown: Record<string, number> = {};
  for (const edge of filteredEdges) {
    edgeKindBreakdown[edge.kind] = (edgeKindBreakdown[edge.kind] || 0) + 1;
  }

  const truncated =
    selectedNodes.length < options.totalNodes || filteredEdges.length < options.totalEdges;

  return {
    nodes: selectedNodes,
    edges: filteredEdges,
    metadata: {
      total_nodes: options.totalNodes,
      total_edges: options.totalEdges,
      selected_node_count: selectedNodes.length,
      selected_edge_count: filteredEdges.length,
      truncated,
      selection_strategy: 'anchor_first_v1',
      edge_kind_breakdown: edgeKindBreakdown,
    },
  };
}
