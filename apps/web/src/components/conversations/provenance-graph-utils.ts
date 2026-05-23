import { AgentRunProvenance, AgentRunProvenanceEvidence } from '@/services/organization-service';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'AgentRun' | 'Source' | 'SourceSpan' | 'Phrase' | 'Topic';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  text?: string;
  source_id?: string;
  frequency?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  strength: number;
}

/**
 * Builds the static representation of the citation graph from AgentRunProvenance response
 */
export function buildProvenanceGraph(
  provenance: AgentRunProvenance,
  runId: string
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Central Agent Run Node
  const centerNode: GraphNode = {
    id: 'run-center',
    label: 'Agent Run',
    kind: 'AgentRun',
    x: 250,
    y: 200,
    vx: 0,
    vy: 0,
    radius: 20,
    text: `Agent Run ID: ${runId}`,
  };
  nodes.push(centerNode);

  if (!provenance || !provenance.evidence || provenance.evidence.length === 0) {
    return { nodes, edges };
  }

  const uniqueSources = new Set<string>();

  provenance.evidence.forEach((item, index) => {
    // Determine radial initial coordinates
    const angle = (index / provenance.evidence.length) * Math.PI * 2;
    const dist = 120 + Math.random() * 60;

    const node: GraphNode = {
      id: item.id,
      label: item.kind,
      kind: item.kind as any,
      x: 250 + Math.cos(angle) * dist,
      y: 200 + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius: item.kind === 'SourceSpan' ? 10 : 8,
      text: item.text,
      source_id: item.source_id,
      frequency: item.frequency,
    };
    nodes.push(node);

    // Connect evidence directly to AgentRun center
    edges.push({
      source: 'run-center',
      target: item.id,
      strength: item.frequency ? Math.min(item.frequency / 5, 1) : 0.4,
    });

    // If it references a source_id, link evidence to the source
    if (item.source_id) {
      uniqueSources.add(item.source_id);
      edges.push({
        source: item.source_id,
        target: item.id,
        strength: 0.6,
      });
    }
  });

  // 2. Add Source Nodes
  Array.from(uniqueSources).forEach((srcId, index) => {
    const angle = (index / uniqueSources.size) * Math.PI * 2 + Math.PI / 4;
    const dist = 240;
    const sourceNode: GraphNode = {
      id: srcId,
      label: `Source: ${srcId.split('-')[0]}`,
      kind: 'Source',
      x: 250 + Math.cos(angle) * dist,
      y: 200 + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius: 14,
    };
    nodes.push(sourceNode);

    // Connect source directly to Central Agent Run
    edges.push({
      source: 'run-center',
      target: srcId,
      strength: 0.5,
    });
  });

  return { nodes, edges };
}

/**
 * Produces filtered projections of nodes & edges additively without mutating original graph
 */
export function filterGraphByKind(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  activeKinds: Set<string>
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const visibleNodes = graph.nodes.filter((node) => activeKinds.has(node.kind));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}

/**
 * Searches and filters evidence items
 */
export function searchEvidenceItems(
  items: AgentRunProvenanceEvidence[],
  query: string
): AgentRunProvenanceEvidence[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;

  return items.filter((item) => {
    const textMatch = item.text?.toLowerCase().includes(q) ?? false;
    const idMatch = item.id.toLowerCase().includes(q);
    const kindMatch = item.kind.toLowerCase().includes(q);
    const sourceIdMatch = item.source_id?.toLowerCase().includes(q) ?? false;

    return textMatch || idMatch || kindMatch || sourceIdMatch;
  });
}

/**
 * Calculates pan/zoom transformations to fit visible nodes on canvas
 */
export function calculateZoomToFit(
  nodes: GraphNode[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; zoom: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((n) => {
    minX = Math.min(minX, n.x - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  });

  const graphWidth = maxX - minX || 1;
  const graphHeight = maxY - minY || 1;
  const padding = 50;

  const zoomX = (canvasWidth - padding * 2) / graphWidth;
  const zoomY = (canvasHeight - padding * 2) / graphHeight;
  const zoom = Math.max(0.4, Math.min(2.0, Math.min(zoomX, zoomY)));

  const centerX = minX + graphWidth / 2;
  const centerY = minY + graphHeight / 2;

  const x = canvasWidth / 2 - centerX * zoom;
  const y = canvasHeight / 2 - centerY * zoom;

  return { x, y, zoom };
}

/**
 * Centers the view frame on a targeted node
 */
export function calculateNodeFocusTransform(
  node: GraphNode,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number = 1.3
): { x: number; y: number; zoom: number } {
  const x = canvasWidth / 2 - node.x * zoom;
  const y = canvasHeight / 2 - node.y * zoom;

  return { x, y, zoom };
}

/**
 * Resets positions to deterministic radial distribution around center
 */
export function resetNodeLayout(nodes: GraphNode[]): GraphNode[] {
  const centerNode = nodes.find((n) => n.id === 'run-center');
  const center = { x: centerNode?.x ?? 250, y: centerNode?.y ?? 200 };

  const nonCenterNodes = nodes.filter((n) => n.id !== 'run-center');
  nonCenterNodes.forEach((node, index) => {
    const angle = (index / nonCenterNodes.length) * Math.PI * 2;
    const dist = node.kind === 'Source' ? 240 : 120 + (index % 3) * 30;

    node.x = center.x + Math.cos(angle) * dist;
    node.y = center.y + Math.sin(angle) * dist;
    node.vx = 0;
    node.vy = 0;
  });

  return nodes;
}
