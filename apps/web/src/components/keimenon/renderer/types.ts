import type { RenderLens } from '@/lib/nd-projection';

export interface GraphScreenPoint {
  x: number;
  y: number;
}

export interface GraphWorldPoint {
  x: number;
  y: number;
  z: number;
}

export interface GraphPickResult {
  kind: 'node' | 'edge' | 'none';
  nodeId?: string;
  edgeId?: string;
  screen: GraphScreenPoint;
  world?: GraphWorldPoint;
  metadata?: Record<string, unknown>;
}

export interface MarqueeSelectionSession {
  active: boolean;
  start: GraphScreenPoint;
  current: GraphScreenPoint;
  modifiers: {
    shift: boolean;
    ctrlOrMeta: boolean;
  };
}

export interface NodeDragSession {
  nodeId: string;
  pointerId: number;
  lens: RenderLens;
  startScreen: GraphScreenPoint;
  lastScreen: GraphScreenPoint;
  startWorld: [number, number, number];
  currentWorld: [number, number, number];
}

export interface GraphInteractionState {
  selectedNodeIds: string[];
  hoveredEdgeId: string | null;
  marqueeSession: MarqueeSelectionSession | null;
  dragSession: NodeDragSession | null;
}
