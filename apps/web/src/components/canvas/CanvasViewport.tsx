'use client';

import { useEffect, useRef, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { FileText, FolderPlus, Upload } from 'lucide-react';
import { useKeimenonStore } from '@/store/keimenonStore';
import { Keimenon2D, Keimenon2DHandle } from './Keimenon2D';
import { ProgressVisualization } from './ProgressVisualization';
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

    // Track active import job for progress visualization
    const { jobs } = useJobStream();
    const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);

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

    // Filter nodes if filteredNodeIds is set
    const displayNodes = useMemo(() => {
      if (filters.filteredNodeIds) {
        const idSet = new Set(filters.filteredNodeIds);
        return nodes.filter((n) => idSet.has(n.id));
      }
      return nodes;
    }, [nodes, filters.filteredNodeIds]);

    const hasContent = displayNodes.length > 0;

    // Update dimensions on mount and resize
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

      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Transform filtered nodes to GraphNode format
    const graphNodes: GraphNode[] = displayNodes.map((node) => ({
      id: node.id,
      kind: node.type,
      x: node.position.x,
      y: node.position.y,
      ...node.data.metadata,
    }));

    // Create a Set of node IDs for fast lookup
    const nodeIds = new Set(graphNodes.map((n) => n.id));

    // Transform edges to GraphEdge format, filtering out edges that reference missing nodes
    const graphEdges: GraphEdge[] = edges
      .filter((edge) => {
        // Only include edges where both source and target nodes exist
        return nodeIds.has(edge.source) && nodeIds.has(edge.target);
      })
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.type,
        ...edge.data,
      }));

    const handleNodeClick = (node: GraphNode) => {
      logDataEvent('Keimenon node clicked', 'keimenon.node.click', {
        nodeId: node.id,
        nodeKind: node.kind,
      });

      // Find the corresponding KeimenonNode and set it as selected
      const keimenonNode = displayNodes.find((n) => n.id === node.id);
      if (keimenonNode) {
        setSelectedNode(keimenonNode);
      }
    };

    const handleNodeDoubleClick = (node: GraphNode) => {
      logDataEvent('Keimenon node double-clicked', 'keimenon.node.doubleClick', {
        nodeId: node.id,
        nodeKind: node.kind,
      });
      // TODO: Implement zoom/focus on double-clicked node
      // Related: apps/web/src/components/keimenon/Keimenon2D.tsx (add focusOnNode method)
      // See: docs/features/CANVAS_NAVIGATION.md (needs creation)
    };

    const handleSelectionChange = (selectedIds: string[]) => {
      logDataEvent('Keimenon selection changed', 'keimenon.selection.change', {
        selectionCount: selectedIds.length,
      });

      if (selectedIds.length === 0) {
        clearSelection();
      } else if (selectedIds.length === 1) {
        const keimenonNode = displayNodes.find((n) => n.id === selectedIds[0]);
        if (keimenonNode) {
          setSelectedNode(keimenonNode);
        }
      } else {
        // Multi-select: update store with all selected IDs
        clearSelection();
        selectedIds.forEach((id) => selectNode(id, true));
      }
    };

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
            />

            {/* Progress Visualization Overlay - Game Dev Techniques */}
            <ProgressVisualization
              width={dimensions.width}
              height={dimensions.height}
              jobId={activeImportJobId}
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
