'use client';

import React, { useEffect, useState } from 'react';
import { BoardView } from './BoardView';
import { BoardNode, AnyNode } from '@keimenon/types';
import { organizationService } from '@/services/organization-service';
import { Loader2, Plus } from 'lucide-react';
import { Keimenon2D } from '../keimenon/Keimenon2D';

export function BoardViewContainer() {
  const [boards, setBoards] = useState<BoardNode[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boardNodes, setBoardNodes] = useState<AnyNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch of boards
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

  // Fetch board details when selection changes
  useEffect(() => {
    if (!selectedBoardId) return;

    const fetchBoardGraph = async () => {
      try {
        // We use the graph endpoint to get all nodes associated with this board
        const graphData = await organizationService.getBoardGraph(selectedBoardId);
        // Cast to AnyNode[] - backend returns objects that match our node shapes
        setBoardNodes(graphData.nodes as AnyNode[]);
      } catch (err: any) {
        console.error('Failed to fetch board graph:', err);
      }
    };
    fetchBoardGraph();
  }, [selectedBoardId]);

  const handleCreateBoard = async () => {
    try {
      const newBoard = await organizationService.createBoard('New Board', 'Created via Board View');
      setBoards(prev => [newBoard, ...prev]);
      setSelectedBoardId(newBoard.id);
    } catch (err) {
      console.error('Failed to create board:', err);
    }
  };

  const activeBoard = boards.find(b => b.id === selectedBoardId);

  const handleMoveNode = async (nodeId: string, columnId: string) => {
     // Optimistic update
     setBoardNodes(prev => prev.map(n => {
       if (n.id === nodeId) {
         return { ...n, metadata: { ...n.metadata, board_column: columnId } };
       }
       return n;
     }));

     // TODO: Call API to persist move
     // await organizationService.updateNodeMetadata(nodeId, { board_column: columnId });
  };

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

  const [viewMode, setViewMode] = useState<'kanban' | 'galaxy'>('kanban');

  // ... (existing code)

  return (
    <div className="h-full w-full bg-slate-950 flex flex-col">
      {/* Board Selector / Header */}
      <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-4 bg-slate-900/50">
        <select 
          value={selectedBoardId || ''} 
          onChange={(e) => setSelectedBoardId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {boards.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
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
            className={`px-3 py-1 text-xs rounded transition-colors ${viewMode === 'kanban' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setViewMode('galaxy')}
            className={`px-3 py-1 text-xs rounded transition-colors ${viewMode === 'galaxy' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Galaxy
          </button>
        </div>

        <div className="flex-1" />
        <div className="text-xs text-slate-500">
          {boardNodes.length} items
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeBoard ? (
          viewMode === 'kanban' ? (
            <BoardView 
              board={activeBoard}
              nodes={boardNodes}
              onMoveNode={handleMoveNode}
            />
          ) : (
            <div className="h-full w-full">
               {/* Galaxy View */}
               <Keimenon2D
                 nodes={boardNodes.map(n => ({ 
                   ...n, 
                   x: Math.random() * 800, // Placeholder layout
                   y: Math.random() * 600, 
                   neighbors: [] 
                 })) as any} // Cast needed until GraphNode types are fully aligned
                 edges={[]} // Edges would come from graphData in a real scenario
                 width={1200} // Should be dynamic
                 height={800} // Should be dynamic
                 onNodeClick={(node: any) => console.log('Clicked', node)}
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
