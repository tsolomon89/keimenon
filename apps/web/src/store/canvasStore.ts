import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  getNodes,
  getEdges,
  GraphNode as APIGraphNode,
  GraphEdge as APIGraphEdge,
} from '@/lib/api-client';

// Helper functions to map API types to Keimenon types
function mapNodeKindToType(kind: string): 'conversation' | 'message' | 'source' | 'code' {
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
      return 'source'; // Default fallback
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

export interface KeimenonNode {
  id: string;
  type: 'conversation' | 'message' | 'source' | 'code';
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
  data?: Record<string, any>;
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
  };

  // Account isolation
  currentAccountId: string | null;

  // Actions
  setNodes: (nodes: KeimenonNode[]) => void;
  setEdges: (edges: KeimenonEdge[]) => void;
  loadGraphData: () => Promise<void>;
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
  },
  currentAccountId: null,
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
          // Fetch nodes and edges from API
          const [nodesResult, edgesResult] = await Promise.all([
            getNodes({ limit: 1000 }), // Load first 1000 nodes for now
            getEdges({ limit: 2000 }), // Load first 2000 edges for now
          ]);

          console.log('🎨 loadGraphData received:', {
            nodesCount: nodesResult.nodes.length,
            edgesCount: edgesResult.edges.length,
            sampleNode: nodesResult.nodes[0]
              ? {
                  id: nodesResult.nodes[0].id,
                  kind: nodesResult.nodes[0].kind,
                  hasProperties: !!nodesResult.nodes[0].properties,
                  propertiesKeys: nodesResult.nodes[0].properties
                    ? Object.keys(nodesResult.nodes[0].properties)
                    : [],
                }
              : null,
          });

          // Transform API nodes to Keimenon nodes
          const keimenonNodes: KeimenonNode[] = nodesResult.nodes.map((apiNode: APIGraphNode) => ({
            id: apiNode.id,
            type: mapNodeKindToType(apiNode.kind),
            position: {
              x: Math.random() * 800, // Will be overridden by D3 layout
              y: Math.random() * 600,
            },
            data: {
              label:
                apiNode.properties?.title || apiNode.properties?.name || apiNode.id.slice(0, 8),
              content: apiNode.properties?.content,
              metadata: apiNode.properties,
            },
          }));

          // Transform API edges to Keimenon edges
          const keimenonEdges: KeimenonEdge[] = edgesResult.edges.map((apiEdge: APIGraphEdge) => ({
            id: apiEdge.id,
            source: typeof apiEdge.from === 'string' ? apiEdge.from : apiEdge.from.id,
            target: typeof apiEdge.to === 'string' ? apiEdge.to : apiEdge.to.id,
            type: mapEdgeKindToType(apiEdge.kind),
            data: apiEdge.properties,
          }));

          console.log('🎨 Transformed to keimenon format:', {
            keimenonNodesCount: keimenonNodes.length,
            keimenonEdgesCount: keimenonEdges.length,
            sampleKeimenonNode: keimenonNodes[0]
              ? {
                  id: keimenonNodes[0].id,
                  type: keimenonNodes[0].type,
                  label: keimenonNodes[0].data.label,
                  hasMetadata: !!keimenonNodes[0].data.metadata,
                }
              : null,
          });

          set({
            nodes: keimenonNodes,
            edges: keimenonEdges,
            isLoading: false,
            error: null,
          });

          console.log('✅ Keimenon store updated successfully');
        } catch (error: any) {
          console.error('Failed to load graph data:', error);
          // TODO: Add retry logic and exponential backoff for graph data loading failures
          // Related: apps/web/src/lib/error-handler.ts:withRetry (retry utility exists)
          // See: docs/features/ERROR_RECOVERY.md (needs creation)
          // Implement: Automatic retry with backoff, manual retry button in UI
          set({
            isLoading: false,
            error: error.message || 'Failed to load graph data',
          });
        }
      },

      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
        })),

      addEdge: (edge) =>
        set((state) => ({
          edges: [...state.edges, edge],
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

        // TODO: Handle edge case where window dimensions are unavailable (SSR, tests)
        // Related: apps/web/src/components/keimenon/KeimenonViewport.tsx (viewport management)
        // See: docs/features/CANVAS_VIEWPORT.md (needs creation)
        // Add: Check for window existence and fallback dimensions
        const padding = 50;
        const minX = Math.min(...nodes.map((n) => n.position.x)) - padding;
        const minY = Math.min(...nodes.map((n) => n.position.y)) - padding;
        const maxX = Math.max(...nodes.map((n) => n.position.x)) + padding;
        const maxY = Math.max(...nodes.map((n) => n.position.y)) + padding;

        const width = maxX - minX;
        const height = maxY - minY;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

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

      clearFilters: () =>
        set(() => ({
          filters: {
            nodeTypes: new Set(),
            searchQuery: '',
            filteredNodeIds: null,
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
