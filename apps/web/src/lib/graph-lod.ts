import type { GraphEdge, GraphNode } from '@keimenon/graph';
import {
  buildClusterPlan,
  clusterToGraphNode,
  clusterEdgeToGraphEdge,
  type ClusterPlan,
} from './cluster-supernodes';

export type LODLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface BuildLodPlanInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  zoom: number;
  focusNodeId?: string | null;
  focusMode?: boolean;
  pinnedNodeIds?: string[];
  minMass?: number;
  includeConnectors?: boolean;
  optimizeLevel?: number;
  /** When true, L0 zoom produces cluster supernodes instead of individual nodes. */
  enableClusters?: boolean;
}

export interface LodPerformanceGate {
  datasetTier: 'default' | '10k' | '50k';
  pass: boolean;
  nodeBudget: number;
  edgeBudget: number;
  visibleNodes: number;
  visibleEdges: number;
}

export interface LodPlanStats {
  level: LODLevel;
  totalNodeCount: number;
  totalEdgeCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
  focusNodeId: string | null;
  focusMode: boolean;
  pinnedNodeCount: number;
  gate: LodPerformanceGate;
  /** Present when L0 cluster aggregation is active */
  clusterStats?: {
    clusterCount: number;
    passthroughCount: number;
    interClusterEdgeCount: number;
    orphanClusterMemberCount: number;
  };
}

export interface LodPlan {
  level: LODLevel;
  visibleNodes: GraphNode[];
  visibleEdges: GraphEdge[];
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
  stats: LodPlanStats;
  /** Full cluster plan data when L0 cluster aggregation is active */
  clusterPlan?: ClusterPlan;
}

const L0_KINDS = new Set([
  'AccountNode',
  'Principal',
  'UserNode',
  'AgentNode',
  'Group',
  'Folder',
  'Constellation',
  'ObjectiveClaim',
  'UnifiedDoc',
]);

const L1_KINDS = new Set([
  ...L0_KINDS,
  'Source',
  'SourceDoc',
  'ChatThread',
  'ConversationThread',
  'VerifiedSource',
  'VerifiedClaim',
]);

const L2_KINDS = new Set([
  ...L1_KINDS,
  'Topic',
  'Phrase',
  'Packet',
  'CodeBlock',
  'Lexeme',
  'SourceSpan',
]);

const HIERARCHY_ANCHOR_KINDS = new Set([
  'AccountNode',
  'Principal',
  'UserNode',
  'AgentNode',
  'Group',
  'Source',
  'SourceDoc',
  'ConversationThread',
  'ChatThread',
]);

const COMMON_CONNECTOR_TERMS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'is',
  'are',
  'for',
  'on',
  'with',
  'it',
  'this',
  'that',
]);

const BASE_NODE_BUDGETS: Record<LODLevel, number> = {
  L0: 240,
  L1: 3200,
  L2: 14000,
  L3: 60000,
};

const BASE_EDGE_BUDGETS: Record<LODLevel, number> = {
  L0: 1600,
  L1: 14000,
  L2: 60000,
  L3: 180000,
};

const EDGE_STRENGTH_MINIMUM: Record<LODLevel, number> = {
  L0: 0.7,
  L1: 0.5,
  L2: 0.25,
  L3: 0,
};

const EDGE_SURVIVAL_FLOOR = 24;

const HIERARCHY_CONNECTOR_EDGE_KINDS = new Set([
  'OWNED_BY',
  'CREATED_BY',
  'IN_GROUP',
  'FOLDS_INTO_FOLDER',
  'CONTAINS',
  'HAS_MESSAGE',
]);

const MASS_MINIMUM_BY_LEVEL: Record<LODLevel, number> = {
  L0: 0.6,
  L1: 0.25,
  L2: 0.05,
  L3: 0,
};

function normalizeZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0.1;
  }
  return value;
}

export function resolveLodLevel(zoom: number): LODLevel {
  const z = normalizeZoom(zoom);
  if (z < 0.22) {
    return 'L0';
  }
  if (z < 0.55) {
    return 'L1';
  }
  if (z < 1.2) {
    return 'L2';
  }
  return 'L3';
}

function edgeEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function extractNodeMass(node: GraphNode): number {
  const candidate = node as GraphNode & {
    mass?: unknown;
    weightedMass?: unknown;
    weighted_mass?: unknown;
    strength?: unknown;
    importance?: unknown;
    metadata?: Record<string, unknown>;
  };

  const values = [
    candidate.mass,
    candidate.weightedMass,
    candidate.weighted_mass,
    candidate.strength,
    candidate.importance,
    candidate.metadata?.mass,
    candidate.metadata?.weightedMass,
    candidate.metadata?.weighted_mass,
    candidate.metadata?.strength,
  ];

  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }

  return 1;
}

function extractEdgeStrength(edge: GraphEdge): number {
  const candidate = edge as GraphEdge & {
    strength?: unknown;
    weight?: unknown;
    data?: Record<string, unknown>;
  };

  const values = [
    candidate.strength,
    candidate.weight,
    candidate.data?.strength,
    candidate.data?.score,
    candidate.data?.similarity,
    candidate.data?.weight,
  ];

  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }

  return 0.5;
}

function kindAllowedAtLevel(kind: string, level: LODLevel): boolean {
  if (level === 'L0') {
    return L0_KINDS.has(kind);
  }
  if (level === 'L1') {
    return L1_KINDS.has(kind);
  }
  if (level === 'L2') {
    return L2_KINDS.has(kind);
  }
  return true;
}

function normalizeOptimizeLevel(value?: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.floor(value as number)));
}

function resolveNodeBudget(level: LODLevel, optimizeLevel: number): number {
  const base = BASE_NODE_BUDGETS[level];
  if (optimizeLevel === 0) {
    return base;
  }
  const shrinkFactor = 1 + optimizeLevel * 0.35;
  return Math.max(60, Math.floor(base / shrinkFactor));
}

function resolveEdgeBudget(level: LODLevel, optimizeLevel: number): number {
  const base = BASE_EDGE_BUDGETS[level];
  if (optimizeLevel === 0) {
    return base;
  }
  const shrinkFactor = 1 + optimizeLevel * 0.4;
  return Math.max(200, Math.floor(base / shrinkFactor));
}

function resolveMassThreshold(level: LODLevel, minMass: number, optimizeLevel: number): number {
  const baseline = MASS_MINIMUM_BY_LEVEL[level];
  const optimizeBump = optimizeLevel * 0.08;
  return Math.max(minMass, baseline + optimizeBump);
}

function extractConnectorTerm(node: GraphNode): string | null {
  const candidate = node as GraphNode & {
    text?: unknown;
    lemma?: unknown;
    title?: unknown;
    name?: unknown;
    label?: unknown;
  };

  const options = [
    candidate.text,
    candidate.lemma,
    candidate.title,
    candidate.name,
    candidate.label,
  ];
  for (const value of options) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
  }

  return null;
}

function buildNeighborhood(nodeId: string, edges: GraphEdge[], depth: number): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);
    if (!adjacency.has(sourceId)) {
      adjacency.set(sourceId, new Set());
    }
    if (!adjacency.has(targetId)) {
      adjacency.set(targetId, new Set());
    }
    adjacency.get(sourceId)?.add(targetId);
    adjacency.get(targetId)?.add(sourceId);
  }

  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let i = 0; i < depth; i += 1) {
    const nextFrontier = new Set<string>();
    for (const current of frontier) {
      const neighbors = adjacency.get(current);
      if (!neighbors) {
        continue;
      }
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.add(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return visited;
}

function sortNodesByMass(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => {
    const massDelta = extractNodeMass(b) - extractNodeMass(a);
    if (massDelta !== 0) {
      return massDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

function sortEdgesByStrength(edges: GraphEdge[]): GraphEdge[] {
  return [...edges].sort((a, b) => {
    const strengthDelta = extractEdgeStrength(b) - extractEdgeStrength(a);
    if (strengthDelta !== 0) {
      return strengthDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

function sortEdgesByConnectorPriority(edges: GraphEdge[]): GraphEdge[] {
  return [...edges].sort((a, b) => {
    const aPriority = HIERARCHY_CONNECTOR_EDGE_KINDS.has(a.kind) ? 1 : 0;
    const bPriority = HIERARCHY_CONNECTOR_EDGE_KINDS.has(b.kind) ? 1 : 0;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    const strengthDelta = extractEdgeStrength(b) - extractEdgeStrength(a);
    if (strengthDelta !== 0) {
      return strengthDelta;
    }

    return a.id.localeCompare(b.id);
  });
}

export function evaluateLodPerformanceGate(input: {
  level: LODLevel;
  totalNodeCount: number;
  visibleNodeCount: number;
  visibleEdgeCount: number;
}): LodPerformanceGate {
  const tier: LodPerformanceGate['datasetTier'] =
    input.totalNodeCount >= 50_000 ? '50k' : input.totalNodeCount >= 10_000 ? '10k' : 'default';

  const tierNodeMultiplier = tier === '50k' ? 1.35 : tier === '10k' ? 1.15 : 1;
  const tierEdgeMultiplier = tier === '50k' ? 1.4 : tier === '10k' ? 1.2 : 1;

  const nodeBudget = Math.max(50, Math.floor(BASE_NODE_BUDGETS[input.level] * tierNodeMultiplier));
  const edgeBudget = Math.max(200, Math.floor(BASE_EDGE_BUDGETS[input.level] * tierEdgeMultiplier));

  return {
    datasetTier: tier,
    pass: input.visibleNodeCount <= nodeBudget && input.visibleEdgeCount <= edgeBudget,
    nodeBudget,
    edgeBudget,
    visibleNodes: input.visibleNodeCount,
    visibleEdges: input.visibleEdgeCount,
  };
}

export function buildLodPlan(input: BuildLodPlanInput): LodPlan {
  const level = resolveLodLevel(input.zoom);
  const optimizeLevel = normalizeOptimizeLevel(input.optimizeLevel);
  const focusNodeId = input.focusNodeId || null;
  const focusMode = input.focusMode === true;
  const pinnedNodeIds = new Set((input.pinnedNodeIds || []).filter((value) => value.length > 0));
  const includeConnectors = input.includeConnectors === true;
  const minMass = Number.isFinite(input.minMass) ? Math.max(0, input.minMass as number) : 0;
  const enableClusters = input.enableClusters === true;

  // ─── L0 Cluster Aggregation Path ───
  if (level === 'L0' && enableClusters && !focusMode) {
    const clusterPlan = buildClusterPlan(input.nodes, input.edges);

    // Convert clusters to synthetic GraphNodes
    const clusterNodes = clusterPlan.clusters.map(clusterToGraphNode);
    const passthroughNodes = clusterPlan.passthrough;
    const allVisibleNodes = [...passthroughNodes, ...clusterNodes];

    // Convert inter-cluster edges to GraphEdges
    const clusterEdges = clusterPlan.clusterEdges.map(clusterEdgeToGraphEdge);

    // Also include direct edges between passthrough nodes
    const passthroughIds = new Set(passthroughNodes.map((n) => n.id));
    const passthroughEdges = input.edges.filter((edge) => {
      const sourceId = edgeEndpointId(edge.source);
      const targetId = edgeEndpointId(edge.target);
      return passthroughIds.has(sourceId) && passthroughIds.has(targetId);
    });

    // Also include edges from passthrough to cluster anchors (now cluster IDs)
    const anchorToClusterId = new Map<string, string>();
    for (const cluster of clusterPlan.clusters) {
      anchorToClusterId.set(cluster.anchorId, cluster.id);
    }

    const passthroughToClusterEdges: GraphEdge[] = [];
    for (const edge of input.edges) {
      const sourceId = edgeEndpointId(edge.source);
      const targetId = edgeEndpointId(edge.target);

      // passthrough → cluster member
      const sourceCluster = clusterPlan.nodeToCluster.get(sourceId);
      const targetCluster = clusterPlan.nodeToCluster.get(targetId);

      if (
        passthroughIds.has(sourceId) &&
        targetCluster &&
        !targetCluster.startsWith('passthrough:')
      ) {
        passthroughToClusterEdges.push({
          ...edge,
          id: `ptc_${edge.id}`,
          target: targetCluster,
        } as unknown as GraphEdge);
      } else if (
        passthroughIds.has(targetId) &&
        sourceCluster &&
        !sourceCluster.startsWith('passthrough:')
      ) {
        passthroughToClusterEdges.push({
          ...edge,
          id: `ptc_${edge.id}`,
          source: sourceCluster,
        } as unknown as GraphEdge);
      }
    }

    // Deduplicate passthrough-to-cluster edges by source|target pair
    const ptcSeen = new Set<string>();
    const dedupedPtcEdges = passthroughToClusterEdges.filter((edge) => {
      const key = `${edgeEndpointId(edge.source)}|${edgeEndpointId(edge.target)}`;
      if (ptcSeen.has(key)) return false;
      ptcSeen.add(key);
      return true;
    });

    const allVisibleEdges = [...passthroughEdges, ...clusterEdges, ...dedupedPtcEdges];

    const visibleNodeIds = new Set(allVisibleNodes.map((n) => n.id));
    const visibleEdgeIds = new Set(allVisibleEdges.map((e) => e.id));

    const gate = evaluateLodPerformanceGate({
      level,
      totalNodeCount: input.nodes.length,
      visibleNodeCount: allVisibleNodes.length,
      visibleEdgeCount: allVisibleEdges.length,
    });

    return {
      level,
      visibleNodes: allVisibleNodes,
      visibleEdges: allVisibleEdges,
      visibleNodeIds,
      visibleEdgeIds,
      clusterPlan,
      stats: {
        level,
        totalNodeCount: input.nodes.length,
        totalEdgeCount: input.edges.length,
        visibleNodeCount: allVisibleNodes.length,
        visibleEdgeCount: allVisibleEdges.length,
        hiddenNodeCount: Math.max(0, input.nodes.length - allVisibleNodes.length),
        hiddenEdgeCount: Math.max(0, input.edges.length - allVisibleEdges.length),
        focusNodeId,
        focusMode,
        pinnedNodeCount: pinnedNodeIds.size,
        gate,
        clusterStats: clusterPlan.stats,
      },
    };
  }
  const massThreshold = resolveMassThreshold(level, minMass, optimizeLevel);
  const nodeBudget = resolveNodeBudget(level, optimizeLevel);
  const edgeBudget = resolveEdgeBudget(level, optimizeLevel);

  let visibleNodes = input.nodes.filter((node) => kindAllowedAtLevel(node.kind, level));
  visibleNodes = visibleNodes.filter((node) => extractNodeMass(node) >= massThreshold);

  if (!includeConnectors && level === 'L3') {
    visibleNodes = visibleNodes.filter((node) => {
      if (node.kind !== 'Lexeme' && node.kind !== 'Phrase') {
        return true;
      }
      const connector = extractConnectorTerm(node);
      return connector ? !COMMON_CONNECTOR_TERMS.has(connector) : true;
    });
  }

  if (focusNodeId && focusMode) {
    const neighborhood = buildNeighborhood(focusNodeId, input.edges, 2);
    visibleNodes = visibleNodes.filter((node) => neighborhood.has(node.id));
  }

  const mustKeepNodeIds = new Set<string>(pinnedNodeIds);
  if (focusNodeId) {
    mustKeepNodeIds.add(focusNodeId);
  }

  // Phase 2: LOD Policy Hardening
  // Ensure structural anchors are always preserved and bypass mass/budget culling.
  for (const node of input.nodes) {
    if (HIERARCHY_ANCHOR_KINDS.has(node.kind)) {
      mustKeepNodeIds.add(node.id);
    }
  }

  if (mustKeepNodeIds.size > 0) {
    const currentlyVisible = new Set(visibleNodes.map((node) => node.id));
    for (const pinnedNodeId of mustKeepNodeIds) {
      if (currentlyVisible.has(pinnedNodeId)) {
        continue;
      }

      const pinnedNode = input.nodes.find((node) => node.id === pinnedNodeId);
      if (!pinnedNode) {
        continue;
      }

      visibleNodes.push(pinnedNode);
      currentlyVisible.add(pinnedNodeId);
    }
  }

  if (input.nodes.length > 0 && visibleNodes.length === 0) {
    const fallbackAnchors = input.nodes.filter((node) => HIERARCHY_ANCHOR_KINDS.has(node.kind));
    if (fallbackAnchors.length > 0) {
      visibleNodes = sortNodesByMass(fallbackAnchors).slice(0, nodeBudget);
    } else {
      visibleNodes = sortNodesByMass(input.nodes).slice(0, Math.max(1, Math.min(nodeBudget, 8)));
    }
  }

  if (visibleNodes.length > nodeBudget) {
    const mustKeepNodes = visibleNodes.filter((node) => mustKeepNodeIds.has(node.id));
    const optionalNodes = visibleNodes.filter((node) => !mustKeepNodeIds.has(node.id));
    const remainingBudget = Math.max(0, nodeBudget - mustKeepNodes.length);
    visibleNodes = [...mustKeepNodes, ...sortNodesByMass(optionalNodes).slice(0, remainingBudget)];
  }

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const minimumEdgeStrength = EDGE_STRENGTH_MINIMUM[level] + optimizeLevel * 0.05;

  let visibleEdges = input.edges.filter((edge) => {
    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);
    if (!visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) {
      return false;
    }

    if (focusNodeId && (sourceId === focusNodeId || targetId === focusNodeId)) {
      return true;
    }

    if (pinnedNodeIds.has(sourceId) || pinnedNodeIds.has(targetId)) {
      return true;
    }

    return extractEdgeStrength(edge) >= minimumEdgeStrength;
  });

  if (visibleEdges.length > edgeBudget) {
    visibleEdges = sortEdgesByStrength(visibleEdges).slice(0, edgeBudget);
  }

  if (visibleNodes.length > 0 && visibleEdges.length === 0 && input.edges.length > 0) {
    const fallbackCandidates = input.edges.filter((edge) => {
      const sourceId = edgeEndpointId(edge.source);
      const targetId = edgeEndpointId(edge.target);
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    if (fallbackCandidates.length > 0) {
      visibleEdges = sortEdgesByConnectorPriority(fallbackCandidates).slice(
        0,
        Math.min(edgeBudget, EDGE_SURVIVAL_FLOOR)
      );
    }
  }

  const visibleEdgeIds = new Set(visibleEdges.map((edge) => edge.id));
  const gate = evaluateLodPerformanceGate({
    level,
    totalNodeCount: input.nodes.length,
    visibleNodeCount: visibleNodes.length,
    visibleEdgeCount: visibleEdges.length,
  });

  return {
    level,
    visibleNodes,
    visibleEdges,
    visibleNodeIds,
    visibleEdgeIds,
    stats: {
      level,
      totalNodeCount: input.nodes.length,
      totalEdgeCount: input.edges.length,
      visibleNodeCount: visibleNodes.length,
      visibleEdgeCount: visibleEdges.length,
      hiddenNodeCount: Math.max(0, input.nodes.length - visibleNodes.length),
      hiddenEdgeCount: Math.max(0, input.edges.length - visibleEdges.length),
      focusNodeId,
      focusMode,
      pinnedNodeCount: pinnedNodeIds.size,
      gate,
    },
  };
}
