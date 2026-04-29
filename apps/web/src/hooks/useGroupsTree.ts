import { useState, useEffect, useCallback } from 'react';
import { Folder, Tag, Filter, Grid } from 'lucide-react';
import { TreeNode } from '@/components/common/NavigationBar';
import { useAuth } from '@/contexts/AuthContext';
import { errorCapture } from '@/services/error-capture.service';
import { API_BASE_URL } from '@/lib/env.config';
import {
  authenticatedFetch,
  getGraphSnapshot,
  type GraphNode,
  type GraphEdge,
} from '@/lib/api-client';
import { IMPORT_GRAPH_REFRESH_EVENT } from '@/lib/import-refresh-events';

interface GroupNode {
  id: string;
  label: string;
  kind: 'Folder' | 'Group';
  group_kind?: 'manual' | 'smart' | 'cluster';
  icon: string;
  badge?: number | string;
  badgeColor?: string;
  isLeaf?: boolean;
  metadata?: Record<string, any>;
}

export interface GroupMembersPayload {
  nodeIds: string[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Hook to fetch and manage groups/folders tree for navigation
 * Follows the same pattern as useAccountTree
 */
export function useGroupsTree() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroupsTree = useCallback(async () => {
    if (!user) {
      setTreeData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/groups`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const groups: GroupNode[] = data.groups || [];
      const tree: TreeNode[] = groups.map((group) => groupToTreeNode(group));
      setTreeData(tree);
    } catch (err: any) {
      console.error('Failed to fetch groups tree:', err);

      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'api',
          operation: 'groups.fetchTree',
          userId: user.userId,
          accountId: user.accountId,
          metadata: {
            component: 'useGroupsTree',
            endpoint: '/api/v1/groups',
          },
        },
        'error'
      );

      const userMessage = capturedError.userMessage || err.message || 'Failed to load groups';
      setError(userMessage);
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTreeData([]);
      setLoading(false);
      return;
    }

    void fetchGroupsTree();

    const onImportGraphRefresh = () => {
      void fetchGroupsTree();
    };

    window.addEventListener(IMPORT_GRAPH_REFRESH_EVENT, onImportGraphRefresh);
    return () => {
      window.removeEventListener(IMPORT_GRAPH_REFRESH_EVENT, onImportGraphRefresh);
    };
  }, [fetchGroupsTree, user]);

  /**
   * Refetch groups (for after create/update/delete)
   */
  const refetch = async () => {
    if (!user) return;
    await fetchGroupsTree();
  };

  return { treeData, loading, error, refetch };
}

/**
 * Convert GroupNode to TreeNode format for NavigationBar
 */
function groupToTreeNode(group: GroupNode): TreeNode {
  // Determine icon based on kind and group_kind
  let IconComponent = Tag; // default for manual groups
  if (group.kind === 'Folder') {
    IconComponent = Folder;
  } else if (group.group_kind === 'smart') {
    IconComponent = Filter;
  } else if (group.group_kind === 'cluster') {
    IconComponent = Grid;
  }

  // Determine badge color
  let badgeColor: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate' = 'slate';
  if (group.kind === 'Folder') {
    badgeColor = 'slate';
  } else {
    badgeColor = 'blue';
  }

  return {
    id: group.id,
    label: group.label,
    icon: IconComponent,
    badge: group.badge,
    badgeColor: (group.badgeColor as any) || badgeColor,
    metadata: {
      kind: group.kind,
      group_kind: group.group_kind,
      isLeaf: group.isLeaf,
      ...group.metadata,
    },
  };
}

/**
 * Fetch children of a folder
 * Used for lazy-loading when a folder is expanded
 */
export async function fetchFolderChildren(folderId: string): Promise<TreeNode[]> {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/groups/${folderId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const children: GroupNode[] = data.children || [];

    return children.map((child) => groupToTreeNode(child));
  } catch (error: any) {
    console.error('Failed to fetch folder children:', error);

    // Capture error for console display
    errorCapture.capture(
      error,
      {
        domain: 'api',
        operation: 'groups.fetchFolderChildren',
        metadata: {
          component: 'fetchFolderChildren',
          folderId,
          endpoint: `/api/v1/groups/${folderId}`,
        },
      },
      'error'
    );

    throw error;
  }
}

/**
 * Fetch member node IDs from a group
 * Used when a group is clicked to display its members in Keimenon
 */
export async function fetchGroupMembers(
  groupId: string,
  recursive = false
): Promise<GroupMembersPayload> {
  try {
    const url = `${API_BASE_URL}/api/v1/groups/${groupId}/nodes${recursive ? '?recursive=true' : ''}`;
    const response = await authenticatedFetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const basePayload: GroupMembersPayload = {
      nodeIds: data.node_ids || [],
      nodes: data.nodes || [],
      edges: data.edges || [],
    };

    if (basePayload.nodeIds.length === 0) {
      return basePayload;
    }

    if (basePayload.edges.length > 0) {
      return basePayload;
    }

    // Snapshot-aligned scoped hydration fallback:
    // when group member edges are sparse/empty, ask the canonical selector
    // for strongest connectors among this scope.
    let snapshot;
    try {
      snapshot = await getGraphSnapshot({
        seed_node_ids: [groupId, ...basePayload.nodeIds].slice(0, 300),
        node_budget: 3000,
        edge_budget: 10000,
      });
    } catch {
      return basePayload;
    }

    const mergedNodesById = new Map<string, GraphNode>();
    for (const node of basePayload.nodes) {
      mergedNodesById.set(node.id, node);
    }
    for (const node of snapshot.nodes) {
      if (!mergedNodesById.has(node.id)) {
        mergedNodesById.set(node.id, node);
      }
    }

    const mergedEdgesById = new Map<string, GraphEdge>();
    for (const edge of snapshot.edges) {
      mergedEdgesById.set(edge.id, edge);
    }

    return {
      nodeIds: basePayload.nodeIds,
      nodes: Array.from(mergedNodesById.values()),
      edges: Array.from(mergedEdgesById.values()),
    };
  } catch (error: any) {
    console.error('Failed to fetch group members:', error);

    // Capture error for console display
    errorCapture.capture(
      error,
      {
        domain: 'api',
        operation: 'groups.fetchMembers',
        metadata: {
          component: 'fetchGroupMembers',
          groupId,
          recursive,
          endpoint: `/api/v1/groups/${groupId}/nodes`,
        },
      },
      'error'
    );

    throw error;
  }
}
