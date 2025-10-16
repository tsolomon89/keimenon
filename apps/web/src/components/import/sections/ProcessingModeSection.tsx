'use client';

import { Sparkles, Settings } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';

interface ProcessingModeSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function ProcessingModeSection({ config, onConfigChange }: ProcessingModeSectionProps) {
  const handleModeChange = (mode: 'automatic' | 'manual') => {
    onConfigChange({ ...config, processingMode: mode });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Processing</h3>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleModeChange('automatic')}
          className={`p-3 rounded-lg border text-left transition-all ${
            config.processingMode === 'automatic'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="font-medium text-sm">Automatic</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            AI-powered grouping (Pro)
          </div>
        </button>

        <button
          onClick={() => handleModeChange('manual')}
          className={`p-3 rounded-lg border text-left transition-all ${
            config.processingMode === 'manual'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span className="font-medium text-sm">Manual</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Define groups with keywords
          </div>
        </button>
      </div>
    </div>
  );
}
