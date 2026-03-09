import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  // Optional label properties (spread from KeimenonNode.data.metadata)
  label?: string;
  title?: string;
  name?: string;
  role?: string;
  language?: string;
  text?: string;
  lemma?: string;
  claim_text?: string;
  normalized_text?: string;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  id: string;
  kind: string;
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface LayoutConfig {
  width: number;
  height: number;
  seed?: number;
  strength?: number;
  distance?: number;
  iterations?: number;
}

/**
 * Create a D3 force simulation instance (for interactive use)
 */
export function createSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: LayoutConfig
): Simulation<GraphNode, GraphEdge> {
  const { width, height, strength = -300, distance = 100 } = config;

  return forceSimulation(nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphEdge>(edges)
        .id((d) => d.id)
        .distance(distance)
    )
    .force('charge', forceManyBody().strength(strength))
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'collide',
      forceCollide<GraphNode>().radius((d) => getNodeRadius(d.kind))
    )
    .alphaDecay(0.05) // 3× faster convergence (~80 ticks vs ~300)
    .velocityDecay(0.6); // Faster settling, reduces overshooting
}

/**
 * Calculate 2D force-directed layout for graph nodes
 * Uses D3-force with stable seeding for reproducibility
 */
export function calculateLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: LayoutConfig
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { width, height, seed = 42, iterations = 300 } = config;

  // Seed random for reproducibility
  const random = seededRandom(seed);

  // Initialize node positions if not already set
  const initializedNodes = nodes.map((node) => ({
    ...node,
    x: node.x ?? random() * width,
    y: node.y ?? random() * height,
  }));

  // Create simulation
  const simulation = createSimulation(initializedNodes, edges, config).stop();

  // Run simulation synchronously
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  return {
    nodes: initializedNodes,
    edges,
  };
}

/**
 * Get node radius based on type (for collision detection)
 */
export function getNodeRadius(kind: string): number {
  switch (kind) {
    case 'Group':
      return 50;
    case 'Constellation':
      return 40;
    case 'Source':
      return 30;
    case 'ObjectiveClaim':
      return 25;
    default:
      return 20;
  }
}

/**
 * Seeded random number generator for reproducible layouts
 *
 * Note (Bug #37): Uses a simple Linear Congruential Generator (LCG).
 * This is intentional - we need reproducibility, not cryptographic quality.
 * For graph layout purposes, this provides sufficient randomness while
 * ensuring the same seed always produces the same initial positions.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Update layout incrementally (for live updates)
 */
export function updateLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: Partial<LayoutConfig> & { alpha?: number }
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // This can now just create a new simulation or be removed in favor of direct simulation control
  // Keeping for backward compatibility but utilizing createSimulation
  const simulation = createSimulation(nodes, edges, {
    width: 800, // Default fallback
    height: 600,
    ...config,
  } as LayoutConfig)
    .alpha(config.alpha ?? 0.3)
    .stop();

  // Run for fewer iterations (smoother animation)
  for (let i = 0; i < 50; i++) {
    simulation.tick();
  }

  return { nodes, edges };
}

/**
 * Pin node to specific position (user dragging)
 */
export function pinNode(node: GraphNode, x: number, y: number): GraphNode {
  return {
    ...node,
    fx: x,
    fy: y,
  };
}

/**
 * Unpin node (release from fixed position)
 */
export function unpinNode(node: GraphNode): GraphNode {
  return {
    ...node,
    fx: null,
    fy: null,
  };
}

/**
 * Get bounding box for a set of nodes
 */
export function getBoundingBox(nodes: GraphNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = nodes.map((n) => n.x ?? 0);
  const ys = nodes.map((n) => n.y ?? 0);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
