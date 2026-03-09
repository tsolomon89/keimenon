'use client';

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { FileText, FolderPlus, Upload } from 'lucide-react';
import { useKeimenonStore } from '@/store/keimenonStore';
import { Keimenon2D, Keimenon2DHandle } from './Keimenon2D';
import { ProgressVisualization } from './ProgressVisualization';
import { EdgeTooltip } from './EdgeTooltip';
import { GraphNode, GraphEdge } from '@keimenon/graph';
import { useJobStream } from '@/hooks/useJobStream';
import { logDataEvent } from '@/lib/error-handler';

interface KeimenonViewportProps {
  onOpenUpload: () => void;
  onOpenChatImport: () => void;
}

export interface KeimenonViewportHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
}

export const KeimenonViewport = forwardRef<KeimenonViewportHandle, KeimenonViewportProps>(
  ({ onOpenUpload, onOpenChatImport }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const keimenon2DRef = useRef<Keimenon2DHandle>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const nodes = useKeimenonStore((state) => state.nodes);
    const edges = useKeimenonStore((state) => state.edges);
    const isLoading = useKeimenonStore((state) => state.isLoading);
    const error = useKeimenonStore((state) => state.error);
    const filters = useKeimenonStore((state) => state.filters);
    const setSelectedNode = useKeimenonStore((state) => state.setSelectedNode);
    const selectNode = useKeimenonStore((state) => state.selectNode);
    const clearSelection = useKeimenonStore((state) => state.clearSelection);
    const loadGraphData = useKeimenonStore((state) => state.loadGraphData);

    // Auto-refresh graph when import job completes
    const handleImportComplete = useCallback(
      (jobId: string) => {
        logDataEvent('Import job completed, refreshing graph', 'keimenon.import.complete', {
          jobId,
        });
        loadGraphData();
      },
      [loadGraphData]
    );

    // Track active import job for progress visualization
    const { jobs } = useJobStream({ onImportComplete: handleImportComplete });
    const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);

    // Edge tooltip state
    const [edgeTooltip, setEdgeTooltip] = useState<{
      edge: { id: string; kind: string; data?: Record<string, unknown> };
      position: { x: number; y: number };
    } | null>(null);

    // Find active import job
    useEffect(() => {
      let activeJob: string | null = null;

      jobs.forEach((job, jobId) => {
        if (job.type === 'import' && job.status === 'running') {
          activeJob = jobId;
        }
      });

      setActiveImportJobId(activeJob);
    }, [jobs]);

    // Expose camera control methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => keimenon2DRef.current?.zoomIn(),
        zoomOut: () => keimenon2DRef.current?.zoomOut(),
        centerView: () => keimenon2DRef.current?.centerView(),
      }),
      []
    );

    // Filter nodes by filteredNodeIds and sourceRoleFilter
    const displayNodes = useMemo(() => {
      let filtered = nodes;

      // Filter by specific node IDs if set
      if (filters.filteredNodeIds) {
        const idSet = new Set(filters.filteredNodeIds);
        filtered = filtered.filter((n) => idSet.has(n.id));
      }

      // Filter by sourceRole if any roles are selected
      // Only applies to Source-kind nodes; V2 spine nodes always pass through
      if (filters.sourceRoleFilter.size > 0) {
        filtered = filtered.filter((n) => {
          // V2 spine nodes and non-Source nodes always visible
          if (n.type !== 'source' && n.kind !== 'Source') {
            return true;
          }
          // Source nodes: default to 'imported' if no sourceRole
          const role = n.sourceRole ?? 'imported';
          return filters.sourceRoleFilter.has(role);
        });
      }

      return filtered;
    }, [nodes, filters.filteredNodeIds, filters.sourceRoleFilter]);

    const hasContent = displayNodes.length > 0;

    // Update dimensions on mount and resize (debounced)
    useEffect(() => {
      if (!containerRef.current) return;

      const updateDimensions = () => {
        if (containerRef.current) {
          setDimensions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      };

      let resizeTimer: ReturnType<typeof setTimeout>;
      const debouncedResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateDimensions, 150);
      };

      updateDimensions();
      window.addEventListener('resize', debouncedResize);
      return () => {
        clearTimeout(resizeTimer);
        window.removeEventListener('resize', debouncedResize);
      };
    }, []);

    // Transform filtered nodes to GraphNode format
    const graphNodes: GraphNode[] = useMemo(
      () =>
        displayNodes.map((node) => ({
          id: node.id,
          kind: node.type,
          x: node.position.x,
          y: node.position.y,
          ...node.data.metadata,
        })),
      [displayNodes]
    );

    // Create a Set of node IDs for fast lookup
    const nodeIds = useMemo(() => new Set(graphNodes.map((n) => n.id)), [graphNodes]);

    // O(1) node lookup map for click/selection callbacks
    const nodeMap = useMemo(() => {
      const map = new Map<string, (typeof displayNodes)[number]>();
      for (const node of displayNodes) {
        map.set(node.id, node);
      }
      return map;
    }, [displayNodes]);

    // Transform edges to GraphEdge format, filtering out edges that reference missing nodes
    const graphEdges: GraphEdge[] = useMemo(
      () =>
        edges
          .filter((edge) => {
            // Only include edges where both source and target nodes exist
            return nodeIds.has(edge.source) && nodeIds.has(edge.target);
          })
          .map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: edge.kind, // Use original API kind for edge visualization styling
            data: edge.data, // Pass metadata for thickness/opacity calculations
          })),
      [edges, nodeIds]
    );

    const handleNodeClick = useCallback(
      (node: GraphNode) => {
        logDataEvent('Keimenon node clicked', 'keimenon.node.click', {
          nodeId: node.id,
          nodeKind: node.kind,
        });

        // O(1) lookup via precomputed Map
        const keimenonNode = nodeMap.get(node.id);
        if (keimenonNode) {
          setSelectedNode(keimenonNode);
        }
      },
      [nodeMap, setSelectedNode]
    );

    const handleNodeDoubleClick = useCallback((node: GraphNode) => {
      logDataEvent('Keimenon node double-clicked', 'keimenon.node.doubleClick', {
        nodeId: node.id,
        nodeKind: node.kind,
      });
      // TODO: Implement zoom/focus on double-clicked node
      // Related: apps/web/src/components/keimenon/Keimenon2D.tsx (add focusOnNode method)
      // See: docs/features/CANVAS_NAVIGATION.md (needs creation)
    }, []);

    const handleSelectionChange = useCallback(
      (selectedIds: string[]) => {
        logDataEvent('Keimenon selection changed', 'keimenon.selection.change', {
          selectionCount: selectedIds.length,
        });

        if (selectedIds.length === 0) {
          clearSelection();
        } else if (selectedIds.length === 1) {
          const keimenonNode = nodeMap.get(selectedIds[0]);
          if (keimenonNode) {
            setSelectedNode(keimenonNode);
          }
        } else {
          // Multi-select: update store with all selected IDs
          clearSelection();
          selectedIds.forEach((id) => selectNode(id, true));
        }
      },
      [nodeMap, setSelectedNode, clearSelection, selectNode]
    );

    // Handle edge hover for tooltip
    const handleEdgeHover = useCallback(
      (edge: GraphEdge | null, position: { x: number; y: number }) => {
        if (edge) {
          setEdgeTooltip({
            edge: {
              id: edge.id,
              kind: edge.kind,
              data: (edge as GraphEdge & { data?: Record<string, unknown> }).data,
            },
            position,
          });
        } else {
          setEdgeTooltip(null);
        }
      },
      []
    );

    return (
      <div ref={containerRef} className="flex-1 bg-slate-950 relative overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
            linear-gradient(to right, rgb(51 65 85 / 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(51 65 85 / 0.3) 1px, transparent 1px)
          `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Loading state */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4 mx-auto"></div>
              <p className="text-slate-400">Loading graph data...</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="text-red-500 text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold mb-2 text-white">Failed to load graph</h3>
              <p className="text-slate-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Keimenon content or empty state */}
        {!isLoading && !error && hasContent && dimensions.width > 0 && (
          <>
            <Keimenon2D
              ref={keimenon2DRef}
              nodes={graphNodes}
              edges={graphEdges}
              width={dimensions.width}
              height={dimensions.height}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onSelectionChange={handleSelectionChange}
              onEdgeHover={handleEdgeHover}
            />

            {/* Progress Visualization Overlay - Game Dev Techniques */}
            <ProgressVisualization
              width={dimensions.width}
              height={dimensions.height}
              jobId={activeImportJobId}
            />

            {/* Edge Tooltip */}
            <EdgeTooltip
              edge={edgeTooltip?.edge || null}
              position={edgeTooltip?.position || { x: 0, y: 0 }}
              visible={!!edgeTooltip}
            />
          </>
        )}

        {!isLoading && !error && !hasContent && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-8 max-w-md">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Welcome to Keimenon</h2>
                <p className="text-slate-400">
                  Get started by uploading your first sources or creating a group
                </p>
              </div>

              {/* Action cards */}
              <div className="grid gap-4">
                <button
                  onClick={onOpenUpload}
                  className="p-6 bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 hover:border-purple-500/50 rounded-xl text-left transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                      <Upload className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Upload Sources</h3>
                      <p className="text-sm text-slate-400">
                        Add PDFs, text files, markdown, or images to your keimenon
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={onOpenChatImport}
                  className="p-6 bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 hover:border-purple-500/50 rounded-xl text-left transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                      <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Import Chat Conversations</h3>
                      <p className="text-sm text-slate-400">
                        Import conversations from AI chat platforms (supports files up to 2GB)
                      </p>
                    </div>
                  </div>
                </button>

                <button className="p-6 bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800 hover:border-purple-500/50 rounded-xl text-left transition-all group">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                      <FolderPlus className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Create Group</h3>
                      <p className="text-sm text-slate-400">
                        Organize your sources into collections
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

KeimenonViewport.displayName = 'KeimenonViewport';
