import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  getNodes,
  getEdges,
  GraphNode as APIGraphNode,
  GraphEdge as APIGraphEdge,
} from '@/lib/api-client';
import { getNodeLabel } from '@/lib/node-labels';

const GRAPH_LOAD_RETRY_DELAYS_MS = [300, 900, 2100] as const;
const SSR_VIEWPORT_FALLBACK = { width: 1280, height: 720 } as const;

// Node kinds that represent top-level structure (always shown)
const STRUCTURAL_KINDS = new Set([
  'AccountNode',
  'UserNode',
  'AgentNode',
  'ChatThread',
  'Source',
  'SourceDoc',
  'Group',
  'Folder',
  'ObjectiveClaim',
  'Constellation',
  'Principal',
  'ConversationThread',
  'VerifiedSource',
  'VerifiedClaim',
  'CodeBlock',
  'Topic',
  'Board',
]);

// Threshold at which we auto-filter to structural nodes only
const SMART_FILTER_THRESHOLD = 5000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryGraphLoad(error: unknown): boolean {
  const maybeError = error as { statusCode?: number; code?: string; message?: string };
  const statusCode = maybeError?.statusCode;
  const message = (maybeError?.message || '').toLowerCase();

  if (maybeError?.code === 'NETWORK_ERROR') {
    return true;
  }

  if (statusCode === 429 || (typeof statusCode === 'number' && statusCode >= 500)) {
    return true;
  }

  return message.includes('timeout') || message.includes('network') || message.includes('fetch');
}

// Helper functions to map API kinds to viewport types while preserving backend kind fidelity.
function mapNodeKindToType(kind: string): string {
  switch (kind) {
    case 'ChatThread':
      return 'conversation';
    case 'Message':
      return 'message';
    case 'Source':
      return 'source';
    case 'CodeBlock':
      return 'code';
    default:
      return kind || 'source';
  }
}

function mapEdgeKindToType(kind: string): 'contains' | 'references' | 'derives' | 'compiled' {
  switch (kind) {
    case 'CONTAINS':
    case 'HAS_MESSAGE':
      return 'contains';
    case 'DERIVES_FROM':
    case 'EXTRACTED_FROM':
      return 'derives';
    case 'COMPILED_FROM':
    case 'STITCHED_FROM':
      return 'compiled';
    case 'SIMILAR_TO':
    case 'DUP_OF':
    case 'EQUIVALENT_TO':
      return 'references';
    default:
      return 'references'; // Default fallback
  }
}

function mapApiNodeToKeimenon(apiNode: APIGraphNode): KeimenonNode {
  const metadata = apiNode.properties || {};
  const metadataRecord = metadata as Record<string, unknown>;
  const contactInfo =
    typeof metadataRecord.contact_info === 'object' && metadataRecord.contact_info
      ? (metadataRecord.contact_info as Record<string, unknown>)
      : undefined;
  const platform =
    typeof contactInfo?.source_platform === 'string'
      ? contactInfo.source_platform
      : typeof metadataRecord.platform === 'string'
        ? metadataRecord.platform
        : undefined;
  const label = getNodeLabel({
    id: apiNode.id,
    kind: apiNode.kind,
    ...metadataRecord,
    platform,
  });

  return {
    id: apiNode.id,
    type: mapNodeKindToType(apiNode.kind),
    kind: apiNode.kind,
    sourceRole: apiNode.properties?.source_role as SourceRole | undefined,
    position: {
      x: Math.random() * 800,
      y: Math.random() * 600,
    },
    data: {
      label,
      content: apiNode.properties?.content,
      metadata: apiNode.properties,
    },
  };
}

function mapApiEdgeToKeimenon(apiEdge: APIGraphEdge): KeimenonEdge {
  return {
    id: apiEdge.id,
    source: typeof apiEdge.from === 'string' ? apiEdge.from : apiEdge.from.id,
    target: typeof apiEdge.to === 'string' ? apiEdge.to : apiEdge.to.id,
    type: mapEdgeKindToType(apiEdge.kind),
    kind: apiEdge.kind,
    data: apiEdge.properties,
  };
}

export type SourceRole = 'imported' | 'workspace' | 'brief' | 'agent_output' | 'research_bundle';

export interface KeimenonNode {
  id: string;
  type: string;
  kind?: string; // Original API kind
  sourceRole?: SourceRole; // World Model V5: role determines visibility and UI treatment
  position: { x: number; y: number };
  data: {
    label: string;
    content?: string;
    metadata?: Record<string, any>;
  };
  selected?: boolean;
}

export interface KeimenonEdge {
  id: string;
  source: string;
  target: string;
  type: 'contains' | 'references' | 'derives' | 'compiled';
  kind: string; // Original API edge kind (NEAR_DUP, MENTIONS, etc.) for visualization
  data?: Record<string, unknown>;
}

export interface KeimenonViewport {
  x: number;
  y: number;
  zoom: number;
}

interface KeimenonState {
  // Nodes and edges
  nodes: KeimenonNode[];
  edges: KeimenonEdge[];

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Selection
  selectedNode: KeimenonNode | null;
  selectedNodeIds: Set<string>;
  hoveredNodeId: string | null;

  // Detail panel
  detailPanelNode: KeimenonNode | null;

  // Viewport
  viewport: KeimenonViewport;

  // Filters
  filters: {
    nodeTypes: Set<string>;
    searchQuery: string;
    filteredNodeIds: string[] | null; // null = show all, array = show only these IDs
    sourceRoleFilter: Set<SourceRole>; // empty = show all, populated = show only these roles
  };

  // Account isolation
  currentAccountId: string | null;
  graphLoadMetrics: {
    apiNodeCount: number;
    apiEdgeCount: number;
    structuralNodeCount: number;
    renderedEdgeCount: number;
    smartFilterApplied: boolean;
    loadedAt: number;
  } | null;

  // Actions
  setNodes: (nodes: KeimenonNode[]) => void;
  setEdges: (edges: KeimenonEdge[]) => void;
  loadGraphData: () => Promise<void>;
  hydrateGraphSubset: (nodes: APIGraphNode[], edges?: APIGraphEdge[]) => void;
  addNode: (node: KeimenonNode) => void;
  addEdge: (edge: KeimenonEdge) => void;
  updateNode: (id: string, updates: Partial<KeimenonNode>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;

  // Selection actions
  setSelectedNode: (node: KeimenonNode | null) => void;
  selectNode: (id: string, multi?: boolean) => void;
  deselectNode: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setHoveredNode: (id: string | null) => void;

  // Detail panel actions
  openDetailPanel: (node: KeimenonNode) => void;
  closeDetailPanel: () => void;

  // Viewport actions
  setViewport: (viewport: Partial<KeimenonViewport>) => void;
  resetViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;

  // Filter actions
  setNodeTypeFilter: (types: Set<string>) => void;
  setSearchQuery: (query: string) => void;
  setFilteredNodeIds: (ids: string[] | null) => void;
  setSourceRoleFilter: (roles: SourceRole[]) => void;
  clearFilters: () => void;

  // Utility
  getNode: (id: string) => KeimenonNode | undefined;
  getConnectedNodes: (id: string) => KeimenonNode[];
  reset: () => void;

  // Account isolation actions
  setCurrentAccountId: (accountId: string) => void;
}

const initialState = {
  nodes: [],
  edges: [],
  isLoading: false,
  error: null,
  selectedNode: null,
  selectedNodeIds: new Set<string>(),
  hoveredNodeId: null,
  detailPanelNode: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  filters: {
    nodeTypes: new Set<string>(),
    searchQuery: '',
    filteredNodeIds: null,
    sourceRoleFilter: new Set<SourceRole>(),
  },
  currentAccountId: null,
  graphLoadMetrics: null,
};

export const useKeimenonStore = create<KeimenonState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      loadGraphData: async () => {
        set({ isLoading: true, error: null });

        try {
          let nodesResult: Awaited<ReturnType<typeof getNodes>> | null = null;
          let edgesResult: Awaited<ReturnType<typeof getEdges>> | null = null;

          for (let attempt = 0; attempt <= GRAPH_LOAD_RETRY_DELAYS_MS.length; attempt += 1) {
            try {
              [nodesResult, edgesResult] = await Promise.all([
                getNodes({ limit: 100000 }),
                getEdges({ limit: 200000, sort: 'created_at', order: 'desc' }),
              ]);
              break;
            } catch (error) {
              const canRetry =
                attempt < GRAPH_LOAD_RETRY_DELAYS_MS.length && shouldRetryGraphLoad(error);
              if (!canRetry) {
                throw error;
              }

              await wait(GRAPH_LOAD_RETRY_DELAYS_MS[attempt]);
            }
          }

          if (!nodesResult || !edgesResult) {
            throw new Error('Failed to load graph data after retries');
          }

          // Transform API nodes to Keimenon nodes
          const allNodes: KeimenonNode[] = nodesResult.nodes.map(mapApiNodeToKeimenon);

          // Performance: auto-filter to structural nodes when data volume is large
          // This prevents the D3 simulation from choking on 100K+ Lexeme/Phrase nodes
          let keimenonNodes = allNodes;
          const smartFilterApplied = allNodes.length > SMART_FILTER_THRESHOLD;
          if (smartFilterApplied) {
            keimenonNodes = allNodes.filter((n) => STRUCTURAL_KINDS.has(n.kind || n.type));
            console.info(
              `[Keimenon] Smart filter: ${allNodes.length} nodes → ${keimenonNodes.length} structural nodes`
            );
          }

          // Build a set of visible node IDs for edge filtering
          const visibleNodeIds = new Set(keimenonNodes.map((n) => n.id));

          // Transform API edges, filtering out edges that reference hidden nodes
          const keimenonEdges: KeimenonEdge[] = edgesResult.edges
            .map(mapApiEdgeToKeimenon)
            .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

          set({
            nodes: keimenonNodes,
            edges: keimenonEdges,
            isLoading: false,
            error: null,
            graphLoadMetrics: {
              apiNodeCount: allNodes.length,
              apiEdgeCount: edgesResult.edges.length,
              structuralNodeCount: keimenonNodes.length,
              renderedEdgeCount: keimenonEdges.length,
              smartFilterApplied,
              loadedAt: Date.now(),
            },
          });
        } catch (error: any) {
          console.error('Failed to load graph data:', error);
          set({
            isLoading: false,
            error: error.message || 'Failed to load graph data',
            graphLoadMetrics: null,
          });
        }
      },

      hydrateGraphSubset: (apiNodes, apiEdges = []) =>
        set((state) => {
          const mergedNodesById = new Map(state.nodes.map((node) => [node.id, node]));
          for (const apiNode of apiNodes) {
            const mapped = mapApiNodeToKeimenon(apiNode);
            const existing = mergedNodesById.get(mapped.id);
            if (existing) {
              mergedNodesById.set(mapped.id, {
                ...existing,
                ...mapped,
                position: existing.position,
              });
            } else {
              mergedNodesById.set(mapped.id, mapped);
            }
          }

          const mergedNodes = Array.from(mergedNodesById.values());
          const visibleNodeIds = new Set(mergedNodes.map((node) => node.id));

          const mergedEdgesById = new Map(state.edges.map((edge) => [edge.id, edge]));
          for (const apiEdge of apiEdges) {
            const mapped = mapApiEdgeToKeimenon(apiEdge);
            if (visibleNodeIds.has(mapped.source) && visibleNodeIds.has(mapped.target)) {
              mergedEdgesById.set(mapped.id, mapped);
            }
          }

          return {
            nodes: mergedNodes,
            edges: Array.from(mergedEdgesById.values()),
          };
        }),

      addNode: (node) =>
        set((state) => ({
          nodes: state.nodes.some((existing) => existing.id === node.id)
            ? state.nodes.map((existing) =>
                existing.id === node.id ? { ...existing, ...node } : existing
              )
            : [...state.nodes, node],
        })),

      addEdge: (edge) =>
        set((state) => ({
          edges: state.edges.some((existing) => existing.id === edge.id)
            ? state.edges.map((existing) =>
                existing.id === edge.id ? { ...existing, ...edge } : existing
              )
            : [...state.edges, edge],
        })),

      updateNode: (id, updates) =>
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node)),
        })),

      deleteNode: (id) =>
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
          selectedNodeIds: new Set(
            Array.from(state.selectedNodeIds).filter((nodeId) => nodeId !== id)
          ),
        })),

      deleteEdge: (id) =>
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id),
        })),

      setSelectedNode: (node) => set({ selectedNode: node }),

      selectNode: (id, multi = false) =>
        set((state) => {
          const newSelection = new Set(multi ? state.selectedNodeIds : []);
          newSelection.add(id);
          const selectedNode = multi
            ? state.selectedNode
            : state.nodes.find((n) => n.id === id) || null;
          return { selectedNodeIds: newSelection, selectedNode };
        }),

      deselectNode: (id) =>
        set((state) => {
          const newSelection = new Set(state.selectedNodeIds);
          newSelection.delete(id);
          const selectedNode = state.selectedNode?.id === id ? null : state.selectedNode;
          return { selectedNodeIds: newSelection, selectedNode };
        }),

      clearSelection: () => set({ selectedNodeIds: new Set(), selectedNode: null }),

      selectAll: () =>
        set((state) => ({
          selectedNodeIds: new Set(state.nodes.map((node) => node.id)),
        })),

      setHoveredNode: (id) => set({ hoveredNodeId: id }),

      openDetailPanel: (node) => set({ detailPanelNode: node }),

      closeDetailPanel: () => set({ detailPanelNode: null }),

      setViewport: (viewport) =>
        set((state) => ({
          viewport: { ...state.viewport, ...viewport },
        })),

      resetViewport: () =>
        set({
          viewport: { x: 0, y: 0, zoom: 1 },
        }),

      zoomIn: () =>
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.min(state.viewport.zoom * 1.2, 3),
          },
        })),

      zoomOut: () =>
        set((state) => ({
          viewport: {
            ...state.viewport,
            zoom: Math.max(state.viewport.zoom / 1.2, 0.1),
          },
        })),

      fitView: () => {
        const { nodes } = get();
        if (nodes.length === 0) return;

        const padding = 50;
        const minX = Math.min(...nodes.map((n) => n.position.x)) - padding;
        const minY = Math.min(...nodes.map((n) => n.position.y)) - padding;
        const maxX = Math.max(...nodes.map((n) => n.position.x)) + padding;
        const maxY = Math.max(...nodes.map((n) => n.position.y)) + padding;

        const width = maxX - minX;
        const height = maxY - minY;

        const viewportWidth =
          typeof window === 'undefined' ? SSR_VIEWPORT_FALLBACK.width : window.innerWidth;
        const viewportHeight =
          typeof window === 'undefined' ? SSR_VIEWPORT_FALLBACK.height : window.innerHeight;

        const zoom = Math.min(viewportWidth / width, viewportHeight / height, 1);

        set({
          viewport: {
            x: -minX * zoom + (viewportWidth - width * zoom) / 2,
            y: -minY * zoom + (viewportHeight - height * zoom) / 2,
            zoom,
          },
        });
      },

      setNodeTypeFilter: (types) =>
        set((state) => ({
          filters: { ...state.filters, nodeTypes: types },
        })),

      setSearchQuery: (query) =>
        set((state) => ({
          filters: { ...state.filters, searchQuery: query },
        })),

      setFilteredNodeIds: (ids) =>
        set((state) => ({
          filters: { ...state.filters, filteredNodeIds: ids },
        })),

      setSourceRoleFilter: (roles) =>
        set((state) => ({
          filters: { ...state.filters, sourceRoleFilter: new Set(roles) },
        })),

      clearFilters: () =>
        set(() => ({
          filters: {
            nodeTypes: new Set<string>(),
            searchQuery: '',
            filteredNodeIds: null,
            sourceRoleFilter: new Set<SourceRole>(),
          },
        })),

      getNode: (id) => get().nodes.find((node) => node.id === id),

      getConnectedNodes: (id) => {
        const { nodes, edges } = get();
        const connectedEdges = edges.filter((edge) => edge.source === id || edge.target === id);
        const connectedNodeIds = new Set(
          connectedEdges.flatMap((edge) => [edge.source, edge.target])
        );
        connectedNodeIds.delete(id);
        return nodes.filter((node) => connectedNodeIds.has(node.id));
      },

      setCurrentAccountId: (accountId) => set({ currentAccountId: accountId }),

      reset: () => set(initialState),
    }),
    { name: 'KeimenonStore' }
  )
);
