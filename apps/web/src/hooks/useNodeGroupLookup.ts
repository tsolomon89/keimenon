import { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '@/lib/env.config';

interface GroupInfo {
  id: string;
  kind: string;
  name: string;
  [key: string]: any;
}

interface NodeGroupLookupResult {
  groupIds: Set<string>;
  groups: GroupInfo[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to perform reverse lookup: find which groups contain the given nodes
 * OPTIMIZATION: Uses batch endpoint instead of O(n) individual API calls
 * Used for Keimenon ↔ Navigation bidirectional sync
 *
 * @param nodeIds Array of node IDs to look up
 * @returns Set of group IDs that contain any of the given nodes
 */
export function useNodeGroupLookup(nodeIds: string[]): NodeGroupLookupResult {
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OPTIMIZATION: Stable dependency - sort without mutating, memoize result
  const sortedNodeIds = useMemo(() => {
    if (!nodeIds || nodeIds.length === 0) return '';
    return [...nodeIds].sort().join(',');
  }, [nodeIds]);

  useEffect(() => {
    // If no nodes selected, clear the groups
    if (!nodeIds || nodeIds.length === 0) {
      setGroupIds(new Set());
      setGroups([]);
      setError(null);
      return;
    }

    const fetchGroups = async () => {
      setLoading(true);
      setError(null);

      try {
        // OPTIMIZATION: Single batch request instead of O(n) individual requests
        const response = await fetch(`${API_BASE_URL}/api/v1/groups/nodes/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('keimenon_token')}`,
          },
          body: JSON.stringify({ nodeIds }),
        });

        if (!response.ok) {
          throw new Error(`Failed to batch fetch groups: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          const uniqueGroups: GroupInfo[] = data.groups || [];
          const uniqueGroupIds = new Set<string>(uniqueGroups.map((g) => g.id));

          setGroupIds(uniqueGroupIds);
          setGroups(uniqueGroups);
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err: any) {
        console.error('Node group lookup error:', err);
        setError(err.message || 'Failed to lookup groups');
        setGroupIds(new Set());
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce: wait 300ms for selection to stabilize before firing API call
    const timer = setTimeout(fetchGroups, 300);
    return () => clearTimeout(timer);
  }, [sortedNodeIds]); // Use memoized stable dependency

  return { groupIds, groups, loading, error };
}
