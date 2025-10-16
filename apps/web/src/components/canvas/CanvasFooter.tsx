'use client';

import { Terminal, Activity, Clock, Keyboard } from 'lucide-react';

interface CanvasFooterProps {
  isOpen: boolean;
}

export function CanvasFooter({ isOpen }: CanvasFooterProps) {
  if (!isOpen) {
    return (
      <div className="h-8 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm flex items-center justify-between px-4 text-xs">
        <div className="flex items-center gap-4 text-slate-500">
          <span>Ready</span>
          <span>•</span>
          <span>0 nodes, 0 edges</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500">Press ` to open console</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm flex flex-col">
      {/* Tabs */}
      <div className="h-10 border-b border-slate-800 flex items-center gap-1 px-2">
        <button className="px-3 py-1.5 bg-slate-800 rounded text-sm flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Console
        </button>
        <button className="px-3 py-1.5 hover:bg-slate-800/50 rounded text-sm text-slate-400 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Tasks
          <span className="px-1.5 py-0.5 bg-purple-600/20 border border-purple-500/30 rounded text-xs">
            0
          </span>
        </button>
        <button className="px-3 py-1.5 hover:bg-slate-800/50 rounded text-sm text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Logs
        </button>
        <button className="px-3 py-1.5 hover:bg-slate-800/50 rounded text-sm text-slate-400 flex items-center gap-2">
          <Keyboard className="w-4 h-4" />
          Shortcuts
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2">
        <div className="text-slate-500">
          <span className="text-purple-400">canvas-memory</span>
          <span className="text-slate-600"> $ </span>
          <span className="text-slate-400">Welcome to Canvas Memory OS Console</span>
        </div>
        <div className="text-slate-500">
          <span className="text-slate-600">Type </span>
          <span className="text-purple-400">help</span>
          <span className="text-slate-600"> for available commands</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-purple-400">canvas-memory</span>
          <span className="text-slate-600">$</span>
          <input
            type="text"
            className="flex-1 bg-transparent outline-none text-white"
            placeholder="Enter command..."
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
