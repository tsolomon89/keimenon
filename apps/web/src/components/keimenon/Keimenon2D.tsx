'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, memo, useMemo } from 'react';
import {
  GraphNode,
  GraphEdge as BaseGraphEdge,
  createSimulation,
  getNodeRadius,
} from '@keimenon/graph';
import { getNodeLabel, LabelableNode } from '@/lib/node-labels';
import { getEdgeStyle, getEdgeThickness, getEdgeOpacity, applyOpacity } from './edge-styles';

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
}

export interface Keimenon2DHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  resetView: () => void;
}

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
      },
      ref
    ) => {
      const keimenonRef = useRef<HTMLCanvasElement>(null);
      const simulationRef = useRef<ReturnType<typeof createSimulation> | null>(null);
      const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

      // Interaction State
      const [isPanning, setIsPanning] = useState(false);
      const [panStart, setPanStart] = useState({ x: 0, y: 0 });
      const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
      const [hoveredNode, setHoveredNode] = useState<string | null>(null);
      const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
      const [draggedNode, setDraggedNode] = useState<GraphNode | null>(null);
      const [isSelecting, setIsSelecting] = useState(false);
      const [selectionBox, setSelectionBox] = useState<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
      } | null>(null);

      // Cache human-readable labels for nodes (computed once per nodes change)
      const labelCache = useMemo(() => {
        const cache = new Map<string, string>();
        nodes.forEach((node) => {
          cache.set(node.id, getNodeLabel(node as LabelableNode));
        });
        return cache;
      }, [nodes]);

      // Expose camera control methods
      useImperativeHandle(
        ref,
        () => ({
          zoomIn: () => setTransform((prev) => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) })),
          zoomOut: () =>
            setTransform((prev) => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) })),
          centerView: () => {
            if (nodes.length === 0) return;
            const padding = 100;
            const minX = Math.min(...nodes.map((n) => n.x ?? 0)) - padding;
            const minY = Math.min(...nodes.map((n) => n.y ?? 0)) - padding;
            const maxX = Math.max(...nodes.map((n) => n.x ?? 0)) + padding;
            const maxY = Math.max(...nodes.map((n) => n.y ?? 0)) + padding;
            const graphWidth = maxX - minX;
            const graphHeight = maxY - minY;
            const scale = Math.min(width / graphWidth, height / graphHeight, 1);
            setTransform({
              x: width / 2 - ((minX + maxX) / 2) * scale,
              y: height / 2 - ((minY + maxY) / 2) * scale,
              scale,
            });
          },
          resetView: () => setTransform({ x: 0, y: 0, scale: 1 }),
        }),
        [nodes, width, height]
      );

      // Initialize/Update Simulation
      useEffect(() => {
        if (!nodes.length) return;

        // Stop existing simulation
        if (simulationRef.current) simulationRef.current.stop();

        // Create new simulation
        const simulation = createSimulation(nodes, edges, { width, height });
        simulationRef.current = simulation;

        // Tick handler
        simulation.on('tick', () => {
          drawFrame();
        });

        // Restart alpha
        simulation.alpha(1).restart();

        return () => {
          simulation.stop();
        };
      }, [nodes, edges, width, height]);

      // Re-draw when transform or selection changes (independent of tick)
      useEffect(() => {
        if (simulationRef.current) drawFrame();
      }, [transform, selectedNodes, hoveredNode, hoveredEdge, selectionBox]);

      const drawFrame = () => {
        const canvas = keimenonRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);

        // Edges - draw with type-specific styling
        // Group edges by kind for efficient batch rendering
        const edgesByKind = new Map<string, GraphEdge[]>();
        edges.forEach((edge) => {
          const kind = edge.kind || 'UNKNOWN';
          if (!edgesByKind.has(kind)) edgesByKind.set(kind, []);
          edgesByKind.get(kind)!.push(edge);
        });

        // Draw edges grouped by kind
        edgesByKind.forEach((kindEdges, kind) => {
          const style = getEdgeStyle(kind);

          kindEdges.forEach((edge) => {
            const source = edge.source as GraphNode;
            const target = edge.target as GraphNode;
            if (
              source.x === undefined ||
              source.y === undefined ||
              target.x === undefined ||
              target.y === undefined
            )
              return;

            const isHovered = hoveredEdge?.id === edge.id;
            const baseThickness = getEdgeThickness(kind, edge.data, 2) / transform.scale;
            const thickness = isHovered ? baseThickness + 2 / transform.scale : baseThickness;
            const opacityMod = getEdgeOpacity(kind, edge.data);

            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);

            // Apply style - use highlight color when hovered
            if (isHovered) {
              ctx.strokeStyle = style.highlightColor;
            } else {
              ctx.strokeStyle = applyOpacity(style.color, opacityMod);
            }
            ctx.lineWidth = thickness;

            // Apply dash pattern if defined
            if (style.dashArray) {
              ctx.setLineDash(style.dashArray.map((v) => v / transform.scale));
            } else {
              ctx.setLineDash([]);
            }

            ctx.stroke();
          });
        });

        // Reset dash pattern for nodes
        ctx.setLineDash([]);

        // Nodes
        nodes.forEach((node) => {
          if (node.x === undefined || node.y === undefined) return;

          const isSelected = selectedNodes.has(node.id);
          const isHovered = hoveredNode === node.id;
          const radius = getNodeRadius(node.kind);

          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = getNodeColor(node, isSelected, isHovered);
          ctx.fill();

          ctx.strokeStyle = isSelected
            ? 'rgba(168, 85, 247, 1)'
            : isHovered
              ? 'rgba(100, 116, 139, 0.8)'
              : 'rgba(100, 116, 139, 0.3)';
          ctx.lineWidth = (isSelected ? 3 : 1) / transform.scale;
          ctx.stroke();

          // Label - human-readable with adaptive truncation
          if (transform.scale > 0.3) {
            const label = labelCache.get(node.id) || node.id.slice(0, 8);

            // Adaptive truncation based on zoom level
            const maxLen = transform.scale > 1.5 ? 32 : transform.scale > 0.8 ? 20 : 12;
            const displayLabel =
              label.length > maxLen ? label.slice(0, maxLen - 1) + '\u2026' : label;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${12 / transform.scale}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(displayLabel, node.x, node.y + radius + 8 / transform.scale);
          }
        });

        ctx.restore();

        // Selection Box
        if (selectionBox) {
          const { startX, startY, endX, endY } = selectionBox;
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
      };

      // --- Interaction Handlers ---

      const getEventCoordinates = (e: React.MouseEvent) => {
        const rect = keimenonRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const graphX = (x - transform.x) / transform.scale;
        const graphY = (y - transform.y) / transform.scale;
        return { x, y, graphX, graphY };
      };

      const findNodeAt = (graphX: number, graphY: number) => {
        // Reverse search to pick top node
        for (let i = nodes.length - 1; i >= 0; i--) {
          const node = nodes[i];
          if (node.x === undefined || node.y === undefined) continue;
          const dx = node.x - graphX;
          const dy = node.y - graphY;
          if (Math.sqrt(dx * dx + dy * dy) < getNodeRadius(node.kind)) {
            return node;
          }
        }
        return null;
      };

      // Point-to-line-segment distance for edge hover detection
      const pointToLineDistance = (
        px: number,
        py: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ): number => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
          // Line is a point
          return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }

        // Clamp t to [0, 1] to stay within segment
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
      };

      const findEdgeAt = (graphX: number, graphY: number): GraphEdge | null => {
        const hitDistance = 8 / transform.scale; // Pixel tolerance in graph space

        for (const edge of edges) {
          const source = edge.source as GraphNode;
          const target = edge.target as GraphNode;
          if (
            source.x === undefined ||
            source.y === undefined ||
            target.x === undefined ||
            target.y === undefined
          )
            continue;

          const dist = pointToLineDistance(graphX, graphY, source.x, source.y, target.x, target.y);

          if (dist < hitDistance) {
            return edge;
          }
        }
        return null;
      };

      const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!keimenonRef.current) return;
        const { x, y, graphX, graphY } = getEventCoordinates(e);
        const node = findNodeAt(graphX, graphY);

        if (node) {
          if (e.shiftKey) {
            // Multi-select toggle
            const newSet = new Set(selectedNodes);
            if (newSet.has(node.id)) newSet.delete(node.id);
            else newSet.add(node.id);
            setSelectedNodes(newSet);
            onSelectionChange?.(Array.from(newSet));
          } else {
            // Drag start
            if (!selectedNodes.has(node.id)) {
              setSelectedNodes(new Set([node.id]));
              onSelectionChange?.([node.id]);
            }
            setDraggedNode(node);
            // Fix node position
            node.fx = node.x;
            node.fy = node.y;
            simulationRef.current?.alphaTarget(0.3).restart();
          }
          onNodeClick?.(node);
        } else {
          // Background click
          if (e.shiftKey) {
            setIsSelecting(true);
            setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
          } else {
            setIsPanning(true);
            setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
            setSelectedNodes(new Set());
            onSelectionChange?.([]);
          }
        }
      };

      const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!keimenonRef.current) return;
        const { x, y, graphX, graphY } = getEventCoordinates(e);

        if (draggedNode) {
          draggedNode.fx = graphX;
          draggedNode.fy = graphY;
          return; // Simulation tick will handle redraw
        }

        if (isPanning) {
          setTransform((prev) => ({
            ...prev,
            x: e.clientX - panStart.x,
            y: e.clientY - panStart.y,
          }));
          return;
        }

        if (isSelecting && selectionBox) {
          setSelectionBox((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
          return;
        }

        // Hover effect - check nodes first, then edges
        const node = findNodeAt(graphX, graphY);
        if (node) {
          setHoveredNode(node.id);
          if (hoveredEdge) {
            setHoveredEdge(null);
            onEdgeHover?.(null, { x: 0, y: 0 });
          }
        } else {
          setHoveredNode(null);
          // Check for edge hover
          const edge = findEdgeAt(graphX, graphY);
          if (edge !== hoveredEdge) {
            setHoveredEdge(edge);
            if (edge) {
              onEdgeHover?.(edge, { x: e.clientX, y: e.clientY });
            } else {
              onEdgeHover?.(null, { x: 0, y: 0 });
            }
          } else if (edge && hoveredEdge) {
            // Update position for moving mouse over same edge
            onEdgeHover?.(edge, { x: e.clientX, y: e.clientY });
          }
        }
      };

      const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (draggedNode) {
          // Be careful: if we clear fx/fy, it snaps back to force layout.
          // Often "drag to fix" implies it STAYS fixed.
          // If we want it to float again, we'd set null.
          // Let's keep it fixed for now, or maybe release if not moved much?
          // Standard D3 drag behavior usually releases unless specifically pinned.
          // Let's hold it fixed for this "Whiteboard" feel.

          // To release: draggedNode.fx = null; draggedNode.fy = null;

          setDraggedNode(null);
          simulationRef.current?.alphaTarget(0);
        }

        if (isSelecting && selectionBox) {
          const { startX, startY, endX, endY } = selectionBox;
          const minX = Math.min(startX, endX);
          const maxX = Math.max(startX, endX);
          const minY = Math.min(startY, endY);
          const maxY = Math.max(startY, endY);

          // Transform rect to graph space
          const gMinX = (minX - transform.x) / transform.scale;
          const gMaxX = (maxX - transform.x) / transform.scale;
          const gMinY = (minY - transform.y) / transform.scale;
          const gMaxY = (maxY - transform.y) / transform.scale;

          const newSelection = new Set<string>();
          nodes.forEach((n) => {
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
          });
          setSelectedNodes(newSelection);
          onSelectionChange?.(Array.from(newSelection));
          setSelectionBox(null);
          setIsSelecting(false);
        }

        setIsPanning(false);
      };

      useEffect(() => {
        const canvas = keimenonRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();

          // Native WheelEvent coordinates
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          const delta = e.deltaY > 0 ? 0.9 : 1.1;

          setTransform((currentTransform) => {
            const newScale = Math.max(0.1, Math.min(5, currentTransform.scale * delta));
            // Zoom towards pointer
            const newX = x - (x - currentTransform.x) * (newScale / currentTransform.scale);
            const newY = y - (y - currentTransform.y) * (newScale / currentTransform.scale);

            return { x: newX, y: newY, scale: newScale };
          });
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => {
          canvas.removeEventListener('wheel', onWheel);
        };
      }, []);

      const getCursorClass = () => {
        if (isPanning) return 'cursor-grabbing';
        if (isSelecting) return 'cursor-crosshair';
        if (draggedNode) return 'cursor-grabbing';
        if (hoveredNode) return 'cursor-pointer';
        return 'cursor-grab';
      };

      return (
        <canvas
          ref={keimenonRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={(e) => {
            const { graphX, graphY } = getEventCoordinates(e);
            const node = findNodeAt(graphX, graphY);
            if (node) onNodeDoubleClick?.(node);
          }}
          className={`bg-slate-950 ${getCursorClass()}`}
        />
      );
    }
  )
);

Keimenon2D.displayName = 'Keimenon2D';

function getNodeColor(node: GraphNode, isSelected: boolean, isHovered: boolean): string {
  const colors: Record<string, string> = {
    Source: 'rgba(59, 130, 246, 0.6)',
    SourceDoc: 'rgba(20, 184, 166, 0.6)',
    Group: 'rgba(168, 85, 247, 0.6)',
    Folder: 'rgba(234, 179, 8, 0.6)',
    ObjectiveClaim: 'rgba(34, 197, 94, 0.6)',
    Constellation: 'rgba(249, 115, 22, 0.6)',
    UserNode: 'rgba(236, 72, 153, 0.6)',
    // V2 Nodes
    Lexeme: 'rgba(148, 163, 184, 0.4)', // Slate (subtle)
    Phrase: 'rgba(251, 146, 60, 0.7)', // Orange
    Topic: 'rgba(239, 68, 68, 0.7)', // Red
    VerifiedSource: 'rgba(16, 185, 129, 0.8)', // Emerald (trusted)
    VerifiedClaim: 'rgba(59, 130, 246, 0.8)', // Blue (fact)
    // World Model V5: Principal nodes
    ConversationThread: 'rgba(147, 51, 234, 0.6)', // Purple
  };

  // Handle Principal nodes based on principal_kind
  let color: string;
  if (node.kind === 'Principal') {
    const nodeWithData = node as GraphNode & { principal_kind?: string };
    const principalKind = nodeWithData.principal_kind;
    if (principalKind === 'human') {
      color = 'rgba(236, 72, 153, 0.7)'; // Pink for humans
    } else if (principalKind === 'agent') {
      color = 'rgba(139, 92, 246, 0.7)'; // Violet for AI agents
    } else if (principalKind === 'contact') {
      color = 'rgba(107, 114, 128, 0.6)'; // Gray for contacts
    } else {
      color = 'rgba(168, 85, 247, 0.6)'; // Default purple for unknown Principal
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
