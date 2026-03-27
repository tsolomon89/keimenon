import type { GraphEdge, GraphNode } from '@keimenon/graph';

export interface GraphEdgeWithData extends GraphEdge {
  data?: Record<string, unknown>;
}

export function edgeEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

export function buildNeighborhood(nodeId: string, edges: GraphEdgeWithData[], depth = 2): Set<string> {
  const neighbors = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);

  for (let iteration = 0; iteration < depth; iteration += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      const sourceId = edgeEndpointId(edge.source as string | GraphNode);
      const targetId = edgeEndpointId(edge.target as string | GraphNode);
      if (frontier.has(sourceId) && !neighbors.has(targetId)) {
        next.add(targetId);
      } else if (frontier.has(targetId) && !neighbors.has(sourceId)) {
        next.add(sourceId);
      }
    }
    next.forEach((id) => neighbors.add(id));
    frontier = next;
    if (frontier.size === 0) {
      break;
    }
  }

  return neighbors;
}

export function computeCenter(points: Array<[number, number, number]>): [number, number, number] {
  if (points.length === 0) {
    return [0, 0, 0];
  }

  const sum = points.reduce<[number, number, number]>(
    (accumulator, point) => [
      accumulator[0] + point[0],
      accumulator[1] + point[1],
      accumulator[2] + point[2],
    ],
    [0, 0, 0]
  );

  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

