import React, { useEffect, useState, useRef } from 'react';
import { AgentRunProvenance, organizationService } from '@/services/organization-service';
import {
  X,
  Network,
  FileText,
  MessageSquare,
  Tag,
  AlertCircle,
  Loader2,
  Eye,
  Cpu,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  GraphNode,
  GraphEdge,
  buildProvenanceGraph,
  filterGraphByKind,
  searchEvidenceItems,
  calculateZoomToFit,
  calculateNodeFocusTransform,
  resetNodeLayout,
} from './provenance-graph-utils';

interface ProvenanceViewerModalProps {
  runId: string;
  onClose: () => void;
}

export function ProvenanceViewerModal({ runId, onClose }: ProvenanceViewerModalProps) {
  const [provenance, setProvenance] = useState<AgentRunProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Filter and Search states
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    new Set(['AgentRun', 'Source', 'SourceSpan', 'Phrase', 'Topic'])
  );
  const [activeTab, setActiveTab] = useState<'details' | 'list'>('details');
  const [searchQuery, setSearchQuery] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs holding original graph vs visible projected graph
  const allNodesRef = useRef<GraphNode[]>([]);
  const allEdgesRef = useRef<GraphEdge[]>([]);
  const visibleNodesRef = useRef<GraphNode[]>([]);
  const visibleEdgesRef = useRef<GraphEdge[]>([]);

  const animationFrameRef = useRef<number | null>(null);
  const transformRef = useRef({ x: 0, y: 0, zoom: 1 });
  const targetTransformRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Fetch and build graph once
  useEffect(() => {
    const fetchProvenance = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await organizationService.getAgentRunProvenance(runId);
        setProvenance(data);

        if (data && data.evidence) {
          const { nodes, edges } = buildProvenanceGraph(data, runId);
          allNodesRef.current = nodes;
          allEdgesRef.current = edges;

          // Default visible projection
          visibleNodesRef.current = nodes;
          visibleEdgesRef.current = edges;

          const centerNode = nodes.find((n) => n.id === 'run-center');
          if (centerNode) {
            setSelectedNode(centerNode);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch provenance:', err);
        setError(err.message || 'Failed to load provenance data');
      } finally {
        setLoading(false);
      }
    };

    fetchProvenance();
  }, [runId]);

  // Sync visible projected graph when activeKinds toggles
  useEffect(() => {
    const { nodes, edges } = filterGraphByKind(
      { nodes: allNodesRef.current, edges: allEdgesRef.current },
      activeKinds
    );
    visibleNodesRef.current = nodes;
    visibleEdgesRef.current = edges;

    // Adjust selectedNode if it has been filtered out
    if (selectedNode && !activeKinds.has(selectedNode.kind)) {
      const center = nodes.find((n) => n.id === 'run-center');
      setSelectedNode(center || null);
    }
  }, [activeKinds]);

  // Interactive Viewport Commands
  const handleZoomIn = () => {
    targetTransformRef.current = null; // stop running fly animations
    const nextZoom = Math.min(3.0, transformRef.current.zoom * 1.25);
    // Center-anchored zoom adjust
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 500;
    const h = canvas?.clientHeight ?? 400;

    const cx = w / 2;
    const cy = h / 2;
    const dx = cx - transformRef.current.x;
    const dy = cy - transformRef.current.y;

    const zoomRatio = nextZoom / transformRef.current.zoom;
    transformRef.current.x = cx - dx * zoomRatio;
    transformRef.current.y = cy - dy * zoomRatio;
    transformRef.current.zoom = nextZoom;
  };

  const handleZoomOut = () => {
    targetTransformRef.current = null;
    const nextZoom = Math.max(0.4, transformRef.current.zoom / 1.25);
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 500;
    const h = canvas?.clientHeight ?? 400;

    const cx = w / 2;
    const cy = h / 2;
    const dx = cx - transformRef.current.x;
    const dy = cy - transformRef.current.y;

    const zoomRatio = nextZoom / transformRef.current.zoom;
    transformRef.current.x = cx - dx * zoomRatio;
    transformRef.current.y = cy - dy * zoomRatio;
    transformRef.current.zoom = nextZoom;
  };

  const handleZoomToFit = () => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 500;
    const h = canvas?.clientHeight ?? 400;

    const target = calculateZoomToFit(visibleNodesRef.current, w, h);
    targetTransformRef.current = target;
  };

  const handleResetLayout = () => {
    resetNodeLayout(allNodesRef.current);

    // Refresh visibility layout
    const { nodes, edges } = filterGraphByKind(
      { nodes: allNodesRef.current, edges: allEdgesRef.current },
      activeKinds
    );
    visibleNodesRef.current = nodes;
    visibleEdgesRef.current = edges;

    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 500;
    const h = canvas?.clientHeight ?? 400;
    const target = calculateZoomToFit(nodes, w, h);
    targetTransformRef.current = target;
  };

  const handleSelectNodeFromList = (nodeId: string) => {
    const node = visibleNodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
      setActiveTab('details');

      const canvas = canvasRef.current;
      const w = canvas?.clientWidth ?? 500;
      const h = canvas?.clientHeight ?? 400;

      const target = calculateNodeFocusTransform(node, w, h, 1.3);
      targetTransformRef.current = target;
    }
  };

  // Toggle filter helper
  const handleToggleKind = (kind: string) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        // Enforce AgentRun stays visible by default per constraints unless intentionally unchecked
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  // Force-directed graph simulation & rendering loop
  useEffect(() => {
    if (loading || error || !provenance || !provenance.evidence || provenance.evidence.length === 0)
      return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI sizing
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 500;
    const height = canvas.clientHeight || 400;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const simulation = () => {
      const nodes = visibleNodesRef.current;
      const edges = visibleEdgesRef.current;

      // 1. Force Directed Layout Math (Active projected subset only)
      for (let step = 0; step < 3; step++) {
        // Center forces
        nodes.forEach((n) => {
          if (n.id === 'run-center') return;
          const dx = width / 2 - n.x;
          const dy = height / 2 - n.y;
          n.vx += dx * 0.0005;
          n.vy += dy * 0.0005;
        });

        // Repulsion forces
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = n1.radius + n2.radius + 40;

            if (dist < minDist) {
              const force = (minDist - dist) * 0.01;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (n1.id !== 'run-center') {
                n1.x -= fx;
                n1.y -= fy;
              }
              if (n2.id !== 'run-center') {
                n2.x += fx;
                n2.y += fy;
              }
            }
          }
        }

        // Attraction forces along edges
        edges.forEach((e) => {
          const n1 = nodes.find((n) => n.id === e.source);
          const n2 = nodes.find((n) => n.id === e.target);
          if (!n1 || !n2) return;

          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const desiredDist = n1.kind === 'AgentRun' ? 140 : 85;

          const force = (dist - desiredDist) * 0.005 * e.strength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (n1.id !== 'run-center') {
            n1.vx += fx;
            n1.vy += fy;
          }
          if (n2.id !== 'run-center') {
            n2.vx -= fx;
            n2.vy -= fy;
          }
        });

        // Apply velocities and friction
        nodes.forEach((n) => {
          if (n.id === 'run-center') return;
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.85;
          n.vy *= 0.85;

          // Soft boundary limits
          n.x = Math.max(30, Math.min(width - 30, n.x));
          n.y = Math.max(30, Math.min(height - 30, n.y));
        });
      }

      // Smooth pan/zoom interpolation (LERP Focus Animation)
      if (targetTransformRef.current) {
        const target = targetTransformRef.current;
        const current = transformRef.current;
        const lerpSpeed = 0.15;

        current.x += (target.x - current.x) * lerpSpeed;
        current.y += (target.y - current.y) * lerpSpeed;
        current.zoom += (target.zoom - current.zoom) * lerpSpeed;

        if (
          Math.abs(target.x - current.x) < 0.1 &&
          Math.abs(target.y - current.y) < 0.1 &&
          Math.abs(target.zoom - current.zoom) < 0.002
        ) {
          current.x = target.x;
          current.y = target.y;
          current.zoom = target.zoom;
          targetTransformRef.current = null; // finished fly animation
        }
      }

      // 2. Draw loop
      ctx.clearRect(0, 0, width, height);

      // Save transform context
      ctx.save();
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.zoom, transformRef.current.zoom);

      // Draw Edges
      edges.forEach((e) => {
        const n1 = nodes.find((n) => n.id === e.source);
        const n2 = nodes.find((n) => n.id === e.target);
        if (!n1 || !n2) return;

        const isHighlighted =
          (hoveredNode && (hoveredNode.id === n1.id || hoveredNode.id === n2.id)) ||
          (selectedNode && (selectedNode.id === n1.id || selectedNode.id === n2.id));

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.lineWidth = isHighlighted ? 2.5 : 1;
        ctx.strokeStyle = isHighlighted ? 'rgba(99, 102, 241, 0.45)' : 'rgba(51, 65, 85, 0.35)';
        ctx.stroke();

        // Glowing particle flows along citation paths
        if (isHighlighted) {
          const t = (Date.now() % 2000) / 2000;
          const px = n1.x + (n2.x - n1.x) * t;
          const py = n1.y + (n2.y - n1.y) * t;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#818cf8';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#818cf8';
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      });

      // Draw Nodes
      nodes.forEach((n) => {
        const isHovered = hoveredNode?.id === n.id;
        const isSelected = selectedNode?.id === n.id;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + (isHovered ? 2.5 : 0), 0, Math.PI * 2);

        // Harmonious Dark Palette Tailored to Node Kind
        let fillStyle = '#475569';
        let strokeStyle = '#64748b';

        if (n.kind === 'AgentRun') {
          fillStyle = '#1e1b4b';
          strokeStyle = isSelected ? '#818cf8' : '#4f46e5';
        } else if (n.kind === 'Source') {
          fillStyle = '#064e3b';
          strokeStyle = '#10b981';
        } else if (n.kind === 'SourceSpan') {
          fillStyle = '#022c22';
          strokeStyle = isSelected ? '#34d399' : '#059669';
        } else if (n.kind === 'Phrase') {
          fillStyle = '#082f49';
          strokeStyle = isSelected ? '#38bdf8' : '#0284c7';
        } else if (n.kind === 'Topic') {
          fillStyle = '#3b0764';
          strokeStyle = '#a855f7';
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.fill();
        ctx.stroke();

        // Pulsing Selection Glow
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(129, 140, 248, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // Render Hover Tooltip inside canvas dynamically
      if (hoveredNode) {
        ctx.save();
        ctx.font = '10px sans-serif';
        const labelText = hoveredNode.kind === 'AgentRun' ? 'Agent Run center' : hoveredNode.label;
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;

        const tx = hoveredNode.x - textWidth / 2 - 8;
        const ty = hoveredNode.y - hoveredNode.radius - 24;

        ctx.beginPath();
        ctx.roundRect(tx, ty, textWidth + 16, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, hoveredNode.x, ty + 11);
        ctx.restore();
      }

      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(simulation);
    };

    animationFrameRef.current = requestAnimationFrame(simulation);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [loading, error, provenance, hoveredNode, selectedNode]);

  // Transform mapping from screen client space to canvas zoom/pan space
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.zoom;
    const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.zoom;
    return { x, y };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      targetTransformRef.current = null; // stop fly-to if user starts dragging
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = getCanvasCoords(e);
    const hit = visibleNodesRef.current.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius + 8;
    });

    setHoveredNode(hit || null);
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    targetTransformRef.current = null; // stop any focusing fly animations
    const { x, y } = getCanvasCoords(e);

    const hit = visibleNodesRef.current.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius + 8;
    });

    if (hit) {
      setSelectedNode(hit);
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    targetTransformRef.current = null; // override camera focuses
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    transformRef.current.zoom = Math.max(
      0.4,
      Math.min(3.0, transformRef.current.zoom * zoomFactor)
    );
  };

  const renderIcon = (kind: string) => {
    switch (kind) {
      case 'SourceSpan':
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case 'Phrase':
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
      case 'Topic':
        return <Tag className="w-4 h-4 text-purple-400" />;
      default:
        return <Network className="w-4 h-4 text-slate-400" />;
    }
  };

  // Filter list results
  const filteredEvidenceList = provenance
    ? searchEvidenceItems(provenance.evidence, searchQuery)
    : [];

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-modal-title"
    >
      <div className="bg-slate-950 border border-slate-800 rounded-lg shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 border border-slate-850 rounded-md">
              <Network className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2
                id="provenance-modal-title"
                className="text-lg font-semibold text-slate-100 flex items-center gap-2"
              >
                Evidence Provenance Workspace
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500 font-mono">Run: {runId}</span>
                {provenance?.provider && (
                  <span className="text-[10px] font-medium text-slate-400 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                    Provider: {provenance.provider}
                  </span>
                )}
                {provenance?.model && (
                  <span className="text-[10px] font-medium text-purple-400 bg-purple-950/20 border border-purple-900/35 px-2 py-0.5 rounded">
                    Model: {provenance.model}
                  </span>
                )}
                {provenance?.skill_used && (
                  <span className="text-[10px] font-medium text-indigo-400 bg-indigo-950/20 border border-indigo-900/35 px-2 py-0.5 rounded">
                    Skill: {provenance.skill_used}
                  </span>
                )}
                {provenance?.duration_ms !== undefined && provenance.duration_ms > 0 && (
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded">
                    {provenance.duration_ms}ms
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Node Kind Active Filters Overlay */}
        {!loading && !error && provenance && provenance.evidence.length > 0 && (
          <div className="bg-slate-950 border-b border-slate-900 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 select-none">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span>Filter Projection Layers:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  key: 'AgentRun',
                  label: 'Agent Center',
                  color: 'border-indigo-800 text-indigo-400 bg-indigo-950/20',
                },
                {
                  key: 'Source',
                  label: 'Sources',
                  color: 'border-emerald-800 text-emerald-400 bg-emerald-950/20',
                },
                {
                  key: 'SourceSpan',
                  label: 'Source Spans',
                  color: 'border-teal-800 text-teal-400 bg-teal-950/20',
                },
                {
                  key: 'Phrase',
                  label: 'Phrases',
                  color: 'border-sky-800 text-sky-400 bg-sky-950/20',
                },
                {
                  key: 'Topic',
                  label: 'Topics',
                  color: 'border-purple-800 text-purple-400 bg-purple-950/20',
                },
              ].map((pill) => {
                const isActive = activeKinds.has(pill.key);
                return (
                  <button
                    key={pill.key}
                    onClick={() => handleToggleKind(pill.key)}
                    className={`text-xs px-3 py-1 border rounded-full transition-all duration-200 ${
                      isActive
                        ? `${pill.color} font-medium`
                        : 'border-slate-850 text-slate-500 hover:text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Visible Nodes: {visibleNodesRef.current.length} / {allNodesRef.current.length}
            </div>
          </div>
        )}

        {/* Content View */}
        <div className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-4">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-400 text-sm">Hydrating provenance workspace...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-4 text-rose-400">
              <AlertCircle className="w-8 h-8 animate-bounce" />
              <p>{error}</p>
            </div>
          ) : !provenance || provenance.evidence.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-2 text-slate-400 bg-slate-950">
              {provenance?.status === 'error' ? (
                <div className="text-center p-6 flex flex-col items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-rose-500 mb-3 animate-pulse shrink-0" />
                  <p className="text-slate-200 font-semibold mb-1">Agent Run Execution Failed</p>
                  <p className="text-xs text-slate-500 max-w-xs leading-normal">
                    This run terminated with an error. No context evidence was bound or processed.
                  </p>
                </div>
              ) : (
                <>
                  <Network className="w-8 h-8 text-slate-700 mb-2" />
                  <p>No explicit evidence was bound to this run.</p>
                  <p className="text-xs text-slate-600">
                    The model may have answered from general knowledge.
                  </p>
                </>
              )}
            </div>
          ) : (
            <React.Fragment>
              {/* Left Side: Interactive Canvas */}
              <div className="flex-1 relative bg-slate-900/40 border-r border-slate-900 flex items-center justify-center overflow-hidden select-none">
                <canvas
                  ref={canvasRef}
                  onMouseMove={handlePointerMove}
                  onMouseDown={handlePointerDown}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onWheel={handleWheel}
                  className="cursor-grab active:cursor-grabbing w-full h-full"
                />

                {/* Canvas Floating Viewport Toolbar */}
                <div className="absolute top-4 right-4 bg-slate-950/85 backdrop-blur-sm border border-slate-900 rounded-lg p-1.5 shadow-xl flex gap-1 items-center z-10">
                  <button
                    onClick={handleZoomIn}
                    title="Zoom In"
                    aria-label="Zoom In"
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md transition-colors"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    aria-label="Zoom Out"
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-md transition-colors"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleZoomToFit}
                    title="Zoom to Fit"
                    aria-label="Zoom to Fit"
                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-950/30 rounded-md transition-colors"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                  <div className="w-[1px] h-4 bg-slate-900 mx-0.5" />
                  <button
                    onClick={handleResetLayout}
                    title="Reset Layout"
                    aria-label="Reset Layout"
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-md transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Floating micro instructions overlay */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-sm border border-slate-900 p-2 rounded text-[10px] text-slate-400 space-y-0.5 pointer-events-none">
                  <p>• Click nodes to inspect citation details</p>
                  <p>• Drag canvas to pan, scroll to zoom</p>
                </div>

                {/* Empty filter state warning overlay */}
                {visibleNodesRef.current.length === 0 && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-slate-400 z-20">
                    <AlertCircle className="w-10 h-10 text-rose-500 mb-3 animate-pulse shrink-0" />
                    <p className="font-semibold text-slate-200">
                      No visible evidence with current filters.
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1 leading-normal">
                      Select one or more projection kinds above to restore visible nodes and inspect
                      citation details.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Side: Detail Sidebar Panel */}
              <div className="w-96 flex flex-col bg-slate-950 border-l border-slate-900 overflow-hidden">
                {/* Stats Panel */}
                <div className="p-4 border-b border-slate-900 grid grid-cols-2 gap-2 shrink-0">
                  <div className="bg-slate-900/50 border border-slate-850 p-2.5 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Total Evidence
                    </p>
                    <p className="text-lg font-light text-slate-200">
                      {provenance.stats.total_items}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-2.5 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Source Spans
                    </p>
                    <p className="text-lg font-light text-emerald-400">{provenance.stats.spans}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-2.5 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Phrases
                    </p>
                    <p className="text-lg font-light text-sky-400">{provenance.stats.phrases}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-2.5 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Topics
                    </p>
                    <p className="text-lg font-light text-purple-400">{provenance.stats.topics}</p>
                  </div>
                </div>

                {/* Sidebar Tabs switcher */}
                <div className="flex border-b border-slate-900 select-none shrink-0 bg-slate-950/40">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors ${
                      activeTab === 'details'
                        ? 'border-indigo-500 text-indigo-400 font-semibold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Node Details
                  </button>
                  <button
                    onClick={() => setActiveTab('list')}
                    className={`flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors ${
                      activeTab === 'list'
                        ? 'border-indigo-500 text-indigo-400 font-semibold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Evidence ({filteredEvidenceList.length})
                  </button>
                </div>

                {/* Tab Content Panels */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-slate-950/20">
                  {activeTab === 'details' ? (
                    <div className="p-4 space-y-4 flex-1 flex flex-col">
                      {selectedNode ? (
                        <div className="space-y-4 flex-1 flex flex-col">
                          <div className="flex items-center justify-between shrink-0">
                            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                              <Cpu className="w-3.5 h-3.5" />
                              Citation Inspector
                            </span>
                            <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-850 text-slate-400">
                              {selectedNode.kind}
                            </span>
                          </div>

                          <div className="bg-slate-900/30 border border-slate-850 rounded-lg p-4 space-y-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                {renderIcon(selectedNode.kind)}
                                <span className="text-sm font-medium text-slate-200">
                                  {selectedNode.kind === 'AgentRun'
                                    ? 'Center Anchor'
                                    : `${selectedNode.kind} Node`}
                                </span>
                              </div>

                              {selectedNode.text ? (
                                <div className="space-y-2">
                                  <p className="text-xs text-slate-400 leading-relaxed max-h-60 overflow-y-auto bg-slate-950 p-2.5 rounded border border-slate-900 font-sans custom-scrollbar select-text">
                                    "{selectedNode.text}"
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">
                                  No associated text payload.
                                </p>
                              )}
                            </div>

                            <div className="text-[10px] text-slate-500 font-mono space-y-1 border-t border-slate-900 pt-2.5 shrink-0">
                              <p className="truncate">Node ID: {selectedNode.id}</p>
                              {selectedNode.source_id && (
                                <p className="truncate">Source ID: {selectedNode.source_id}</p>
                              )}
                              {selectedNode.frequency && (
                                <p>Citation Frequency: {selectedNode.frequency}x</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2 py-24">
                          <Eye className="w-6 h-6 text-slate-700" />
                          <p className="text-xs">
                            Hover or select a node in the graph canvas to inspect its source text.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    // All Evidence Search Panel
                    <div className="p-4 flex flex-col flex-1 overflow-hidden">
                      <div className="relative mb-3 shrink-0">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search evidence..."
                          className="w-full bg-slate-950 border border-slate-850 rounded-md py-1.5 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Evidence item card list */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 select-none">
                        {filteredEvidenceList.length > 0 ? (
                          filteredEvidenceList.map((item) => {
                            const isSelected = selectedNode?.id === item.id;
                            const isVisible = activeKinds.has(item.kind);
                            return (
                              <div
                                key={item.id}
                                onClick={() => isVisible && handleSelectNodeFromList(item.id)}
                                className={`border p-3 rounded-lg text-left transition-all duration-200 ${
                                  !isVisible
                                    ? 'border-slate-900 bg-slate-950/20 opacity-30 cursor-not-allowed'
                                    : isSelected
                                      ? 'border-indigo-500 bg-indigo-950/10 cursor-pointer shadow-md shadow-indigo-950/20'
                                      : 'border-slate-850 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/80 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    {renderIcon(item.kind)}
                                    <span className="text-[10px] font-semibold tracking-wide text-slate-300 uppercase">
                                      {item.kind}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {item.frequency && (
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-800 border border-slate-750 px-1.5 py-0.5 rounded">
                                        {item.frequency}x
                                      </span>
                                    )}
                                    {!isVisible && (
                                      <span className="text-[9px] font-semibold text-rose-500 bg-rose-950/10 border border-rose-900/20 px-1.5 py-0.5 rounded">
                                        Filtered
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-normal line-clamp-3 mb-2 italic">
                                  "{item.text}"
                                </p>
                                <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                                  <span className="truncate max-w-[140px]">ID: {item.id}</span>
                                  {item.source_id && (
                                    <span className="truncate max-w-[140px]">
                                      Src: {item.source_id.split('-')[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-12 text-slate-500">
                            <Search className="w-5 h-5 mx-auto mb-2 text-slate-700" />
                            <p className="text-xs">No matching evidence found.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
