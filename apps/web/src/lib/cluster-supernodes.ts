/**
 * L0 Supernode Aggregation
 *
 * Creates synthetic "cluster supernode" representations for L0 galactic zoom-out.
 * Clusters are formed from group membership edges — each Group/Folder node becomes
 * a cluster anchor, and its member nodes are aggregated into the cluster.
 *
 * At L0, instead of showing individual Source/Topic/Phrase nodes, we show:
 *   - AccountNode at origin
 *   - Principal nodes in shell 1
 *   - Group supernodes in shell 2 (sized by member count + aggregate mass)
 *   - Orphan supernodes for nodes not belonging to any group
 *
 * This module is pure and deterministic — same input → same output.
 *
 * @module cluster-supernodes
 */

import type { GraphNode, GraphEdge } from '@keimenon/graph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterSupernode {
  /** Synthetic node ID: `cluster:${anchorId}` */
  id: string;
  /** The anchor node (Group, Folder, or synthetic orphan anchor) */
  anchorId: string;
  /** Display label for the cluster */
  label: string;
  /** Member node IDs aggregated into this cluster */
  memberIds: string[];
  /** Total member count (including the anchor itself) */
  memberCount: number;
  /** Aggregated mass (sum of member masses) */
  aggregateMass: number;
  /** Inter-cluster edge count (edges connecting to other clusters) */
  interClusterEdgeCount: number;
  /** The kind used for rendering: always 'ClusterSupernode' */
  kind: 'ClusterSupernode';
}

export interface ClusterEdge {
  /** Synthetic edge ID */
  id: string;
  /** Source cluster ID */
  sourceClusterId: string;
  /** Target cluster ID */
  targetClusterId: string;
  /** Number of underlying edges between these clusters */
  weight: number;
  /** Kind for rendering */
  kind: 'CLUSTER_LINK';
}

export interface ClusterPlan {
  /** Cluster supernodes to render */
  clusters: ClusterSupernode[];
  /** Inter-cluster edges */
  clusterEdges: ClusterEdge[];
  /** Original nodes that should still render individually (AccountNode, Principal, etc.) */
  passthrough: GraphNode[];
  /** Lookup: original nodeId → clusterId */
  nodeToCluster: Map<string, string>;
  /** Stats for debugging */
  stats: {
    totalInputNodes: number;
    totalInputEdges: number;
    clusterCount: number;
    passthroughCount: number;
    interClusterEdgeCount: number;
    orphanClusterMemberCount: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Node kinds that are passed through at L0 and NOT aggregated into clusters.
 * These are the "galactic anchors" — always rendered individually.
 */
const L0_PASSTHROUGH_KINDS = new Set(['AccountNode', 'Principal', 'UserNode', 'AgentNode']);

/**
 * Node kinds that serve as cluster anchors.
 * Each anchor becomes a ClusterSupernode at L0.
 */
const CLUSTER_ANCHOR_KINDS = new Set(['Group', 'Folder']);

/**
 * Edge kinds that express group membership (child → group).
 * Used to assign nodes to cluster anchors.
 */
const MEMBERSHIP_EDGE_KINDS = new Set(['IN_GROUP', 'FOLDS_INTO_FOLDER', 'CONTAINS']);

/** Minimum cluster size to be rendered (clusters with fewer members are merged into orphans) */
const MIN_CLUSTER_SIZE = 2;

/** Orphan cluster ID for ungrouped nodes */
const ORPHAN_CLUSTER_ID = 'cluster:__orphans__';

// ---------------------------------------------------------------------------
// Mass extraction (mirrors graph-lod.ts extractNodeMass)
// ---------------------------------------------------------------------------

function extractMass(node: GraphNode): number {
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
  ];

  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }

  return 1;
}

// ---------------------------------------------------------------------------
// Edge endpoint resolution
// ---------------------------------------------------------------------------

function edgeEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

// ---------------------------------------------------------------------------
// Label extraction
// ---------------------------------------------------------------------------

function extractLabel(node: GraphNode): string {
  const candidate = node as GraphNode & {
    label?: string;
    title?: string;
    name?: string;
    text?: string;
  };

  return candidate.label || candidate.title || candidate.name || candidate.text || node.kind;
}

// ---------------------------------------------------------------------------
// Core: buildClusterPlan
// ---------------------------------------------------------------------------

/**
 * Build a cluster plan from the full graph.
 *
 * Groups nodes into clusters based on membership edges, creates synthetic
 * ClusterSupernode objects, and computes inter-cluster edges.
 *
 * **Pure function**: same input → same output (deterministic).
 *
 * @param nodes All graph nodes
 * @param edges All graph edges
 * @returns A ClusterPlan with supernodes, inter-cluster edges, and passthrough nodes
 */
export function buildClusterPlan(nodes: GraphNode[], edges: GraphEdge[]): ClusterPlan {
  if (nodes.length === 0) {
    return {
      clusters: [],
      clusterEdges: [],
      passthrough: [],
      nodeToCluster: new Map(),
      stats: {
        totalInputNodes: 0,
        totalInputEdges: 0,
        clusterCount: 0,
        passthroughCount: 0,
        interClusterEdgeCount: 0,
        orphanClusterMemberCount: 0,
      },
    };
  }

  const nodeById = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  // ─── Step 1: Identify passthrough nodes and cluster anchors ───

  const passthrough: GraphNode[] = [];
  const clusterAnchors = new Map<string, GraphNode>(); // anchorId → node
  const aggregableNodes: GraphNode[] = [];

  for (const node of nodes) {
    if (L0_PASSTHROUGH_KINDS.has(node.kind)) {
      passthrough.push(node);
    } else if (CLUSTER_ANCHOR_KINDS.has(node.kind)) {
      clusterAnchors.set(node.id, node);
    } else {
      aggregableNodes.push(node);
    }
  }

  // ─── Step 2: Assign nodes to cluster anchors via membership edges ───

  // nodeId → anchorId (the group/folder this node belongs to)
  const nodeToAnchor = new Map<string, string>();

  for (const edge of edges) {
    if (!MEMBERSHIP_EDGE_KINDS.has(edge.kind)) {
      continue;
    }

    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);

    if (edge.kind === 'CONTAINS') {
      // parent → child: sourceId is anchor, targetId is member
      if (clusterAnchors.has(sourceId) && !nodeToAnchor.has(targetId)) {
        nodeToAnchor.set(targetId, sourceId);
      }
    } else {
      // child → parent: sourceId is member, targetId is anchor
      if (clusterAnchors.has(targetId) && !nodeToAnchor.has(sourceId)) {
        nodeToAnchor.set(sourceId, targetId);
      }
    }
  }

  // ─── Step 3: Build cluster member lists ───

  const clusterMembers = new Map<string, string[]>(); // anchorId → memberIds

  // Initialize with all anchors
  for (const anchorId of clusterAnchors.keys()) {
    clusterMembers.set(anchorId, []);
  }

  const orphanNodes: GraphNode[] = [];

  for (const node of aggregableNodes) {
    const anchorId = nodeToAnchor.get(node.id);
    if (anchorId && clusterMembers.has(anchorId)) {
      clusterMembers.get(anchorId)!.push(node.id);
    } else {
      orphanNodes.push(node);
    }
  }

  // ─── Step 4: Merge tiny clusters into orphans ───

  const tinyClusterAnchors: string[] = [];
  for (const [anchorId, members] of clusterMembers.entries()) {
    if (members.length < MIN_CLUSTER_SIZE) {
      tinyClusterAnchors.push(anchorId);
      // Move members to orphans
      for (const memberId of members) {
        const memberNode = nodeById.get(memberId);
        if (memberNode) {
          orphanNodes.push(memberNode);
        }
      }
      // Move the anchor itself to orphans
      const anchorNode = clusterAnchors.get(anchorId);
      if (anchorNode) {
        orphanNodes.push(anchorNode);
      }
    }
  }

  for (const anchorId of tinyClusterAnchors) {
    clusterMembers.delete(anchorId);
    clusterAnchors.delete(anchorId);
  }

  // ─── Step 5: Build nodeToCluster lookup ───

  const nodeToCluster = new Map<string, string>();

  for (const [anchorId, members] of clusterMembers.entries()) {
    const clusterId = `cluster:${anchorId}`;
    nodeToCluster.set(anchorId, clusterId);
    for (const memberId of members) {
      nodeToCluster.set(memberId, clusterId);
    }
  }

  // Orphan cluster
  if (orphanNodes.length > 0) {
    for (const node of orphanNodes) {
      nodeToCluster.set(node.id, ORPHAN_CLUSTER_ID);
    }
  }

  // Also assign passthrough nodes for edge resolution
  for (const node of passthrough) {
    nodeToCluster.set(node.id, `passthrough:${node.id}`);
  }

  // ─── Step 6: Create ClusterSupernode objects ───

  const clusters: ClusterSupernode[] = [];

  for (const [anchorId, members] of clusterMembers.entries()) {
    const anchorNode = clusterAnchors.get(anchorId)!;
    const allMemberIds = [anchorId, ...members];
    const aggregateMass = allMemberIds.reduce((sum, id) => {
      const node = nodeById.get(id);
      return sum + (node ? extractMass(node) : 0);
    }, 0);

    clusters.push({
      id: `cluster:${anchorId}`,
      anchorId,
      label: extractLabel(anchorNode),
      memberIds: allMemberIds,
      memberCount: allMemberIds.length,
      aggregateMass,
      interClusterEdgeCount: 0, // Computed in step 7
      kind: 'ClusterSupernode',
    });
  }

  // Orphan cluster
  if (orphanNodes.length > 0) {
    const orphanMass = orphanNodes.reduce((sum, node) => sum + extractMass(node), 0);
    clusters.push({
      id: ORPHAN_CLUSTER_ID,
      anchorId: '__orphans__',
      label: `Ungrouped (${orphanNodes.length})`,
      memberIds: orphanNodes.map((n) => n.id),
      memberCount: orphanNodes.length,
      aggregateMass: orphanMass,
      interClusterEdgeCount: 0,
      kind: 'ClusterSupernode',
    });
  }

  // Sort clusters by aggregate mass (descending) for deterministic ordering
  clusters.sort((a, b) => {
    const massDelta = b.aggregateMass - a.aggregateMass;
    if (massDelta !== 0) return massDelta;
    return a.id.localeCompare(b.id);
  });

  // ─── Step 7: Compute inter-cluster edges ───

  const interClusterCounts = new Map<string, number>(); // "clusterA|clusterB" → count

  for (const edge of edges) {
    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);

    const sourceCluster = nodeToCluster.get(sourceId);
    const targetCluster = nodeToCluster.get(targetId);

    if (!sourceCluster || !targetCluster) continue;
    if (sourceCluster === targetCluster) continue;

    // Skip passthrough↔passthrough edges (they'll be rendered directly)
    if (sourceCluster.startsWith('passthrough:') && targetCluster.startsWith('passthrough:')) {
      continue;
    }

    // Normalize edge key for deduplication
    const key =
      sourceCluster < targetCluster
        ? `${sourceCluster}|${targetCluster}`
        : `${targetCluster}|${sourceCluster}`;

    interClusterCounts.set(key, (interClusterCounts.get(key) ?? 0) + 1);
  }

  const clusterEdges: ClusterEdge[] = [];
  let edgeIndex = 0;

  for (const [key, weight] of interClusterCounts.entries()) {
    const [sourceClusterId, targetClusterId] = key.split('|');
    clusterEdges.push({
      id: `cluster_edge_${edgeIndex++}`,
      sourceClusterId,
      targetClusterId,
      weight,
      kind: 'CLUSTER_LINK',
    });
  }

  // Sort edges by weight for deterministic ordering
  clusterEdges.sort((a, b) => {
    const weightDelta = b.weight - a.weight;
    if (weightDelta !== 0) return weightDelta;
    return a.id.localeCompare(b.id);
  });

  // Update interClusterEdgeCount on each cluster
  for (const edge of clusterEdges) {
    const sourceCluster = clusters.find((c) => c.id === edge.sourceClusterId);
    const targetCluster = clusters.find((c) => c.id === edge.targetClusterId);
    if (sourceCluster) sourceCluster.interClusterEdgeCount += 1;
    if (targetCluster) targetCluster.interClusterEdgeCount += 1;
  }

  return {
    clusters,
    clusterEdges,
    passthrough,
    nodeToCluster,
    stats: {
      totalInputNodes: nodes.length,
      totalInputEdges: edges.length,
      clusterCount: clusters.length,
      passthroughCount: passthrough.length,
      interClusterEdgeCount: clusterEdges.length,
      orphanClusterMemberCount: orphanNodes.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers for rendering integration
// ---------------------------------------------------------------------------

/**
 * Convert a ClusterSupernode to a GraphNode for rendering in the standard pipeline.
 *
 * The synthetic GraphNode gets:
 * - kind: 'Constellation' (maps to shell 5 in layout, but we override position)
 * - mass: aggregateMass (for radius computation)
 * - label/name: cluster label
 */
export function clusterToGraphNode(cluster: ClusterSupernode): GraphNode {
  return {
    id: cluster.id,
    kind: 'Constellation',
    label: cluster.label,
    name: cluster.label,
    mass: cluster.aggregateMass,
    // Metadata for tooltip/detail panel
    text: `${cluster.memberCount} nodes`,
  } as unknown as GraphNode;
}

/**
 * Compute a display radius for a cluster based on member count.
 * Returns a radius in the same scale as resolveNodeRadius (3–14 range).
 */
export function clusterRadius(cluster: ClusterSupernode): number {
  // Base radius 11 (same as Group), scaled up logarithmically by member count
  return Math.min(20, 11 + Math.log2(Math.max(1, cluster.memberCount)));
}

/**
 * Convert inter-cluster edges to GraphEdge format for the edge rendering pipeline.
 */
export function clusterEdgeToGraphEdge(edge: ClusterEdge): GraphEdge {
  return {
    id: edge.id,
    kind: 'SIMILAR_TO', // Use SIMILAR_TO for standard edge rendering
    source: edge.sourceClusterId,
    target: edge.targetClusterId,
    data: { strength: Math.min(1, edge.weight / 50), weight: edge.weight },
  } as unknown as GraphEdge;
}
