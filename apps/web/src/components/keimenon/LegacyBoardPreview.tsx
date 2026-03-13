'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { GraphNode, GraphEdge } from '@keimenon/graph';
import { Keimenon2D } from './Keimenon2D';
import { Loader2, Grid3x3 } from 'lucide-react';
import { API_BASE_URL } from '@/lib/env.config';

interface LegacyBoardPreviewProps {
  boardId?: string;
  height?: number;
}

interface ApiNode {
  id: string;
  kind: string;
}

interface ApiEdge {
  id: string;
  kind: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
}

export function LegacyBoardPreview({ boardId = 'default_board', height }: LegacyBoardPreviewProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const keimenonHeight = height ?? 520;

  const loadBoard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [nodesResponse, edgesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/nodes?limit=1000`),
        fetch(`${API_BASE_URL}/api/v1/edges?limit=5000`),
      ]);

      if (!nodesResponse.ok) {
        throw new Error(`Failed to fetch nodes (status ${nodesResponse.status})`);
      }

      if (!edgesResponse.ok) {
        throw new Error(`Failed to fetch edges (status ${edgesResponse.status})`);
      }

      const nodesData = await nodesResponse.json();
      const edgesData = await edgesResponse.json();

      const graphNodes: GraphNode[] = (nodesData.nodes as ApiNode[]).map((node) => ({
        id: node.id,
        kind: node.kind,
      }));
      const nodeIdSet = new Set(graphNodes.map((node) => node.id));

      const graphEdges: GraphEdge[] = ((edgesData.edges || []) as ApiEdge[])
        .map((edge) => {
          const source = edge.from || edge.source;
          const target = edge.to || edge.target;
          if (!source || !target) {
            return null;
          }

          return {
            id: edge.id,
            kind: edge.kind || 'CONTAINS',
            source,
            target,
          } as GraphEdge;
        })
        .filter((edge): edge is GraphEdge => !!edge)
        .filter((edge) => nodeIdSet.has(String(edge.source)) && nodeIdSet.has(String(edge.target)));

      setNodes(graphNodes);
      setEdges(graphEdges);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard, boardId]);

  const nodeCount = useMemo(() => nodes.length, [nodes]);

  return (
    <div className="flex-1 flex flex-col bg-slate-950/60 border border-slate-900 rounded-lg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-900 bg-slate-950/80">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Grid3x3 className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Legacy Board View</h3>
            <p className="text-xs text-slate-500">Board ID: {boardId}</p>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          {nodeCount} nodes - {edges.length} edges
        </div>
      </header>

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading legacy board data...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md text-center space-y-2">
              <p className="text-sm text-red-300 font-medium">Failed to load legacy board</p>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-500">No nodes available in the legacy dataset.</p>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <Keimenon2D
            nodes={nodes}
            edges={edges}
            width={typeof window !== 'undefined' ? window.innerWidth - 420 : 900}
            height={keimenonHeight}
            onSelectionChange={setSelectedNodeIds}
          />
        )}
      </div>

      <footer className="px-4 py-3 border-t border-slate-900 bg-slate-950/80 text-xs text-slate-500">
        {selectedNodeIds.length > 0 ? (
          <span>
            Selected nodes: <span className="text-slate-300">{selectedNodeIds.join(', ')}</span>
          </span>
        ) : (
          <span>Select nodes in the keimenon to inspect legacy graph relationships.</span>
        )}
      </footer>
    </div>
  );
}
