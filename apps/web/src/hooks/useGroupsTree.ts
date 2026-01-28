import { useState, useEffect } from 'react';
import { Folder, Tag, Filter, Grid } from 'lucide-react';
import { TreeNode } from '@/components/common/NavigationBar';
import { useAuth } from '@/contexts/AuthContext';
import { errorCapture } from '@/services/error-capture.service';
import { API_BASE_URL } from '@/lib/env.config';

const TOKEN_KEY = 'keimenon_token';

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

/**
 * Hook to fetch and manage groups/folders tree for navigation
 * Follows the same pattern as useAccountTree
 */
export function useGroupsTree() {
  const { user } = useAuth();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch if user is authenticated
    if (!user) {
      setTreeData([]);
      setLoading(false);
      return;
    }

    const fetchGroupsTree = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get auth token
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Fetch root groups and folders
        const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const groups: GroupNode[] = data.groups || [];

        // Transform to TreeNode format
        const tree: TreeNode[] = groups.map((group) => groupToTreeNode(group));

        setTreeData(tree);
      } catch (err: any) {
        console.error('Failed to fetch groups tree:', err);

        // Capture error for console display
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
    };

    fetchGroupsTree();
  }, [user]);

  /**
   * Refetch groups (for after create/update/delete)
   */
  const refetch = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/groups`, {
        headers: {
          Authorization: `Bearer ${token}`,
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
      console.error('Failed to refetch groups tree:', err);

      // Capture error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'api',
          operation: 'groups.refetch',
          userId: user.userId,
          accountId: user.accountId,
          metadata: {
            component: 'useGroupsTree.refetch',
            endpoint: '/api/v1/groups',
          },
        },
        'error'
      );

      const userMessage = capturedError.userMessage || err.message || 'Failed to reload groups';
      setError(userMessage);
    } finally {
      setLoading(false);
    }
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
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/groups/${folderId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
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
export async function fetchGroupMembers(groupId: string, recursive = false): Promise<string[]> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('Not authenticated');
    }

    const url = `${API_BASE_URL}/api/v1/groups/${groupId}/nodes${recursive ? '?recursive=true' : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.node_ids || [];
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
