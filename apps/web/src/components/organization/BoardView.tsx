'use client';

import React, { useState } from 'react';
import { BoardNode, AnyNode } from '@keimenon/types';
import { cn } from '@keimenon/ui';
import { MoreHorizontal, Plus } from 'lucide-react';

interface BoardViewProps {
  board: BoardNode;
  nodes: AnyNode[]; // Nodes belonging to this board
  onMoveNode: (nodeId: string, columnId: string) => void;
  onAddColumn?: () => void;
}

export function BoardView({ board, nodes, onMoveNode, onAddColumn }: BoardViewProps) {
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // Group nodes by column (naive implementation for POC)
  // In a real app, nodes would have a 'board_column_id' or we'd map them here
  const nodesByColumn = board.columns.reduce((acc, col) => {
    acc[col.id] = nodes.filter(n => (n.metadata as any)?.columnId === col.id);
    return acc;
  }, {} as Record<string, AnyNode[]>);

  // Handle unassigned nodes (bucket)
  const unassignedNodes = nodes.filter(n => !(n.metadata as any)?.columnId);

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('nodeId', nodeId);
    setDraggedNode(nodeId);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('nodeId');
    if (nodeId) {
      onMoveNode(nodeId, columnId);
    }
    setDraggedNode(null);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Board Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">{board.name}</h1>
          <p className="text-sm text-slate-500">{board.description || 'No description'}</p>
        </div>
        <div className="flex gap-2">
            <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                {board.view_mode.toUpperCase()}
            </span>
        </div>
      </div>

      {/* Kanban Canvas */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-6">
        {board.columns.map(col => (
          <div 
            key={col.id}
            className="w-80 flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur rounded-t-xl z-10">
              <h3 className="font-semibold text-slate-200">{col.title}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{nodesByColumn[col.id]?.length || 0}</span>
                <button className="text-slate-500 hover:text-white"><MoreHorizontal className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Column Content */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
              {nodesByColumn[col.id]?.map(node => (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.id)}
                  className={cn(
                    "p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-sm cursor-grab hover:border-slate-500 transition-colors",
                    draggedNode === node.id && "opacity-50"
                  )}
                >
                  <div className="text-sm font-medium text-slate-200 line-clamp-2">{(node as any).title || (node as any).name || node.id}</div>
                  <div className="text-xs text-slate-500 mt-2 flex justify-between">
                     <span>{node.kind}</span>
                     {/* <span>{new Date(node.created_at).toLocaleDateString()}</span> */}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {/* Add Column Button */}
        {onAddColumn && (
            <button 
                onClick={onAddColumn}
                className="w-80 flex-shrink-0 h-[100px] border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-500 hover:text-white hover:border-slate-600 transition-colors"
            >
                <Plus className="w-6 h-6 mb-2" />
                <span>Add Column</span>
            </button>
        )}
      </div>
    </div>
  );
}
