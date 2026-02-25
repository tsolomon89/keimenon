'use client';

import React from 'react';
import { Network, Trash2, GitMerge, FolderPlus } from 'lucide-react';
import { cn } from '@keimenon/ui';

interface BatchActionsToolbarProps {
  selectedCount: number;
  onAction: (action: 'merge' | 'delete' | 'group' | 'export') => void;
  className?: string;
}

export function BatchActionsToolbar({ selectedCount, onAction, className }: BatchActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      "absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-full shadow-xl px-4 py-2 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4",
      className
    )}>
      <div className="text-sm font-semibold text-slate-200 border-r border-slate-700 pr-4">
        {selectedCount} selected
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onAction('group')}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors tooltip"
          title="Group Selected"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction('merge')}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors tooltip"
          title="Merge Nodes"
        >
          <GitMerge className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction('delete')}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-full transition-colors tooltip"
          title="Delete Selected"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
