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
} from 'lucide-react';

interface ProvenanceViewerModalProps {
  runId: string;
  onClose: () => void;
}

interface GraphNode {
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

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
}

export function ProvenanceViewerModal({ runId, onClose }: ProvenanceViewerModalProps) {
  const [provenance, setProvenance] = useState<AgentRunProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const transformRef = useRef({ x: 0, y: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const fetchProvenance = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await organizationService.getAgentRunProvenance(runId);
        setProvenance(data);

        // Build graph structures
        if (data && data.evidence.length > 0) {
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

          // Track unique sources to group spans
          const uniqueSources = new Set<string>();

          data.evidence.forEach((item, index) => {
            // Determine a radial distribution for initial node layouts
            const angle = (index / data.evidence.length) * Math.PI * 2;
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

            // Connect evidence directly to AgentRun
            edges.push({
              source: 'run-center',
              target: item.id,
              strength: item.frequency ? Math.min(item.frequency / 5, 1) : 0.4,
            });

            // If it has a source_id, add standard source node and link it
            if (item.source_id) {
              uniqueSources.add(item.source_id);
              edges.push({
                source: item.source_id,
                target: item.id,
                strength: 0.6,
              });
            }
          });

          // Add unique source nodes and layout them wider
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

            // Connect Source directly to Central Agent Run
            edges.push({
              source: 'run-center',
              target: srcId,
              strength: 0.5,
            });
          });

          nodesRef.current = nodes;
          edgesRef.current = edges;

          if (nodes.length > 0) {
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

  // Force-directed graph simulation & rendering loop
  useEffect(() => {
    if (loading || error || !provenance || provenance.evidence.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI sizing
    const dpr = window.devicePixelRatio || 1;
    const width = 500;
    const height = 400;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const simulation = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // 1. Force Directed Layout Math
      for (let step = 0; step < 3; step++) {
        // Center forces
        nodes.forEach((n) => {
          if (n.id === 'run-center') return;
          const dx = 250 - n.x;
          const dy = 200 - n.y;
          n.vx += dx * 0.0005;
          n.vy += dy * 0.0005;
        });

        // Repulsion forces between nodes
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
          const desiredDist = n1.kind === 'AgentRun' ? 140 : 80;

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

          // Boundary limits
          n.x = Math.max(50, Math.min(450, n.x));
          n.y = Math.max(50, Math.min(350, n.y));
        });
      }

      // 2. Draw loop
      ctx.clearRect(0, 0, width, height);

      // Save transform context
      ctx.save();
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.zoom, transformRef.current.zoom);

      // Render links
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
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.strokeStyle = isHighlighted ? 'rgba(99, 102, 241, 0.4)' : 'rgba(51, 65, 85, 0.35)';
        ctx.stroke();

        // Render moving citation particles along highlighted links
        if (isHighlighted) {
          const t = (Date.now() % 2000) / 2000;
          const px = n1.x + (n2.x - n1.x) * t;
          const py = n1.y + (n2.y - n1.y) * t;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#818cf8';
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#818cf8';
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      });

      // Render nodes
      nodes.forEach((n) => {
        const isHovered = hoveredNode?.id === n.id;
        const isSelected = selectedNode?.id === n.id;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + (isHovered ? 2 : 0), 0, Math.PI * 2);

        // Harmonious Tailored HSL Colors based on Node Kind
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

        // Glowing outer rings for active selections
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(129, 140, 248, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw miniature indicator inside central node
        if (n.kind === 'AgentRun') {
          ctx.fillStyle = '#818cf8';
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

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

  // Pointer interactions mapping screen coords to nodes
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    // Scale according to pan/zoom transforms
    const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.zoom;
    const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.zoom;
    return { x, y };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = getCanvasCoords(e);
    const hit = nodesRef.current.find((n) => {
      const dx = n.x - x;
      const dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius + 8;
    });

    setHoveredNode(hit || null);
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const hit = nodesRef.current.find((n) => {
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
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    transformRef.current.zoom = Math.max(0.4, Math.min(3, transformRef.current.zoom * zoomFactor));
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

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-modal-title"
    >
      <div className="bg-slate-950 border border-slate-800 rounded-lg shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
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
                Evidence Provenance Subgraph
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

        {/* Content View */}
        <div className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-4">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-400 text-sm">Hydrating provenance subgraph...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-4 text-rose-400">
              <AlertCircle className="w-8 h-8" />
              <p>{error}</p>
            </div>
          ) : !provenance || provenance.evidence.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center h-96 space-y-2 text-slate-400">
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
                  className="cursor-grab active:cursor-grabbing"
                />

                {/* Floating micro instructions overlay */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-sm border border-slate-900 p-2 rounded text-[10px] text-slate-400 space-y-0.5">
                  <p>• Click nodes to inspect citation details</p>
                  <p>• Drag canvas to pan, scroll to zoom</p>
                </div>
              </div>

              {/* Right Side: Detail Sidebar Panel */}
              <div className="w-96 flex flex-col bg-slate-950/20 overflow-y-auto custom-scrollbar">
                {/* Stats Panel */}
                <div className="p-4 border-b border-slate-900 grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 border border-slate-850 p-3 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Total Evidence
                    </p>
                    <p className="text-xl font-light text-slate-200">
                      {provenance.stats.total_items}
                    </p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-3 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Source Spans
                    </p>
                    <p className="text-xl font-light text-emerald-400">{provenance.stats.spans}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-3 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Phrases
                    </p>
                    <p className="text-xl font-light text-sky-400">{provenance.stats.phrases}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-850 p-3 rounded-lg">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                      Topics
                    </p>
                    <p className="text-xl font-light text-purple-400">{provenance.stats.topics}</p>
                  </div>
                </div>

                {/* Inspect Details panel */}
                <div className="flex-1 p-4 flex flex-col justify-start">
                  {selectedNode ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          Citation Inspector
                        </span>
                        <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-850 text-slate-400">
                          {selectedNode.kind}
                        </span>
                      </div>

                      <div className="bg-slate-900/30 border border-slate-850 rounded-lg p-4 space-y-3">
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
                            <p className="text-xs text-slate-400 leading-relaxed max-h-48 overflow-y-auto bg-slate-950 p-2.5 rounded border border-slate-900 font-sans custom-scrollbar select-text">
                              "{selectedNode.text}"
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">
                            No associated text payload.
                          </p>
                        )}

                        <div className="text-[10px] text-slate-500 font-mono space-y-1 border-t border-slate-900 pt-2.5">
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
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2">
                      <Eye className="w-6 h-6 text-slate-700" />
                      <p className="text-xs">
                        Hover or select a node in the graph canvas to inspect its source text.
                      </p>
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
