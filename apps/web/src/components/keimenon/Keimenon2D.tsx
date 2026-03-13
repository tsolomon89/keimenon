'use client';

import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  memo,
  useMemo,
  useCallback,
} from 'react';
import { GraphNode, GraphEdge as BaseGraphEdge, getNodeRadius } from '@keimenon/graph';
import { getNodeLabel, LabelableNode } from '@/lib/node-labels';
import { buildEdgeStyleCache, ComputedEdgeStyle } from './edge-styles';
import { buildLodPlan, type LodPlanStats } from '@/lib/graph-lod';

// Extended GraphEdge with metadata for styling
interface GraphEdge extends BaseGraphEdge {
  data?: Record<string, unknown>;
}

interface Keimenon2DProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onEdgeHover?: (edge: GraphEdge | null, position: { x: number; y: number }) => void;
  onLodStats?: (stats: LodPlanStats) => void;
}

export interface Keimenon2DHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  focusOnNode: (nodeId: string, targetScale?: number, durationMs?: number) => void;
  zoomToFitNodes: (nodeIds: string[]) => void;
  resetView: () => void;
  optimizeView: () => void;
}

// ==================== Perf: Mutable state kept in refs, not React state ====================

interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

interface InteractionState {
  isPanning: boolean;
  panStartX: number;
  panStartY: number;
  selectedNodes: Set<string>;
  hoveredNodeId: string | null;
  hoveredEdge: GraphEdge | null;
  draggedNode: GraphNode | null;
  isSelecting: boolean;
  selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
}

// ==================== Simple spatial grid for fast node hit-testing ====================

class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, GraphNode[]>();

  constructor(cellSize: number = 80) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  insert(node: GraphNode) {
    if (node.x === undefined || node.y === undefined) return;
    const key = this.key(node.x, node.y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(node);
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  query(x: number, y: number, radius: number): GraphNode[] {
    const results: GraphNode[] = [];
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) {
          for (const node of cell) {
            results.push(node);
          }
        }
      }
    }
    return results;
  }
}

// ==================== Node color (pure function, no side effects) ====================

function getNodeColor(node: GraphNode, isSelected: boolean, isHovered: boolean): string {
  const colors: Record<string, string> = {
    Source: 'rgba(59, 130, 246, 0.6)',
    SourceDoc: 'rgba(20, 184, 166, 0.6)',
    Group: 'rgba(168, 85, 247, 0.6)',
    Folder: 'rgba(234, 179, 8, 0.6)',
    ObjectiveClaim: 'rgba(34, 197, 94, 0.6)',
    Constellation: 'rgba(249, 115, 22, 0.6)',
    UserNode: 'rgba(236, 72, 153, 0.6)',
    Lexeme: 'rgba(148, 163, 184, 0.4)',
    Phrase: 'rgba(251, 146, 60, 0.7)',
    Topic: 'rgba(239, 68, 68, 0.7)',
    VerifiedSource: 'rgba(16, 185, 129, 0.8)',
    VerifiedClaim: 'rgba(59, 130, 246, 0.8)',
    ConversationThread: 'rgba(147, 51, 234, 0.6)',
  };

  let color: string;
  if (node.kind === 'Principal') {
    const nodeWithData = node as GraphNode & { principal_kind?: string };
    const principalKind = nodeWithData.principal_kind;
    if (principalKind === 'human') {
      color = 'rgba(236, 72, 153, 0.7)';
    } else if (principalKind === 'agent') {
      color = 'rgba(139, 92, 246, 0.7)';
    } else if (principalKind === 'contact') {
      color = 'rgba(107, 114, 128, 0.6)';
    } else {
      color = 'rgba(168, 85, 247, 0.6)';
    }
  } else {
    color = colors[node.kind] || 'rgba(100, 116, 139, 0.6)';
  }

  const nodeWithMeta = node as GraphNode & {
    metadata?: { isDuplicate?: boolean; status?: string };
  };
  const isDuplicate =
    nodeWithMeta.metadata?.isDuplicate || nodeWithMeta.metadata?.status === 'duplicate';
  if (isDuplicate) {
    color = 'rgba(148, 163, 184, 0.3)';
  }

  if (isSelected) {
    color = color.replace('0.6', '1').replace('0.3', '0.8');
  } else if (isHovered) {
    color = color.replace('0.6', '0.8').replace('0.3', '0.5');
  }

  return color;
}

// ==================== Component ====================

export const Keimenon2D = memo(
  forwardRef<Keimenon2DHandle, Keimenon2DProps>(
    (
      {
        nodes,
        edges,
        width,
        height,
        onNodeClick,
        onNodeDoubleClick,
        onSelectionChange,
        onEdgeHover,
        onLodStats,
      },
      ref
    ) => {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const workerRef = useRef<Worker | null>(null);
      const offscreenRef = useRef<HTMLCanvasElement | null>(null);
      const rafRef = useRef<number>(0);
      const cameraAnimationRef = useRef<number>(0);
      const optimizeLevelRef = useRef(0);
      const visibleNodeIdsRef = useRef<Set<string>>(new Set());
      const visibleEdgeIdsRef = useRef<Set<string>>(new Set());

      // ---- Mutable refs for hot-path state (no React re-renders) ----
      const transformRef = useRef<CanvasTransform>({ x: 0, y: 0, scale: 1 });
      const interactionRef = useRef<InteractionState>({
        isPanning: false,
        panStartX: 0,
        panStartY: 0,
        selectedNodes: new Set(),
        hoveredNodeId: null,
        hoveredEdge: null,
        draggedNode: null,
        isSelecting: false,
        selectionBox: null,
      });

      // Spatial grid for fast node hit-testing
      const gridRef = useRef(new SpatialGrid(80));
      const needsRedrawRef = useRef(true);

      // Keep callback refs fresh without causing re-renders
      const callbacksRef = useRef({
        onNodeClick,
        onNodeDoubleClick,
        onSelectionChange,
        onEdgeHover,
        onLodStats,
      });
      callbacksRef.current = {
        onNodeClick,
        onNodeDoubleClick,
        onSelectionChange,
        onEdgeHover,
        onLodStats,
      };

      // ---- Pre-computed caches (recomputed only when data changes) ----

      const labelCache = useMemo(() => {
        const cache = new Map<string, string>();
        nodes.forEach((node) => {
          cache.set(node.id, getNodeLabel(node as LabelableNode));
        });
        return cache;
      }, [nodes]);

      const edgeStyleCache = useMemo(() => buildEdgeStyleCache(edges as GraphEdge[]), [edges]);

      // Rebuild spatial grid when nodes change position (after simulation tick)
      const rebuildGrid = useCallback(() => {
        const grid = gridRef.current;
        grid.clear();
        const visibleNodeIds = visibleNodeIdsRef.current;
        for (const node of nodes) {
          if (visibleNodeIds.size > 0 && !visibleNodeIds.has(node.id)) {
            continue;
          }
          grid.insert(node);
        }
      }, [nodes]);

      // ---- Request a redraw on next animation frame ----
      const requestRedraw = useCallback(() => {
        needsRedrawRef.current = true;
      }, []);

      const stopCameraAnimation = useCallback(() => {
        if (cameraAnimationRef.current) {
          cancelAnimationFrame(cameraAnimationRef.current);
          cameraAnimationRef.current = 0;
        }
      }, []);

      const getNodeById = useCallback(
        (nodeId: string): GraphNode | null => {
          const node = nodes.find((candidate) => candidate.id === nodeId);
          return node && node.x !== undefined && node.y !== undefined ? node : null;
        },
        [nodes]
      );

      const animateToTransform = useCallback(
        (
          target: { x: number; y: number; scale: number },
          durationMs: number,
          easing: (progress: number) => number = (progress) => 1 - Math.pow(1 - progress, 3)
        ) => {
          stopCameraAnimation();
          const initial = { ...transformRef.current };
          const startedAt = performance.now();

          const frame = (now: number) => {
            const elapsed = now - startedAt;
            const progress = Math.min(1, elapsed / durationMs);
            const eased = easing(progress);
            const t = transformRef.current;
            t.x = initial.x + (target.x - initial.x) * eased;
            t.y = initial.y + (target.y - initial.y) * eased;
            t.scale = initial.scale + (target.scale - initial.scale) * eased;
            requestRedraw();

            if (progress < 1) {
              cameraAnimationRef.current = requestAnimationFrame(frame);
            } else {
              cameraAnimationRef.current = 0;
            }
          };

          cameraAnimationRef.current = requestAnimationFrame(frame);
        },
        [requestRedraw, stopCameraAnimation]
      );

      // ---- Camera controls exposed via ref ----
      useImperativeHandle(
        ref,
        () => ({
          zoomIn: () => {
            stopCameraAnimation();
            const t = transformRef.current;
            t.scale = Math.min(t.scale * 1.2, 5);
            optimizeLevelRef.current = 0;
            requestRedraw();
          },
          zoomOut: () => {
            stopCameraAnimation();
            const t = transformRef.current;
            t.scale = Math.max(t.scale / 1.2, 0.1);
            optimizeLevelRef.current = 0;
            requestRedraw();
          },
          centerView: () => {
            if (nodes.length === 0) return;
            stopCameraAnimation();
            const padding = 100;
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity;
            for (const n of nodes) {
              const nx = n.x ?? 0;
              const ny = n.y ?? 0;
              if (nx < minX) minX = nx;
              if (ny < minY) minY = ny;
              if (nx > maxX) maxX = nx;
              if (ny > maxY) maxY = ny;
            }
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            const graphWidth = maxX - minX;
            const graphHeight = maxY - minY;
            const scale = Math.min(width / graphWidth, height / graphHeight, 1);
            const t = transformRef.current;
            t.x = width / 2 - ((minX + maxX) / 2) * scale;
            t.y = height / 2 - ((minY + maxY) / 2) * scale;
            t.scale = scale;
            optimizeLevelRef.current = 0;
            requestRedraw();
          },
          focusOnNode: (nodeId: string, targetScale = 1.6, durationMs = 220) => {
            const node = getNodeById(nodeId);
            if (!node) return;

            const clampedScale = Math.max(0.1, Math.min(5, targetScale));
            animateToTransform(
              {
                x: width / 2 - node.x! * clampedScale,
                y: height / 2 - node.y! * clampedScale,
                scale: clampedScale,
              },
              durationMs
            );
          },
          zoomToFitNodes: (nodeIds: string[]) => {
            const targetNodes = (
              nodeIds.length > 0 ? nodes.filter((node) => nodeIds.includes(node.id)) : nodes
            ).filter((node) => node.x !== undefined && node.y !== undefined);
            if (targetNodes.length === 0) {
              return;
            }

            stopCameraAnimation();
            const padding = 80;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (const node of targetNodes) {
              minX = Math.min(minX, node.x!);
              minY = Math.min(minY, node.y!);
              maxX = Math.max(maxX, node.x!);
              maxY = Math.max(maxY, node.y!);
            }

            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;

            const graphWidth = Math.max(maxX - minX, 1);
            const graphHeight = Math.max(maxY - minY, 1);
            const scale = Math.max(
              0.1,
              Math.min(5, Math.min(width / graphWidth, height / graphHeight))
            );
            const t = transformRef.current;
            t.x = width / 2 - ((minX + maxX) / 2) * scale;
            t.y = height / 2 - ((minY + maxY) / 2) * scale;
            t.scale = scale;
            optimizeLevelRef.current = 0;
            requestRedraw();
          },
          resetView: () => {
            stopCameraAnimation();
            const t = transformRef.current;
            t.x = 0;
            t.y = 0;
            t.scale = 1;
            optimizeLevelRef.current = 0;
            requestRedraw();
          },
          optimizeView: () => {
            optimizeLevelRef.current = Math.min(3, optimizeLevelRef.current + 1);
            requestRedraw();
          },
        }),
        [animateToTransform, getNodeById, nodes, requestRedraw, stopCameraAnimation, width, height]
      );

      // ---- Core draw function with LOD (#9) and OffscreenCanvas (#10) ----
      const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // #10: OffscreenCanvas double-buffering - draw to offscreen, blit to visible
        if (!offscreenRef.current) {
          offscreenRef.current = document.createElement('canvas');
        }
        const offscreen = offscreenRef.current;
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        const t = transformRef.current;
        const inter = interactionRef.current;
        const selected = Array.from(inter.selectedNodes);
        const focusNodeId = selected.length === 1 ? selected[0] : null;
        const lodPlan = buildLodPlan({
          nodes,
          edges: edges as GraphEdge[],
          zoom: t.scale,
          focusNodeId,
          optimizeLevel: optimizeLevelRef.current,
          includeConnectors: false,
        });
        const renderNodes = lodPlan.visibleNodes;
        const renderEdges = lodPlan.visibleEdges as GraphEdge[];

        visibleNodeIdsRef.current = lodPlan.visibleNodeIds;
        visibleEdgeIdsRef.current = lodPlan.visibleEdgeIds;
        callbacksRef.current.onLodStats?.(lodPlan.stats);

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.scale(t.scale, t.scale);

        // ---- Viewport culling bounds (graph-space) ----
        const viewMinX = -t.x / t.scale - 100;
        const viewMinY = -t.y / t.scale - 100;
        const viewMaxX = (width - t.x) / t.scale + 100;
        const viewMaxY = (height - t.y) / t.scale + 100;

        // #9 LOD: Skip edge rendering at very low zoom
        const showEdges = t.scale > 0.15;

        if (showEdges) {
          // ---- EDGES: batch by computed style for fewer state changes ----
          const edgeBatches = new Map<
            string,
            Array<{ edge: GraphEdge; style: ComputedEdgeStyle }>
          >();

          for (const edge of renderEdges) {
            const source = edge.source as GraphNode;
            const target = edge.target as GraphNode;
            if (
              source.x === undefined ||
              source.y === undefined ||
              target.x === undefined ||
              target.y === undefined
            )
              continue;

            // Viewport culling for edges: skip if both endpoints are off-screen
            const sx = source.x,
              sy = source.y,
              tx = target.x,
              ty = target.y;
            if (
              (sx < viewMinX && tx < viewMinX) ||
              (sx > viewMaxX && tx > viewMaxX) ||
              (sy < viewMinY && ty < viewMinY) ||
              (sy > viewMaxY && ty > viewMaxY)
            )
              continue;

            const isHovered = inter.hoveredEdge?.id === edge.id;
            const cached = edgeStyleCache.get(edge.id);
            if (!cached) continue;

            const effectiveColor = isHovered ? cached.highlightColor : cached.color;
            const effectiveWidth = isHovered
              ? cached.lineWidth + 2 / t.scale
              : cached.lineWidth / t.scale;
            const dashKey = cached.dashArray ? cached.dashArray.join(',') : '';
            const batchKey = `${effectiveColor}|${effectiveWidth.toFixed(2)}|${dashKey}`;

            let batch = edgeBatches.get(batchKey);
            if (!batch) {
              batch = [];
              edgeBatches.set(batchKey, batch);
            }
            batch.push({
              edge,
              style: { ...cached, color: effectiveColor, lineWidth: effectiveWidth },
            });
          }

          // Draw all batched edges with minimal state changes
          for (const [, batch] of edgeBatches) {
            const first = batch[0].style;
            ctx.strokeStyle = first.color;
            ctx.lineWidth = first.lineWidth;
            if (first.dashArray) {
              ctx.setLineDash(first.dashArray.map((v) => v / t.scale));
            } else {
              ctx.setLineDash([]);
            }

            ctx.beginPath();
            for (const { edge } of batch) {
              const source = edge.source as GraphNode;
              const target = edge.target as GraphNode;
              ctx.moveTo(source.x!, source.y!);
              ctx.lineTo(target.x!, target.y!);
            }
            ctx.stroke();
          }
        }

        // Reset dash pattern for nodes
        ctx.setLineDash([]);

        // ---- NODES: LOD-aware rendering ----
        const showLabels = t.scale > 0.3;
        const showDetailedNodes = t.scale > 0.08; // At very low zoom, skip arc and just draw rects

        if (showLabels) {
          ctx.font = `${12 / t.scale}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
        }

        for (const node of renderNodes) {
          if (node.x === undefined || node.y === undefined) continue;

          // Viewport culling
          if (node.x < viewMinX || node.x > viewMaxX || node.y < viewMinY || node.y > viewMaxY)
            continue;

          const isSelected = inter.selectedNodes.has(node.id);
          const isHovered = inter.hoveredNodeId === node.id;
          const radius = getNodeRadius(node.kind);

          if (showDetailedNodes) {
            // Normal arc rendering
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = getNodeColor(node, isSelected, isHovered);
            ctx.fill();

            ctx.strokeStyle = isSelected
              ? 'rgba(168, 85, 247, 1)'
              : isHovered
                ? 'rgba(100, 116, 139, 0.8)'
                : 'rgba(100, 116, 139, 0.3)';
            ctx.lineWidth = (isSelected ? 3 : 1) / t.scale;
            ctx.stroke();
          } else {
            // #9 LOD: At very low zoom, draw simple 2px squares instead of arcs
            ctx.fillStyle = getNodeColor(node, isSelected, isHovered);
            const pixelSize = Math.max(2 / t.scale, radius * 0.5);
            ctx.fillRect(node.x - pixelSize / 2, node.y - pixelSize / 2, pixelSize, pixelSize);
          }

          // Label (font already set once above)
          if (showLabels) {
            const label = labelCache.get(node.id) || node.id.slice(0, 8);
            const maxLen = t.scale > 1.5 ? 32 : t.scale > 0.8 ? 20 : 12;
            const displayLabel =
              label.length > maxLen ? label.slice(0, maxLen - 1) + '\u2026' : label;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(displayLabel, node.x, node.y + radius + 8 / t.scale);
          }
        }

        ctx.restore();

        // ---- Selection box (screen-space, drawn after ctx.restore) ----
        if (inter.selectionBox) {
          const { startX, startY, endX, endY } = inter.selectionBox;
          const x = Math.min(startX, endX);
          const y = Math.min(startY, endY);
          const w = Math.abs(endX - startX);
          const h = Math.abs(endY - startY);

          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
          ctx.fillRect(x, y, w, h);
          ctx.restore();
        }

        // #10: Blit offscreen canvas to visible canvas
        const visibleCtx = canvas.getContext('2d');
        if (visibleCtx) {
          visibleCtx.clearRect(0, 0, width, height);
          visibleCtx.drawImage(offscreen, 0, 0);
        }
      }, [nodes, edges, width, height, labelCache, edgeStyleCache]);

      // ---- Animation loop: only redraws when flagged ----
      useEffect(() => {
        const loop = () => {
          if (needsRedrawRef.current) {
            needsRedrawRef.current = false;
            drawFrame();
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rafRef.current);
      }, [drawFrame]);

      useEffect(() => () => stopCameraAnimation(), [stopCameraAnimation]);

      // ---- #8: Web Worker D3 Force Simulation ----
      useEffect(() => {
        if (!nodes.length) return;

        // Terminate previous worker
        if (workerRef.current) workerRef.current.terminate();

        // Create worker — Next.js compatible dynamic import
        const worker = new Worker(new URL('../../workers/simulation.worker.ts', import.meta.url));
        workerRef.current = worker;

        // Build a position index for fast updates
        const nodeIndex = new Map<string, GraphNode>();
        for (const node of nodes) {
          nodeIndex.set(node.id, node);
        }

        // Handle position updates from worker
        worker.onmessage = (e: MessageEvent) => {
          const { type } = e.data;
          if (type === 'tick') {
            const positions = e.data.nodes as Array<{ id: string; x: number; y: number }>;
            for (const pos of positions) {
              const node = nodeIndex.get(pos.id);
              if (node) {
                node.x = pos.x;
                node.y = pos.y;
              }
            }
            rebuildGrid();
            requestRedraw();
          }
        };

        // Send serializable data to worker
        worker.postMessage({
          type: 'init',
          nodes: nodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            x: n.x,
            y: n.y,
            fx: n.fx,
            fy: n.fy,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
            target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
            kind: e.kind,
          })),
          config: { width, height },
        });

        return () => {
          worker.terminate();
        };
      }, [nodes, edges, width, height, rebuildGrid, requestRedraw]);

      // ---- Interaction helpers ----

      const getEventCoordinates = useCallback((e: React.MouseEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const t = transformRef.current;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const graphX = (x - t.x) / t.scale;
        const graphY = (y - t.y) / t.scale;
        return { x, y, graphX, graphY };
      }, []);

      // Use spatial grid for node hit-testing instead of O(n) linear scan
      const findNodeAt = useCallback((graphX: number, graphY: number) => {
        const maxRadius = 50; // Largest node radius
        const candidates = gridRef.current.query(graphX, graphY, maxRadius);
        const visibleNodeIds = visibleNodeIdsRef.current;
        // Reverse for top-node priority
        for (let i = candidates.length - 1; i >= 0; i--) {
          const node = candidates[i];
          if (visibleNodeIds.size > 0 && !visibleNodeIds.has(node.id)) {
            continue;
          }
          if (node.x === undefined || node.y === undefined) continue;
          const dx = node.x - graphX;
          const dy = node.y - graphY;
          if (dx * dx + dy * dy < getNodeRadius(node.kind) ** 2) {
            return node;
          }
        }
        return null;
      }, []);

      const pointToLineDistanceSq = useCallback(
        (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const lengthSq = dx * dx + dy * dy;
          if (lengthSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
          const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
          const projX = x1 + t * dx;
          const projY = y1 + t * dy;
          return (px - projX) ** 2 + (py - projY) ** 2;
        },
        []
      );

      const findEdgeAt = useCallback(
        (graphX: number, graphY: number): GraphEdge | null => {
          const t = transformRef.current;
          const hitDistSq = (8 / t.scale) ** 2;
          const visibleEdgeIds = visibleEdgeIdsRef.current;

          for (const edge of edges) {
            if (visibleEdgeIds.size > 0 && !visibleEdgeIds.has(edge.id)) {
              continue;
            }
            const source = edge.source as GraphNode;
            const target = edge.target as GraphNode;
            if (
              source.x === undefined ||
              source.y === undefined ||
              target.x === undefined ||
              target.y === undefined
            )
              continue;

            // Quick bounding-box pre-filter
            const minX = Math.min(source.x, target.x) - 8 / t.scale;
            const maxX = Math.max(source.x, target.x) + 8 / t.scale;
            const minY = Math.min(source.y, target.y) - 8 / t.scale;
            const maxY = Math.max(source.y, target.y) + 8 / t.scale;
            if (graphX < minX || graphX > maxX || graphY < minY || graphY > maxY) continue;

            const distSq = pointToLineDistanceSq(
              graphX,
              graphY,
              source.x,
              source.y,
              target.x,
              target.y
            );
            if (distSq < hitDistSq) return edge;
          }
          return null;
        },
        [edges, pointToLineDistanceSq]
      );

      // ---- Mouse handlers (update refs, not state) ----

      const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          if (!canvasRef.current) return;
          stopCameraAnimation();
          const { x, y, graphX, graphY } = getEventCoordinates(e);
          const inter = interactionRef.current;
          const t = transformRef.current;
          const node = findNodeAt(graphX, graphY);

          if (node) {
            if (e.shiftKey) {
              const newSet = new Set(inter.selectedNodes);
              if (newSet.has(node.id)) newSet.delete(node.id);
              else newSet.add(node.id);
              inter.selectedNodes = newSet;
              callbacksRef.current.onSelectionChange?.(Array.from(newSet));
            } else {
              if (!inter.selectedNodes.has(node.id)) {
                inter.selectedNodes = new Set([node.id]);
                callbacksRef.current.onSelectionChange?.([node.id]);
              }
              inter.draggedNode = node;
              node.fx = node.x;
              node.fy = node.y;
              workerRef.current?.postMessage({
                type: 'pin',
                nodeId: node.id,
                x: node.x,
                y: node.y,
              });
            }
            callbacksRef.current.onNodeClick?.(node);
          } else {
            if (e.shiftKey) {
              inter.isSelecting = true;
              inter.selectionBox = { startX: x, startY: y, endX: x, endY: y };
            } else {
              inter.isPanning = true;
              inter.panStartX = e.clientX - t.x;
              inter.panStartY = e.clientY - t.y;
              inter.selectedNodes = new Set();
              callbacksRef.current.onSelectionChange?.([]);
            }
          }
          requestRedraw();
        },
        [getEventCoordinates, findNodeAt, requestRedraw, stopCameraAnimation]
      );

      // Throttle mouse-move to rAF (coalesce multiple move events per frame)
      const pendingMoveRef = useRef<React.MouseEvent<HTMLCanvasElement> | null>(null);
      const moveRafRef = useRef<number>(0);

      const processMouseMove = useCallback(() => {
        const e = pendingMoveRef.current;
        if (!e || !canvasRef.current) return;
        pendingMoveRef.current = null;

        const { x, y, graphX, graphY } = getEventCoordinates(e);
        const inter = interactionRef.current;
        const t = transformRef.current;

        if (inter.draggedNode) {
          inter.draggedNode.fx = graphX;
          inter.draggedNode.fy = graphY;
          return; // Simulation tick handles redraw
        }

        if (inter.isPanning) {
          t.x = e.clientX - inter.panStartX;
          t.y = e.clientY - inter.panStartY;
          requestRedraw();
          return;
        }

        if (inter.isSelecting && inter.selectionBox) {
          inter.selectionBox.endX = x;
          inter.selectionBox.endY = y;
          requestRedraw();
          return;
        }

        // Hover detection (spatial grid for nodes, bounding-box pre-filter for edges)
        const node = findNodeAt(graphX, graphY);
        let changed = false;

        if (node) {
          if (inter.hoveredNodeId !== node.id) {
            inter.hoveredNodeId = node.id;
            changed = true;
          }
          if (inter.hoveredEdge) {
            inter.hoveredEdge = null;
            callbacksRef.current.onEdgeHover?.(null, { x: 0, y: 0 });
            changed = true;
          }
        } else {
          if (inter.hoveredNodeId !== null) {
            inter.hoveredNodeId = null;
            changed = true;
          }
          const edge = findEdgeAt(graphX, graphY);
          if (edge !== inter.hoveredEdge) {
            inter.hoveredEdge = edge;
            if (edge) {
              callbacksRef.current.onEdgeHover?.(edge, { x: e.clientX, y: e.clientY });
            } else {
              callbacksRef.current.onEdgeHover?.(null, { x: 0, y: 0 });
            }
            changed = true;
          } else if (edge && inter.hoveredEdge) {
            callbacksRef.current.onEdgeHover?.(edge, { x: e.clientX, y: e.clientY });
          }
        }

        if (changed) requestRedraw();
      }, [getEventCoordinates, findNodeAt, findEdgeAt, requestRedraw]);

      const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          // Store the event and coalesce via rAF
          pendingMoveRef.current = e;
          if (!moveRafRef.current) {
            moveRafRef.current = requestAnimationFrame(() => {
              moveRafRef.current = 0;
              processMouseMove();
            });
          }
        },
        [processMouseMove]
      );

      const handleMouseUp = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          const inter = interactionRef.current;
          const t = transformRef.current;

          if (inter.draggedNode) {
            workerRef.current?.postMessage({ type: 'unpin', nodeId: inter.draggedNode.id });
            inter.draggedNode = null;
          }

          if (inter.isSelecting && inter.selectionBox) {
            const { startX, startY, endX, endY } = inter.selectionBox;
            const minX = Math.min(startX, endX);
            const maxX = Math.max(startX, endX);
            const minY = Math.min(startY, endY);
            const maxY = Math.max(startY, endY);

            const gMinX = (minX - t.x) / t.scale;
            const gMaxX = (maxX - t.x) / t.scale;
            const gMinY = (minY - t.y) / t.scale;
            const gMaxY = (maxY - t.y) / t.scale;

            const newSelection = new Set<string>();
            for (const n of nodes) {
              if (
                n.x !== undefined &&
                n.y !== undefined &&
                n.x >= gMinX &&
                n.x <= gMaxX &&
                n.y >= gMinY &&
                n.y <= gMaxY
              ) {
                newSelection.add(n.id);
              }
            }
            inter.selectedNodes = newSelection;
            callbacksRef.current.onSelectionChange?.(Array.from(newSelection));
            inter.selectionBox = null;
            inter.isSelecting = false;
          }

          inter.isPanning = false;
          requestRedraw();
        },
        [nodes, requestRedraw]
      );

      const handleDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          const { graphX, graphY } = getEventCoordinates(e);
          const node = findNodeAt(graphX, graphY);
          if (node) callbacksRef.current.onNodeDoubleClick?.(node);
        },
        [getEventCoordinates, findNodeAt]
      );

      // ---- Wheel zoom ----
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          stopCameraAnimation();
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          const t = transformRef.current;
          const newScale = Math.max(0.1, Math.min(5, t.scale * delta));
          t.x = x - (x - t.x) * (newScale / t.scale);
          t.y = y - (y - t.y) * (newScale / t.scale);
          t.scale = newScale;
          optimizeLevelRef.current = 0;
          requestRedraw();
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
      }, [requestRedraw, stopCameraAnimation]);

      // ---- Cursor style (read from ref) ----
      const getCursorClass = useCallback(() => {
        const inter = interactionRef.current;
        if (inter.isPanning) return 'cursor-grabbing';
        if (inter.isSelecting) return 'cursor-crosshair';
        if (inter.draggedNode) return 'cursor-grabbing';
        if (inter.hoveredNodeId) return 'cursor-pointer';
        return 'cursor-grab';
      }, []);

      return (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className={`bg-slate-950 ${getCursorClass()}`}
        />
      );
    }
  )
);

Keimenon2D.displayName = 'Keimenon2D';
