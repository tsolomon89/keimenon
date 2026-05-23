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
import type { LodPlanStats } from '@/lib/graph-lod';
import type { NdProjectionConfig, RenderLens } from '@/lib/nd-projection';
import { useElementSize } from '@/hooks/useElementSize';
import { IMPORT_GRAPH_REFRESH_EVENT, emitImportGraphRefresh } from '@/lib/import-refresh-events';

const FILTER_RECOVERY_NODE_KINDS = new Set(['AccountNode', 'Principal', 'Group', 'Source']);

interface KeimenonViewportProps {
  onOpenUpload: () => void;
  onOpenChatImport: () => void;
  focusModeEnabled?: boolean;
  includeConnectors?: boolean;
  renderLens?: RenderLens;
  ndConfig?: NdProjectionConfig;
  onPinnedNodeCountChange?: (count: number) => void;
}

export interface KeimenonViewportHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerView: () => void;
  zoomToFitFilteredNodes: () => void;
  focusOnNode: (nodeId: string) => void;
  clearPinnedNodes: () => void;
}

export const KeimenonViewport = forwardRef<KeimenonViewportHandle, KeimenonViewportProps>(
  (
    {
      onOpenUpload,
      onOpenChatImport,
      focusModeEnabled = false,
      includeConnectors = false,
      renderLens = '2d',
      ndConfig,
      onPinnedNodeCountChange,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const keimenon2DRef = useRef<Keimenon2DHandle>(null);
    const dimensions = useElementSize(containerRef);

    const nodes = useKeimenonStore((state) => state.nodes);
    const edges = useKeimenonStore((state) => state.edges);
    const isLoading = useKeimenonStore((state) => state.isLoading);
    const error = useKeimenonStore((state) => state.error);
    const filters = useKeimenonStore((state) => state.filters);
    const graphLoadMetrics = useKeimenonStore((state) => state.graphLoadMetrics);
    const setSelectedNode = useKeimenonStore((state) => state.setSelectedNode);
    const selectNode = useKeimenonStore((state) => state.selectNode);
    const clearSelection = useKeimenonStore((state) => state.clearSelection);
    const loadGraphData = useKeimenonStore((state) => state.loadGraphData);
    const setFilteredNodeIds = useKeimenonStore((state) => state.setFilteredNodeIds);
    const currentAccountId = useKeimenonStore((state) => state.currentAccountId);

    // Auto-refresh graph when import job completes
    const handleImportComplete = useCallback(
      (jobId: string) => {
        logDataEvent('Import job completed, refreshing graph', 'keimenon.import.complete', {
          jobId,
        });
        setFilteredNodeIds(null);
        loadGraphData();
        emitImportGraphRefresh({ jobId, reason: 'sse_import_complete' });
      },
      [loadGraphData, setFilteredNodeIds]
    );

    // Track active import job for progress visualization
    const { jobs } = useJobStream({ onImportComplete: handleImportComplete });
    const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);

    // Edge tooltip state
    const [edgeTooltip, setEdgeTooltip] = useState<{
      edge: { id: string; kind: string; data?: Record<string, unknown> };
      position: { x: number; y: number };
    } | null>(null);
    const [lodStats, setLodStats] = useState<LodPlanStats | null>(null);
    const [pinnedNodeIds, setPinnedNodeIds] = useState<string[]>([]);
    const [visibilityDiagnostics, setVisibilityDiagnostics] = useState<{
      webGlReady: boolean | null;
      lens: RenderLens;
      totalNodeCount: number;
      lodVisibleNodeCount: number;
      lensVisibleNodeCount: number;
      totalEdgeCount: number;
      lodVisibleEdgeCount: number;
      lensVisibleEdgeCount: number;
      width: number;
      height: number;
    } | null>(null);
    const lastVisibilityIssueRef = useRef<string | null>(null);

    const [showRefreshToast, setShowRefreshToast] = useState(false);

    // Find active import job
    useEffect(() => {
      let toastTimer: ReturnType<typeof setTimeout>;
      const onImportRefresh = () => {
        setFilteredNodeIds(null);
        void loadGraphData();
        setShowRefreshToast(true);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setShowRefreshToast(false), 4500);
      };

      window.addEventListener(IMPORT_GRAPH_REFRESH_EVENT, onImportRefresh);
      return () => {
        window.removeEventListener(IMPORT_GRAPH_REFRESH_EVENT, onImportRefresh);
        clearTimeout(toastTimer);
      };
    }, [loadGraphData, setFilteredNodeIds]);

    useEffect(() => {
      let activeJob: string | null = null;

      jobs.forEach((job, jobId) => {
        if (job.type === 'import' && job.status === 'running') {
          activeJob = jobId;
        }
      });

      setActiveImportJobId(activeJob);
    }, [jobs]);

    // Filter nodes by filteredNodeIds and sourceRoleFilter.
    // Recovery: never allow stale filters to force a blank canvas when data exists.
    const displaySelection = useMemo(() => {
      let filtered = nodes;
      let recoveredFromFilterZeroMatch = false;

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

      if (filters.filteredNodeIds && filtered.length === 0 && nodes.length > 0) {
        const hierarchyAnchors = nodes.filter((node) =>
          FILTER_RECOVERY_NODE_KINDS.has(node.kind || node.type)
        );
        filtered = hierarchyAnchors.length > 0 ? hierarchyAnchors : nodes;
        recoveredFromFilterZeroMatch = true;
      }

      return {
        nodes: filtered,
        recoveredFromFilterZeroMatch,
      };
    }, [nodes, filters.filteredNodeIds, filters.sourceRoleFilter]);
    const displayNodes = displaySelection.nodes;
    const recoveredFromFilterZeroMatch = displaySelection.recoveredFromFilterZeroMatch;

    const hasContent = displayNodes.length > 0;
    const measuredViewportWidth = containerRef.current?.clientWidth || 0;
    const measuredViewportHeight = containerRef.current?.clientHeight || 0;
    const hasZeroViewport =
      hasContent &&
      (dimensions.width <= 0 ||
        dimensions.height <= 0 ||
        measuredViewportWidth <= 0 ||
        measuredViewportHeight <= 0);
    const hasRendererReadyFailure =
      hasContent &&
      !hasZeroViewport &&
      visibilityDiagnostics !== null &&
      visibilityDiagnostics.webGlReady === false;
    const hasZeroVisibleNodes =
      hasContent &&
      !hasZeroViewport &&
      visibilityDiagnostics !== null &&
      visibilityDiagnostics.totalNodeCount > 0 &&
      visibilityDiagnostics.lensVisibleNodeCount === 0;
    const hasZeroVisibleEdgesAfterLod =
      hasContent &&
      !hasZeroViewport &&
      visibilityDiagnostics !== null &&
      visibilityDiagnostics.totalEdgeCount > 0 &&
      visibilityDiagnostics.lensVisibleNodeCount > 0 &&
      visibilityDiagnostics.lensVisibleEdgeCount === 0;
    const canRenderCanvas = hasContent && dimensions.width > 0 && dimensions.height > 0;

    useEffect(() => {
      const validNodeIds = new Set(displayNodes.map((node) => node.id));
      setPinnedNodeIds((previous) => previous.filter((nodeId) => validNodeIds.has(nodeId)));
    }, [displayNodes]);

    useEffect(() => {
      if (!recoveredFromFilterZeroMatch) {
        return;
      }

      logDataEvent(
        'Recovered from stale filter that produced zero visible nodes',
        'keimenon.visibility.HAS_DATA_BUT_FILTER_EXCLUDED_ALL',
        {
          filterNodeIdCount: filters.filteredNodeIds?.length ?? 0,
          storeNodeCount: nodes.length,
          recoveredNodeCount: displayNodes.length,
        }
      );
      setFilteredNodeIds(null);
    }, [
      displayNodes.length,
      filters.filteredNodeIds,
      nodes.length,
      recoveredFromFilterZeroMatch,
      setFilteredNodeIds,
    ]);

    useEffect(() => {
      onPinnedNodeCountChange?.(pinnedNodeIds.length);
    }, [onPinnedNodeCountChange, pinnedNodeIds.length]);

    useEffect(() => {
      const nextIssue = hasZeroViewport
        ? 'HAS_DATA_BUT_ZERO_VIEWPORT'
        : hasRendererReadyFailure
          ? 'HAS_DATA_BUT_RENDERER_NOT_READY'
          : hasZeroVisibleNodes
            ? 'HAS_DATA_BUT_ZERO_VISIBLE'
            : hasZeroVisibleEdgesAfterLod
              ? 'HAS_DATA_BUT_ZERO_EDGES_AFTER_LOD'
              : null;

      if (!nextIssue) {
        lastVisibilityIssueRef.current = null;
        return;
      }

      if (lastVisibilityIssueRef.current === nextIssue) {
        return;
      }

      lastVisibilityIssueRef.current = nextIssue;
      logDataEvent('Keimenon visibility diagnostics', `keimenon.visibility.${nextIssue}`, {
        issue: nextIssue,
        lens: renderLens,
        measuredViewportWidth,
        measuredViewportHeight,
        observedWidth: dimensions.width,
        observedHeight: dimensions.height,
        totalNodes: visibilityDiagnostics?.totalNodeCount ?? displayNodes.length,
        lodVisibleNodes:
          visibilityDiagnostics?.lodVisibleNodeCount ?? lodStats?.visibleNodeCount ?? 0,
        lensVisibleNodes: visibilityDiagnostics?.lensVisibleNodeCount ?? 0,
        totalEdges: visibilityDiagnostics?.totalEdgeCount ?? edges.length,
        lodVisibleEdges:
          visibilityDiagnostics?.lodVisibleEdgeCount ?? lodStats?.visibleEdgeCount ?? 0,
        lensVisibleEdges: visibilityDiagnostics?.lensVisibleEdgeCount ?? 0,
        storeNodeCount: nodes.length,
        storeEdgeCount: edges.length,
        filterNodeIdCount: filters.filteredNodeIds?.length ?? null,
        sourceRoleFilterCount: filters.sourceRoleFilter.size,
        apiNodeCount: graphLoadMetrics?.apiNodeCount ?? null,
        apiEdgeCount: graphLoadMetrics?.apiEdgeCount ?? null,
        smartFilterApplied: graphLoadMetrics?.smartFilterApplied ?? null,
      });
    }, [
      edges.length,
      dimensions.height,
      dimensions.width,
      displayNodes.length,
      filters.filteredNodeIds,
      filters.sourceRoleFilter.size,
      graphLoadMetrics?.apiEdgeCount,
      graphLoadMetrics?.apiNodeCount,
      graphLoadMetrics?.smartFilterApplied,
      hasRendererReadyFailure,
      hasZeroVisibleEdgesAfterLod,
      hasZeroViewport,
      hasZeroVisibleNodes,
      lodStats?.visibleNodeCount,
      measuredViewportHeight,
      measuredViewportWidth,
      nodes.length,
      renderLens,
      visibilityDiagnostics?.lensVisibleNodeCount,
      visibilityDiagnostics?.lensVisibleEdgeCount,
      visibilityDiagnostics?.lodVisibleEdgeCount,
      visibilityDiagnostics?.lodVisibleNodeCount,
      visibilityDiagnostics?.totalEdgeCount,
      visibilityDiagnostics?.totalNodeCount,
    ]);

    // Expose camera control methods to parent via ref.
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => keimenon2DRef.current?.zoomIn(),
        zoomOut: () => keimenon2DRef.current?.zoomOut(),
        centerView: () => keimenon2DRef.current?.centerView(),
        zoomToFitFilteredNodes: () =>
          keimenon2DRef.current?.zoomToFitNodes(displayNodes.map((node) => node.id)),
        focusOnNode: (nodeId: string) => keimenon2DRef.current?.focusOnNode(nodeId, 1.6, 220),
        clearPinnedNodes: () => setPinnedNodeIds([]),
      }),
      [displayNodes]
    );

    // Transform filtered nodes to GraphNode format
    const graphNodes: GraphNode[] = useMemo(
      () =>
        displayNodes.map((node) => ({
          id: node.id,
          kind: node.kind || node.type,
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
      keimenon2DRef.current?.focusOnNode(node.id, 1.6, 220);
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
      <div ref={containerRef} className="w-full h-full bg-slate-950 relative overflow-hidden">
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
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-md z-30">
            <div className="text-center bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl max-w-sm">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-400 border-r-2 border-r-indigo-400/20 mb-4 mx-auto"></div>
              <h3 className="text-slate-200 font-medium mb-1">Hydrating Canvas</h3>
              <p className="text-xs text-slate-500">
                Loading similarity-weighted graph topology...
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-30">
            <div className="text-center max-w-md bg-slate-900/90 border border-rose-950/40 rounded-2xl p-8 shadow-2xl mx-4">
              <div className="text-rose-500 text-4xl mb-4 font-bold flex justify-center">⚠️</div>
              <h3 className="text-lg font-semibold mb-2 text-slate-100">Failed to load graph</h3>
              <p className="text-xs text-slate-400 mb-6 bg-slate-950/60 p-3 rounded-lg border border-slate-800 font-mono text-left max-h-32 overflow-y-auto break-all">
                {error}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-sm font-semibold rounded-lg transition-colors text-white shadow-lg"
              >
                Retry loading data
              </button>
            </div>
          </div>
        )}

        {/* Post-import Graph Loaded Toast */}
        {showRefreshToast && (
          <div className="absolute bottom-6 right-6 z-30 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="bg-slate-900/95 border border-emerald-500/30 text-emerald-400 rounded-xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
              <div>
                <p className="text-sm font-medium text-slate-100">
                  New import successfully loaded!
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  The similarity knowledge graph has been refreshed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Keimenon content or empty state */}
        {!isLoading && !error && hasContent && canRenderCanvas && (
          <>
            <Keimenon2D
              ref={keimenon2DRef}
              nodes={graphNodes}
              edges={graphEdges}
              width={dimensions.width}
              height={dimensions.height}
              renderLens={renderLens}
              ndConfig={ndConfig}
              focusModeEnabled={focusModeEnabled}
              includeConnectors={includeConnectors}
              pinnedNodeIds={pinnedNodeIds}
              accountId={currentAccountId}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onSelectionChange={handleSelectionChange}
              onEdgeHover={handleEdgeHover}
              onLodStats={setLodStats}
              onPinnedNodeIdsChange={setPinnedNodeIds}
              onVisibilityDiagnostics={setVisibilityDiagnostics}
            />

            {/* Progress Visualization Overlay - Game Dev Techniques */}
            <ProgressVisualization
              width={dimensions.width}
              height={dimensions.height}
              jobId={activeImportJobId}
              renderLens={renderLens}
              ndConfig={ndConfig}
            />

            {/* Edge Tooltip */}
            <EdgeTooltip
              edge={edgeTooltip?.edge || null}
              position={edgeTooltip?.position || { x: 0, y: 0 }}
              visible={!!edgeTooltip}
            />

            {lodStats && (
              <div className="absolute top-4 right-4 z-10 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-lg">
                <div className="font-semibold text-slate-100">
                  {lodStats.level} - {lodStats.visibleNodeCount}/{lodStats.totalNodeCount} nodes
                </div>
                <div className="text-slate-400">
                  {lodStats.visibleEdgeCount}/{lodStats.totalEdgeCount} edges - gate{' '}
                  {lodStats.gate.pass ? 'pass' : 'warn'}
                </div>
                <div className="text-slate-500">
                  focus {lodStats.focusMode ? 'on' : 'off'} - pinned {pinnedNodeIds.length}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-600"
                    onClick={() => keimenon2DRef.current?.optimizeView()}
                  >
                    Optimize View
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-[11px] rounded bg-slate-800 hover:bg-amber-700 border border-slate-600"
                    onClick={() => keimenon2DRef.current?.resetLayout()}
                  >
                    Reset Layout
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {!isLoading && !error && hasContent && hasZeroViewport && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-lg w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
              <h3 className="text-lg font-semibold mb-2">Canvas viewport is not ready</h3>
              <p className="text-sm text-amber-50/90 mb-4">
                Data is loaded, but the renderer viewport reported zero size. Keimenon will retry on
                resize automatically.
              </p>
              <div className="text-xs text-amber-100/80 space-y-1 mb-4">
                <p>
                  Measured element: {measuredViewportWidth} x {measuredViewportHeight}
                </p>
                <p>
                  Observed canvas: {dimensions.width} x {dimensions.height}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new Event('resize'));
                }}
                className="px-3 py-2 text-sm rounded bg-amber-400 text-slate-900 hover:bg-amber-300"
              >
                Retry viewport measurement
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && hasContent && canRenderCanvas && hasZeroVisibleNodes && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            Dataset loaded but no nodes are currently visible for this lens/LOD profile.
          </div>
        )}

        {!isLoading && !error && hasContent && canRenderCanvas && hasZeroVisibleEdgesAfterLod && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Nodes are visible but no connector edges survived lens/LOD filtering.
          </div>
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
