'use client';

import { Info } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';

interface BranchesSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function BranchesSection({ config, onConfigChange }: BranchesSectionProps) {
  const handleBranchChange = (branches: 'merged' | 'separate') => {
    onConfigChange({ ...config, branches });
  };

  const showSeparateWarning =
    config.extraction.includeUser &&
    config.extraction.includeAssistant &&
    config.branches === 'separate';

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Branches</h3>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleBranchChange('merged')}
          className={`p-3 rounded-lg border text-left transition-all ${
            config.branches === 'merged'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="font-medium text-sm">Merged</div>
          <div className="text-xs text-slate-400 mt-1">
            Combine user + AI in same files
          </div>
        </button>

        <button
          onClick={() => handleBranchChange('separate')}
          className={`p-3 rounded-lg border text-left transition-all ${
            config.branches === 'separate'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="font-medium text-sm">Separate</div>
          <div className="text-xs text-slate-400 mt-1">
            Create separate files for user/AI
          </div>
        </button>
      </div>

      {showSeparateWarning && (
        <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg">
          <div className="flex gap-2">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              Separate mode will create 2 source sets per conversation (one for user, one for AI)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
