/**
 * Deterministic Graph Layout
 *
 * Computes stable node positions based on node identity, kind, and hierarchy
 * role. Positions are a pure function of graph topology — same input always
 * produces the same output. No Math.random() anywhere.
 *
 * Layout model: concentric radial shells centered on AccountNode at origin.
 * Each node kind maps to a shell (radius), and angular position within the
 * shell is derived from a deterministic hash of the node ID.
 *
 * See: docs/specs/graph-experience-contract.md §1 (Spatial Grammar)
 */

// ---------------------------------------------------------------------------
// Hash utility (FNV-1a — same algorithm used in nd-projection.ts)
// ---------------------------------------------------------------------------

function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Returns a deterministic value in [0, 1) for the given seed string. */
function deterministicUnit(seed: string): number {
  return fnv1aHash(seed) / 0x100000000;
}

// ---------------------------------------------------------------------------
// Shell definitions — spatial grammar by node kind
// ---------------------------------------------------------------------------

/**
 * Radial distance from origin for each layout shell.
 * Shell 0 (AccountNode) is always at origin (radius 0).
 */
export const HIERARCHY_RING_RADII: Record<number, number> = {
  0: 0, // AccountNode — fixed origin
  1: 80, // Principal / UserNode / AgentNode
  2: 180, // Group / Folder
  3: 300, // Source / SourceDoc / ChatThread / ConversationThread
  4: 420, // ObjectiveClaim / VerifiedSource / VerifiedClaim / Evidence
  5: 550, // Topic / Phrase / Lexeme / Constellation / CodeBlock / etc.
};

/**
 * Maps a node kind string to its shell index.
 * Unknown kinds default to shell 5 (outermost).
 */
export const KIND_TO_SHELL: Record<string, number> = {
  // Shell 0 — core
  AccountNode: 0,

  // Shell 1 — identity ring
  Principal: 1,
  UserNode: 1,
  AgentNode: 1,

  // Shell 2 — organizational ring
  Group: 2,
  Folder: 2,

  // Shell 3 — content ring
  Source: 3,
  SourceDoc: 3,
  ChatThread: 3,
  ConversationThread: 3,

  // Shell 4 — objective ring
  ObjectiveClaim: 4,
  VerifiedSource: 4,
  VerifiedClaim: 4,
  Evidence: 4,

  // Shell 5 — detail ring (default for unlisted kinds)
  Topic: 5,
  Phrase: 5,
  Lexeme: 5,
  Constellation: 5,
  CodeBlock: 5,
  SourceSpan: 5,
  Packet: 5,
  Board: 5,
  UnifiedDoc: 5,
  CanonicalDoc: 5,
  DuplicateCluster: 5,
  Message: 5,
  UploadItem: 5,
  AtomicUnit: 5,
};

/** Edge kinds that represent hierarchy (parent → child). */
const HIERARCHY_EDGE_KINDS = new Set([
  'OWNED_BY',
  'CREATED_BY',
  'IN_GROUP',
  'FOLDS_INTO_FOLDER',
  'CONTAINS',
  'HAS_MESSAGE',
]);

// ---------------------------------------------------------------------------
// Position computation
// ---------------------------------------------------------------------------

/** Minimal edge shape needed for layout — source/target may be string or object. */
export interface LayoutEdge {
  source: string | { id: string };
  target: string | { id: string };
  kind: string;
}

/** Minimal node shape needed for layout. */
export interface LayoutNode {
  id: string;
  kind: string;
  x?: number;
  y?: number;
}

function edgeEndpointId(endpoint: string | { id: string }): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveShell(kind: string): number {
  return KIND_TO_SHELL[kind] ?? 5;
}

/**
 * Build a parent lookup map from hierarchy edges.
 * For each child node, returns the first parent found via hierarchy edges.
 */
function buildParentMap(edges: LayoutEdge[]): Map<string, string> {
  const parentOf = new Map<string, string>();

  for (const edge of edges) {
    if (!HIERARCHY_EDGE_KINDS.has(edge.kind)) {
      continue;
    }

    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);

    // Hierarchy edges point child → parent (OWNED_BY, CREATED_BY, IN_GROUP)
    // or parent → child (CONTAINS, HAS_MESSAGE).
    // Normalize: for CONTAINS/HAS_MESSAGE, child is target; for others, child is source.
    if (edge.kind === 'CONTAINS' || edge.kind === 'HAS_MESSAGE') {
      if (!parentOf.has(targetId)) {
        parentOf.set(targetId, sourceId);
      }
    } else {
      if (!parentOf.has(sourceId)) {
        parentOf.set(sourceId, targetId);
      }
    }
  }

  return parentOf;
}

/**
 * Compute the angular position of a parent node (if known) so that children
 * can cluster near their parent's angle.
 */
function resolveParentAngle(
  nodeId: string,
  parentMap: Map<string, string>,
  angleCache: Map<string, number>
): number | null {
  const parentId = parentMap.get(nodeId);
  if (!parentId) {
    return null;
  }

  const cached = angleCache.get(parentId);
  if (cached !== undefined) {
    return cached;
  }

  // Parent's angle is its own hash-based angle
  const parentAngle = deterministicUnit(`${parentId}:angle`) * Math.PI * 2;
  angleCache.set(parentId, parentAngle);
  return parentAngle;
}

/**
 * Compute a deterministic (x, y) position for a single node.
 *
 * @param node - The node to position
 * @param parentMap - Map of child ID → parent ID from hierarchy edges
 * @param angleCache - Shared cache of computed angles (mutated in place)
 * @returns Position `{x, y}` or `null` if the node already has explicit coords
 */
function computeNodePosition(
  node: LayoutNode,
  parentMap: Map<string, string>,
  angleCache: Map<string, number>
): { x: number; y: number } | null {
  // Preserve explicit positions (user-dragged or API-supplied)
  if (isFiniteNumber(node.x) && isFiniteNumber(node.y)) {
    return null; // Signal: keep existing position
  }

  const shell = resolveShell(node.kind);

  // Shell 0 (AccountNode) is always at origin
  if (shell === 0) {
    return { x: 0, y: 0 };
  }

  const baseRadius = HIERARCHY_RING_RADII[shell] ?? 550;

  // Compute base angle from node ID hash
  const baseAngle = deterministicUnit(`${node.id}:angle`) * Math.PI * 2;

  // If node has a parent, cluster near parent's angle with a small offset
  const parentAngle = resolveParentAngle(node.id, parentMap, angleCache);

  let finalAngle: number;
  if (parentAngle !== null) {
    // Offset from parent angle — spread children within ±30° arc
    const childOffset = (deterministicUnit(`${node.id}:child-offset`) - 0.5) * (Math.PI / 3);
    finalAngle = parentAngle + childOffset;
  } else {
    finalAngle = baseAngle;
  }

  // Add slight radial jitter to prevent exact overlap at same angle
  const radialJitter = (deterministicUnit(`${node.id}:radius-jitter`) - 0.5) * (baseRadius * 0.15);
  const finalRadius = baseRadius + radialJitter;

  const x = Math.cos(finalAngle) * finalRadius;
  const y = Math.sin(finalAngle) * finalRadius;

  // Cache this node's angle for potential children
  angleCache.set(node.id, finalAngle);

  return { x, y };
}

/**
 * Compute deterministic positions for all nodes in a graph.
 *
 * This is the primary entry point for the layout module. It produces a
 * `Map<nodeId, {x, y}>` where every node receives a stable, hierarchy-aware
 * position.
 *
 * **Pure function**: same input nodes + edges → same output positions.
 * **Non-mutating**: input arrays are not modified.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph (used for hierarchy detection)
 * @returns Map from node ID to computed position
 */
export function computeDeterministicPositions(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) {
    return positions;
  }

  const parentMap = buildParentMap(edges);
  const angleCache = new Map<string, number>();

  // Process nodes in shell order (inner → outer) so parents are placed before
  // children, ensuring stable parent angle resolution.
  const sortedNodes = [...nodes].sort((a, b) => {
    const shellA = resolveShell(a.kind);
    const shellB = resolveShell(b.kind);
    if (shellA !== shellB) {
      return shellA - shellB;
    }
    // Stable tiebreak by ID
    return a.id.localeCompare(b.id);
  });

  for (const node of sortedNodes) {
    const computed = computeNodePosition(node, parentMap, angleCache);
    if (computed) {
      positions.set(node.id, computed);
    } else {
      // Node has explicit position — record it so children can reference it
      positions.set(node.id, { x: node.x!, y: node.y! });
    }
  }

  return positions;
}

/**
 * Compute a deterministic position for a single node without full graph context.
 * Used as a fast fallback when the full edge set is not available (e.g. during
 * hydration of a single new node).
 *
 * @param node - The node to position
 * @returns Position `{x, y}`
 */
export function computeSingleNodePosition(node: LayoutNode): { x: number; y: number } {
  if (isFiniteNumber(node.x) && isFiniteNumber(node.y)) {
    return { x: node.x, y: node.y };
  }

  const shell = resolveShell(node.kind);

  if (shell === 0) {
    return { x: 0, y: 0 };
  }

  const baseRadius = HIERARCHY_RING_RADII[shell] ?? 550;
  const angle = deterministicUnit(`${node.id}:angle`) * Math.PI * 2;
  const radialJitter = (deterministicUnit(`${node.id}:radius-jitter`) - 0.5) * (baseRadius * 0.15);
  const finalRadius = baseRadius + radialJitter;

  return {
    x: Math.cos(angle) * finalRadius,
    y: Math.sin(angle) * finalRadius,
  };
}
