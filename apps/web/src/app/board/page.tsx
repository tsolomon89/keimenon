'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FourRegionLayout } from '@keimenon/ui';
import { Keimenon2D } from '@/components/keimenon/Keimenon2D';
import { GraphNode, GraphEdge } from '@keimenon/graph';
import { Grid3x3, Zap } from 'lucide-react';
import { API_BASE_URL } from '@/lib/env.config';

function BoardContent() {
  const searchParams = useSearchParams();
  const boardId = searchParams.get('id');

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [keimenonSize, setKeimenonSize] = useState({ width: 1200, height: 800 });

  // Fetch board data
  useEffect(() => {
    fetchBoardData();
  }, [boardId]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const container = document.getElementById('keimenon-container');
      if (container) {
        setKeimenonSize({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function fetchBoardData() {
    try {
      setLoading(true);

      // Fetch nodes
      const nodesResponse = await fetch(`${API_BASE_URL}/api/v1/nodes?limit=1000`);

      if (!nodesResponse.ok) {
        throw new Error('Failed to fetch nodes');
      }

      const nodesData = await nodesResponse.json();

      // Transform to GraphNode format
      const graphNodes: GraphNode[] = nodesData.nodes.map((node: any) => ({
        id: node.id,
        kind: node.kind,
      }));

      setNodes(graphNodes);

      // TODO: Fetch edges from API endpoint
      // Related: apps/api/src/routes/edges.ts (needs implementation)
      // See: docs/features/GRAPH_EDGES.md
      setEdges([]);
    } catch (error) {
      console.error('Failed to load board:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleNodeClick = (node: GraphNode) => {
    console.log('Node clicked:', node);
  };

  const handleNodeDoubleClick = (node: GraphNode) => {
    console.log('Node double-clicked:', node);
  };

  const handleSelectionChange = (selectedIds: string[]) => {
    setSelectedNodeIds(selectedIds);
  };

  return (
    <FourRegionLayout
      header={
        <div className="h-full flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Grid3x3 className="w-6 h-6 text-purple-500" />
            <h1 className="text-xl font-semibold">Board: {boardId || 'Main'}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg text-sm">
              <span className="text-slate-400">Lens:</span>
              <span className="font-semibold">2D</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg text-sm">
              <Zap className="w-4 h-4 text-purple-500" />
              <span>{nodes.length} nodes</span>
            </div>
          </div>
        </div>
      }
      leftSidebar={
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-slate-400">Groups</h3>
            <p className="text-sm text-slate-500">No groups yet</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 text-slate-400">Filters</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked />
                Sources
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked />
                Groups
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked />
                Claims
              </label>
            </div>
          </div>
        </div>
      }
      rightSidebar={
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-slate-400">
              Selection ({selectedNodeIds.length})
            </h3>
            {selectedNodeIds.length === 0 ? (
              <p className="text-sm text-slate-500">Click nodes to select them</p>
            ) : (
              <div className="space-y-2">
                {selectedNodeIds.map((id) => {
                  const node = nodes.find((n) => n.id === id);
                  return (
                    <div key={id} className="p-2 bg-slate-800 rounded text-sm">
                      <p className="font-mono text-xs">{id}</p>
                      <p className="text-slate-400 text-xs">{node?.kind || 'Unknown'}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      }
    >
      <div id="keimenon-container" className="w-full h-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400">Loading board...</p>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4 max-w-md">
              <Grid3x3 className="w-16 h-16 text-slate-700 mx-auto" />
              <h2 className="text-2xl font-semibold text-slate-300">No nodes yet</h2>
              <p className="text-slate-400">Upload some files to get started</p>
              <a
                href="/ingest"
                className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
              >
                Ingest Files
              </a>
            </div>
          </div>
        ) : (
          <Keimenon2D
            nodes={nodes}
            edges={edges}
            width={keimenonSize.width}
            height={keimenonSize.height}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onSelectionChange={handleSelectionChange}
          />
        )}
      </div>
    </FourRegionLayout>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BoardContent />
    </Suspense>
  );
}
