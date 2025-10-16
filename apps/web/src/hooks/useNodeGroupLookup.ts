import { useState, useEffect } from 'react';

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
 * Used for Canvas ↔ Navigation bidirectional sync
 *
 * @param nodeIds Array of node IDs to look up
 * @returns Set of group IDs that contain any of the given nodes
 */
export function useNodeGroupLookup(nodeIds: string[]): NodeGroupLookupResult {
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Fetch groups for each node in parallel
        const promises = nodeIds.map(async (nodeId) => {
          const response = await fetch(`/api/v1/groups/nodes/${nodeId}/groups`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('canvas_memory_token')}`,
            },
          });

          if (!response.ok) {
            if (response.status === 404) {
              // Node might not be in any group, that's okay
              return [];
            }
            throw new Error(`Failed to fetch groups for node ${nodeId}`);
          }

          const data = await response.json();
          return data.groups || [];
        });

        const results = await Promise.all(promises);

        // Flatten and deduplicate groups
        const allGroups = results.flat();
        const uniqueGroupMap = new Map<string, GroupInfo>();

        for (const group of allGroups) {
          if (!uniqueGroupMap.has(group.id)) {
            uniqueGroupMap.set(group.id, group);
          }
        }

        const uniqueGroups = Array.from(uniqueGroupMap.values());
        const uniqueGroupIds = new Set(uniqueGroups.map(g => g.id));

        setGroupIds(uniqueGroupIds);
        setGroups(uniqueGroups);
      } catch (err: any) {
        console.error('Node group lookup error:', err);
        setError(err.message || 'Failed to lookup groups');
        setGroupIds(new Set());
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [JSON.stringify(nodeIds.sort())]); // Stable dependency on sorted IDs

  return { groupIds, groups, loading, error };
}
