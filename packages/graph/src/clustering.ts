import { GraphNode } from './layout';

/**
 * Simple rule-based clustering for MVP
 * Groups nodes by their 'kind' property and basic heuristics
 */
export interface Cluster {
  id: string;
  name: string;
  nodeIds: string[];
  centroid: { x: number; y: number };
}

/**
 * Cluster nodes by type (Source, Group, etc.)
 */
export function clusterByType(nodes: GraphNode[]): Cluster[] {
  const clusters = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const kind = node.kind;
    if (!clusters.has(kind)) {
      clusters.set(kind, []);
    }
    clusters.get(kind)!.push(node);
  }

  const result: Cluster[] = [];
  let index = 0;

  for (const [kind, clusterNodes] of clusters.entries()) {
    const centroid = calculateCentroid(clusterNodes);
    result.push({
      id: `cluster_${kind}_${index++}`,
      name: `${kind}s`,
      nodeIds: clusterNodes.map((n) => n.id),
      centroid,
    });
  }

  return result;
}

/**
 * Cluster nodes by a metadata property (e.g., mime_type, domain)
 */
export function clusterByProperty(
  nodes: GraphNode[],
  property: string
): Cluster[] {
  const clusters = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const value = (node as any)[property] ?? 'unknown';
    if (!clusters.has(value)) {
      clusters.set(value, []);
    }
    clusters.get(value)!.push(node);
  }

  const result: Cluster[] = [];
  let index = 0;

  for (const [value, clusterNodes] of clusters.entries()) {
    const centroid = calculateCentroid(clusterNodes);
    result.push({
      id: `cluster_${property}_${value}_${index++}`,
      name: value,
      nodeIds: clusterNodes.map((n) => n.id),
      centroid,
    });
  }

  return result;
}

/**
 * Calculate centroid (average position) of a set of nodes
 */
export function calculateCentroid(nodes: GraphNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  const sumX = nodes.reduce((sum, node) => sum + (node.x ?? 0), 0);
  const sumY = nodes.reduce((sum, node) => sum + (node.y ?? 0), 0);

  return {
    x: sumX / nodes.length,
    y: sumY / nodes.length,
  };
}

/**
 * Create constellation nodes from clusters
 * (aggregated view for large graphs)
 */
export function createConstellations(
  clusters: Cluster[],
  minSize = 3
): Cluster[] {
  // Only create constellations for clusters with enough nodes
  return clusters.filter((cluster) => cluster.nodeIds.length >= minSize);
}

/**
 * K-means clustering (simple implementation for spatial grouping)
 */
export function kMeansClustering(
  nodes: GraphNode[],
  k: number,
  maxIterations = 50
): Cluster[] {
  if (nodes.length === 0 || k <= 0) return [];

  // Initialize centroids randomly
  const centroids = nodes
    .slice(0, k)
    .map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 }));

  let assignments = new Array(nodes.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign nodes to nearest centroid
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodePos = { x: node.x ?? 0, y: node.y ?? 0 };

      let minDist = Infinity;
      let closestCluster = 0;

      for (let j = 0; j < k; j++) {
        const dist = euclideanDistance(nodePos, centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          closestCluster = j;
        }
      }

      if (assignments[i] !== closestCluster) {
        assignments[i] = closestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Recalculate centroids
    for (let j = 0; j < k; j++) {
      const clusterNodes = nodes.filter((_, i) => assignments[i] === j);
      if (clusterNodes.length > 0) {
        centroids[j] = calculateCentroid(clusterNodes);
      }
    }
  }

  // Build cluster results
  const clusters: Cluster[] = [];
  for (let j = 0; j < k; j++) {
    const clusterNodes = nodes.filter((_, i) => assignments[i] === j);
    if (clusterNodes.length > 0) {
      clusters.push({
        id: `cluster_kmeans_${j}`,
        name: `Cluster ${j + 1}`,
        nodeIds: clusterNodes.map((n) => n.id),
        centroid: centroids[j],
      });
    }
  }

  return clusters;
}

function euclideanDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
