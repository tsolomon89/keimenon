import { GraphNode, GraphEdge } from './layout';

/**
 * Calculate distance between two nodes
 */
export function distance(a: GraphNode, b: GraphNode): number {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find nearest node to a point
 */
export function findNearestNode(
  point: { x: number; y: number },
  nodes: GraphNode[],
  maxDistance = Infinity
): GraphNode | null {
  let nearest: GraphNode | null = null;
  let minDist = maxDistance;

  for (const node of nodes) {
    const dx = (node.x ?? 0) - point.x;
    const dy = (node.y ?? 0) - point.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return nearest;
}

/**
 * Find all nodes within a rectangular selection (lasso)
 */
export function findNodesInRect(
  nodes: GraphNode[],
  rect: { x: number; y: number; width: number; height: number }
): GraphNode[] {
  const { x, y, width, height } = rect;
  const x2 = x + width;
  const y2 = y + height;

  return nodes.filter((node) => {
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    return nx >= x && nx <= x2 && ny >= y && ny <= y2;
  });
}

/**
 * Find all nodes within a polygonal selection (free-form lasso)
 */
export function findNodesInPolygon(
  nodes: GraphNode[],
  polygon: { x: number; y: number }[]
): GraphNode[] {
  return nodes.filter((node) =>
    isPointInPolygon({ x: node.x ?? 0, y: node.y ?? 0 }, polygon)
  );
}

/**
 * Point-in-polygon test using ray casting algorithm
 */
function isPointInPolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[]
): boolean {
  let inside = false;
  const { x, y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Get all edges connected to a node
 */
export function getConnectedEdges(
  nodeId: string,
  edges: GraphEdge[]
): GraphEdge[] {
  return edges.filter((edge) => {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
    return sourceId === nodeId || targetId === nodeId;
  });
}

/**
 * Get all neighbors of a node
 */
export function getNeighbors(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphNode[] {
  const neighborIds = new Set<string>();

  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;

    if (sourceId === nodeId) {
      neighborIds.add(targetId);
    } else if (targetId === nodeId) {
      neighborIds.add(sourceId);
    }
  }

  return nodes.filter((node) => neighborIds.has(node.id));
}

/**
 * Calculate graph statistics
 */
export function getGraphStats(nodes: GraphNode[], edges: GraphEdge[]) {
  const degreeMap = new Map<string, number>();

  // Initialize degrees
  for (const node of nodes) {
    degreeMap.set(node.id, 0);
  }

  // Count edges
  for (const edge of edges) {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;

    degreeMap.set(sourceId, (degreeMap.get(sourceId) ?? 0) + 1);
    degreeMap.set(targetId, (degreeMap.get(targetId) ?? 0) + 1);
  }

  const degrees = Array.from(degreeMap.values());
  const avgDegree = degrees.reduce((a, b) => a + b, 0) / degrees.length || 0;
  const maxDegree = Math.max(...degrees, 0);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    avgDegree,
    maxDegree,
    density: (2 * edges.length) / (nodes.length * (nodes.length - 1)) || 0,
  };
}
