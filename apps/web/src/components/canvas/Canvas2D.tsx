'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { GraphNode, GraphEdge, calculateLayout } from '@canvas-memory/graph';

interface Canvas2DProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
}

export interface Canvas2DHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  resetView: () => void;
}

export const Canvas2D = forwardRef<Canvas2DHandle, Canvas2DProps>(({
  nodes,
  edges,
  width,
  height,
  onNodeClick,
  onNodeDoubleClick,
  onSelectionChange,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<GraphNode[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Debug: Log when Canvas2D mounts and receives props
  console.log('Canvas2D render:', {
    nodesCount: nodes.length,
    edgesCount: edges.length,
    width,
    height,
    layoutNodesCount: layoutNodes.length
  });

  // Expose camera control methods to parent via ref
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      setTransform((prev) => {
        const newScale = Math.min(prev.scale * 1.2, 5);
        return { ...prev, scale: newScale };
      });
    },
    zoomOut: () => {
      setTransform((prev) => {
        const newScale = Math.max(prev.scale / 1.2, 0.1);
        return { ...prev, scale: newScale };
      });
    },
    centerView: () => {
      if (layoutNodes.length === 0) return;

      // Calculate bounding box of all nodes
      const padding = 100;
      const minX = Math.min(...layoutNodes.map((n) => n.x ?? 0)) - padding;
      const minY = Math.min(...layoutNodes.map((n) => n.y ?? 0)) - padding;
      const maxX = Math.max(...layoutNodes.map((n) => n.x ?? 0)) + padding;
      const maxY = Math.max(...layoutNodes.map((n) => n.y ?? 0)) + padding;

      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;

      // Calculate zoom to fit
      const scaleX = width / graphWidth;
      const scaleY = height / graphHeight;
      const newScale = Math.min(scaleX, scaleY, 1);

      // Center the graph
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      setTransform({
        x: width / 2 - centerX * newScale,
        y: height / 2 - centerY * newScale,
        scale: newScale,
      });
    },
    resetView: () => {
      setTransform({ x: 0, y: 0, scale: 1 });
    },
  }), [layoutNodes, width, height]);

  // Calculate layout when nodes/edges change
  useEffect(() => {
    if (nodes.length === 0) return;

    const { nodes: positioned } = calculateLayout(nodes, edges, {
      width,
      height,
      seed: 42,
      iterations: 300,
    });

    setLayoutNodes(positioned);
  }, [nodes, edges, width, height]);

  // Drawing logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply transform
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Draw edges
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
    ctx.lineWidth = 2 / transform.scale;

    for (const edge of edges) {
      const sourceNode = layoutNodes.find((n) => n.id === (typeof edge.source === 'string' ? edge.source : edge.source.id));
      const targetNode = layoutNodes.find((n) => n.id === (typeof edge.target === 'string' ? edge.target : edge.target.id));

      if (!sourceNode || !targetNode) continue;

      ctx.beginPath();
      ctx.moveTo(sourceNode.x ?? 0, sourceNode.y ?? 0);
      ctx.lineTo(targetNode.x ?? 0, targetNode.y ?? 0);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of layoutNodes) {
      const isSelected = selectedNodes.has(node.id);
      const isHovered = hoveredNode === node.id;
      const radius = getNodeRadius(node.kind);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);

      // Fill
      ctx.fillStyle = getNodeColor(node.kind, isSelected, isHovered);
      ctx.fill();

      // Stroke
      ctx.strokeStyle = isSelected
        ? 'rgba(168, 85, 247, 1)'
        : isHovered
        ? 'rgba(100, 116, 139, 0.8)'
        : 'rgba(100, 116, 139, 0.3)';
      ctx.lineWidth = (isSelected ? 3 : 1) / transform.scale;
      ctx.stroke();

      // Label
      if (transform.scale > 0.5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = `${12 / transform.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          node.id.slice(0, 8) + '...',
          node.x ?? 0,
          (node.y ?? 0) + radius + 15 / transform.scale
        );
      }
    }

    ctx.restore();

    // Draw selection box (in screen coordinates, not transformed)
    if (selectionBox) {
      const { startX, startY, endX, endY } = selectionBox;
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }, [layoutNodes, edges, transform, selectedNodes, hoveredNode, width, height, selectionBox]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('Canvas mouseDown event fired!', {
      clientX: e.clientX,
      clientY: e.clientY,
      layoutNodesCount: layoutNodes.length,
      shiftKey: e.shiftKey
    });
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('No canvas ref!');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Transform to canvas coordinates
    const canvasX = (x - transform.x) / transform.scale;
    const canvasY = (y - transform.y) / transform.scale;

    // Check if clicking on a node
    const clickedNode = layoutNodes.find((node) => {
      const dx = (node.x ?? 0) - canvasX;
      const dy = (node.y ?? 0) - canvasY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < getNodeRadius(node.kind);
    });

    if (clickedNode) {
      // Node clicked
      if (e.shiftKey) {
        // Add to selection
        setSelectedNodes((prev) => {
          const next = new Set(prev);
          if (next.has(clickedNode.id)) {
            next.delete(clickedNode.id);
          } else {
            next.add(clickedNode.id);
          }
          onSelectionChange?.(Array.from(next));
          return next;
        });
      } else {
        // Single selection
        setSelectedNodes(new Set([clickedNode.id]));
        onSelectionChange?.([clickedNode.id]);
      }

      onNodeClick?.(clickedNode);
    } else {
      // Empty space clicked
      if (e.shiftKey) {
        // Start lasso selection
        setIsSelecting(true);
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      } else {
        // Clear selection and start panning
        setSelectedNodes(new Set());
        onSelectionChange?.([]);
        setIsPanning(true);
        setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isPanning) {
      // Pan canvas
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    } else if (isSelecting && selectionBox) {
      // Update selection box
      setSelectionBox((prev) => prev ? { ...prev, endX: x, endY: y } : null);
    } else {
      // Update hover
      const canvasX = (x - transform.x) / transform.scale;
      const canvasY = (y - transform.y) / transform.scale;

      const hoveredNode = layoutNodes.find((node) => {
        const dx = (node.x ?? 0) - canvasX;
        const dy = (node.y ?? 0) - canvasY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < getNodeRadius(node.kind);
      });

      setHoveredNode(hoveredNode?.id ?? null);
    }
  };

  const handleMouseUp = () => {
    // Finish lasso selection
    if (isSelecting && selectionBox) {
      const { startX, startY, endX, endY } = selectionBox;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      // Convert screen coordinates to canvas coordinates
      const canvasMinX = (minX - transform.x) / transform.scale;
      const canvasMaxX = (maxX - transform.x) / transform.scale;
      const canvasMinY = (minY - transform.y) / transform.scale;
      const canvasMaxY = (maxY - transform.y) / transform.scale;

      // Find nodes within selection box
      const selectedInBox = layoutNodes.filter((node) => {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        return x >= canvasMinX && x <= canvasMaxX && y >= canvasMinY && y <= canvasMaxY;
      });

      // Update selection
      const newSelection = new Set(selectedInBox.map(n => n.id));
      setSelectedNodes(newSelection);
      onSelectionChange?.(Array.from(newSelection));

      setIsSelecting(false);
      setSelectionBox(null);
    }

    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Zoom factor
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, transform.scale * delta));

    // Zoom towards mouse position
    const newX = x - (x - transform.x) * (newScale / transform.scale);
    const newY = y - (y - transform.y) * (newScale / transform.scale);

    setTransform({
      x: newX,
      y: newY,
      scale: newScale,
    });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const canvasX = (x - transform.x) / transform.scale;
    const canvasY = (y - transform.y) / transform.scale;

    const clickedNode = layoutNodes.find((node) => {
      const dx = (node.x ?? 0) - canvasX;
      const dy = (node.y ?? 0) - canvasY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < getNodeRadius(node.kind);
    });

    if (clickedNode) {
      onNodeDoubleClick?.(clickedNode);
    }
  };

  // Determine cursor style based on interaction mode
  const getCursorClass = () => {
    if (isPanning) return 'cursor-grabbing';
    if (isSelecting) return 'cursor-crosshair';
    if (hoveredNode) return 'cursor-pointer';
    return 'cursor-grab';
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      className={`bg-slate-950 ${getCursorClass()}`}
    />
  );
});

Canvas2D.displayName = 'Canvas2D';

function getNodeRadius(kind: string): number {
  switch (kind) {
    case 'Group':
      return 40;
    case 'Constellation':
      return 35;
    case 'Source':
      return 25;
    case 'ObjectiveClaim':
      return 20;
    default:
      return 15;
  }
}

function getNodeColor(
  kind: string,
  isSelected: boolean,
  isHovered: boolean
): string {
  const colors: Record<string, string> = {
    Source: 'rgba(59, 130, 246, 0.6)',
    Group: 'rgba(168, 85, 247, 0.6)',
    Folder: 'rgba(234, 179, 8, 0.6)',
    ObjectiveClaim: 'rgba(34, 197, 94, 0.6)',
    Constellation: 'rgba(249, 115, 22, 0.6)',
  };

  let color = colors[kind] || 'rgba(100, 116, 139, 0.6)';

  if (isSelected) {
    color = color.replace('0.6', '1');
  } else if (isHovered) {
    color = color.replace('0.6', '0.8');
  }

  return color;
}
