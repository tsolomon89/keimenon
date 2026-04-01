'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BoardView } from './BoardView';
import { BoardNode, AnyNode } from '@keimenon/types';
import { organizationService } from '@/services/organization-service';
import { api } from '@/lib/api-client';
import { Loader2, Plus } from 'lucide-react';
import { Keimenon2D } from '../keimenon/Keimenon2D';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import type { NdProjectionConfig, RenderLens } from '@/lib/nd-projection';
import { useElementSize } from '@/hooks/useElementSize';

interface BoardGraphEdge {
  id?: string;
  kind?: string;
  from?: string;
  to?: string;
  source?: string;
  target?: string;
}

interface BoardViewContainerProps {
  renderLens?: RenderLens;
  ndConfig?: NdProjectionConfig;
}

export function BoardViewContainer({ renderLens = '2d', ndConfig }: BoardViewContainerProps) {
  const galaxyRef = useRef<HTMLDivElement>(null);
  const galaxySize = useElementSize(galaxyRef);
  const [boards, setBoards] = useState<BoardNode[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardNodes, setBoardNodes] = useState<AnyNode[]>([]);
  const [boardEdges, setBoardEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'galaxy'>('kanban');

  useEffect(() => {
    const fetchBoards = async () => {
      try {
        setIsLoading(true);
        const fetchedBoards = await organizationService.getBoards();
        setBoards(fetchedBoards);
        if (fetchedBoards.length > 0) {
          setSelectedBoardId(fetchedBoards[0].id);
        }
      } catch (err: any) {
        console.error('Failed to fetch boards:', err);
        setError(err.message || 'Failed to load boards');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBoards();
  }, []);

  useEffect(() => {
    if (!selectedBoardId) {
      return;
    }

    const fetchBoardGraph = async () => {
      try {
        const graphData = await organizationService.getBoardGraph(selectedBoardId);
        const nodes = graphData.nodes as AnyNode[];
        setBoardNodes(nodes);

        const nodeIds = new Set(nodes.map((node) => node.id));
        const normalizedEdges: GraphEdge[] = (graphData.edges || [])
          .map((edge: BoardGraphEdge, index: number) => {
            const source = edge.from || edge.source;
            const target = edge.to || edge.target;
            if (!source || !target) {
              return null;
            }

            return {
              id: edge.id || `board_edge_${index}`,
              kind: edge.kind || 'CONTAINS',
              source,
              target,
            } as GraphEdge;
          })
          .filter((edge): edge is GraphEdge => !!edge)
          .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)));

        setBoardEdges(normalizedEdges);
      } catch (err: any) {
        console.error('Failed to fetch board graph:', err);
      }
    };

    fetchBoardGraph();
  }, [selectedBoardId]);

  const handleCreateBoard = async () => {
    try {
      const newBoard = await organizationService.createBoard('New Board', 'Created via Board View');
      setBoards((prev) => [newBoard, ...prev]);
      setSelectedBoardId(newBoard.id);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const activeBoard = boards.find((board) => board.id === selectedBoardId);

  const handleMoveNode = async (nodeId: string, columnId: string) => {
    setBoardNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          metadata: {
            ...(node as any).metadata,
            board_column: columnId,
          },
        };
      })
    );

    const currentNode = boardNodes.find((node) => node.id === nodeId) as any;

    try {
      await api.put(`/nodes/${nodeId}`, {
        metadata: {
          ...(currentNode?.metadata || {}),
          board_column: columnId,
        },
      });
    } catch (err) {
      console.error('Failed to persist board node move:', err);
    }
  };

  const galaxyNodes = useMemo(() => {
    return boardNodes.map((node) => {
      const n = node as any;
      return {
        id: n.id,
        kind: n.kind || 'Source',
        x: typeof n.x === 'number' ? n.x : undefined,
        y: typeof n.y === 'number' ? n.y : undefined,
      } as GraphNode;
    });
  }, [boardNodes]);

  if (isLoading && boards.length === 0) {
    return (
      <div className="h-full w-full bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading boards...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-red-400">
        <p>Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="h-full w-full bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <p className="mb-4">No boards found.</p>
        <button
          onClick={handleCreateBoard}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create First Board
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-950 flex flex-col">
      <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/50">
        <select
          value={selectedBoardId || ''}
          onChange={(e) => setSelectedBoardId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleCreateBoard}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          title="Create New Board"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="h-6 w-px bg-slate-800 mx-2" />

        <div className="flex bg-slate-800 rounded p-0.5">
          <button
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              viewMode === 'kanban'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setViewMode('galaxy')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              viewMode === 'galaxy'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Galaxy
          </button>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-slate-500">
          {boardNodes.length} items - {boardEdges.length} edges
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeBoard ? (
          viewMode === 'kanban' ? (
            <BoardView board={activeBoard} nodes={boardNodes} onMoveNode={handleMoveNode} />
          ) : (
            <div ref={galaxyRef} className="h-full w-full">
              <Keimenon2D
                nodes={galaxyNodes}
                edges={boardEdges}
                width={galaxySize.width || 1200}
                height={galaxySize.height || 800}
                renderLens={renderLens}
                ndConfig={ndConfig}
              />
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            Select a board
          </div>
        )}
      </div>
    </div>
  );
}
