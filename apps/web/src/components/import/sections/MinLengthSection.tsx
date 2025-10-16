'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { ChatImportConfig, AnalysisResult } from '@/types/chat-import';

interface MinLengthSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
  analysis?: AnalysisResult;
}

export function MinLengthSection({ config, onConfigChange, analysis }: MinLengthSectionProps) {
  const handleMinLengthChange = (value: number) => {
    onConfigChange({ ...config, minMessageLength: value });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Minimum Message Length</h3>

      <div className="flex items-center gap-4">
        <input
          type="number"
          min={0}
          value={config.minMessageLength}
          onChange={(e) => handleMinLengthChange(parseInt(e.target.value) || 0)}
          className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-purple-500 outline-none"
        />
        <span className="text-sm text-slate-400">characters</span>
      </div>

      <p className="text-xs text-slate-400">
        Messages shorter than this will be excluded from processing
      </p>

      {/* Live preview */}
      {analysis && (
        <div className="p-3 bg-slate-800/50 rounded-lg space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-green-400">
              {analysis.filteredMessageCount} messages will be included
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-red-400">
              {analysis.totalMessages - analysis.filteredMessageCount} messages will be excluded
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
