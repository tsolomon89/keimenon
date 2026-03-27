import type {
  GraphPickResult,
  GraphScreenPoint,
  MarqueeSelectionSession,
} from '@/components/keimenon/renderer/types';
import type { RenderLens } from '@/lib/nd-projection';

export interface ScreenEdgeGeometry {
  edgeId: string;
  source: GraphScreenPoint;
  target: GraphScreenPoint;
  metadata?: Record<string, unknown>;
}

export interface ScreenNodeGeometry {
  nodeId: string;
  point: GraphScreenPoint;
}

interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface DragBasis {
  right: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}

function clampFinite(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function distanceSquared(a: GraphScreenPoint, b: GraphScreenPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distanceToSegmentSquared(
  point: GraphScreenPoint,
  segmentStart: GraphScreenPoint,
  segmentEnd: GraphScreenPoint
): number {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared <= 0.000001) {
    return distanceSquared(point, segmentStart);
  }

  const projected =
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / segmentLengthSquared;
  const clamped = Math.max(0, Math.min(1, projected));
  const closest: GraphScreenPoint = {
    x: segmentStart.x + clamped * dx,
    y: segmentStart.y + clamped * dy,
  };

  return distanceSquared(point, closest);
}

function normalizeRect(start: GraphScreenPoint, end: GraphScreenPoint): ScreenRect {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

export function pickNearestEdge(
  pointer: GraphScreenPoint,
  edges: ScreenEdgeGeometry[],
  maxDistancePx = 10
): GraphPickResult {
  const thresholdSquared = Math.max(1, maxDistancePx) * Math.max(1, maxDistancePx);
  let nearest: ScreenEdgeGeometry | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const edge of edges) {
    const distance = distanceToSegmentSquared(pointer, edge.source, edge.target);
    if (distance < nearestDistanceSquared) {
      nearestDistanceSquared = distance;
      nearest = edge;
    }
  }

  if (!nearest || nearestDistanceSquared > thresholdSquared) {
    return {
      kind: 'none',
      screen: {
        x: clampFinite(pointer.x),
        y: clampFinite(pointer.y),
      },
    };
  }

  return {
    kind: 'edge',
    edgeId: nearest.edgeId,
    screen: {
      x: clampFinite(pointer.x),
      y: clampFinite(pointer.y),
    },
    metadata: nearest.metadata,
  };
}

export function selectNodesInMarquee(
  nodes: ScreenNodeGeometry[],
  marquee: MarqueeSelectionSession
): string[] {
  const rect = normalizeRect(marquee.start, marquee.current);
  const next = nodes
    .filter(
      (node) =>
        node.point.x >= rect.left &&
        node.point.x <= rect.right &&
        node.point.y >= rect.top &&
        node.point.y <= rect.bottom
    )
    .map((node) => node.nodeId);
  next.sort((left, right) => left.localeCompare(right));
  return next;
}

export function applyMarqueeSelection(
  currentSelection: string[],
  marqueeSelection: string[],
  modifiers: MarqueeSelectionSession['modifiers']
): string[] {
  if (!modifiers.shift && !modifiers.ctrlOrMeta) {
    return [...marqueeSelection];
  }

  const base = new Set(currentSelection);

  if (modifiers.ctrlOrMeta) {
    for (const nodeId of marqueeSelection) {
      if (base.has(nodeId)) {
        base.delete(nodeId);
      } else {
        base.add(nodeId);
      }
    }
    return Array.from(base).sort((left, right) => left.localeCompare(right));
  }

  for (const nodeId of marqueeSelection) {
    base.add(nodeId);
  }

  return Array.from(base).sort((left, right) => left.localeCompare(right));
}

export function applyDragDeltaForLens(
  current: [number, number, number],
  lens: RenderLens,
  deltaPixels: { dx: number; dy: number },
  scale: number,
  basis?: DragBasis
): [number, number, number] {
  const dxScaled = deltaPixels.dx * scale;
  const dyScaled = deltaPixels.dy * scale;

  if (lens === '2d') {
    return [current[0] + dxScaled, current[1] - dyScaled, 0];
  }

  if (!basis) {
    return [current[0] + dxScaled, current[1] - dyScaled, current[2]];
  }

  const deltaX = basis.right.x * dxScaled + basis.up.x * -dyScaled;
  const deltaY = basis.right.y * dxScaled + basis.up.y * -dyScaled;
  const deltaZ = basis.right.z * dxScaled + basis.up.z * -dyScaled;
  return [current[0] + deltaX, current[1] + deltaY, current[2] + deltaZ];
}
