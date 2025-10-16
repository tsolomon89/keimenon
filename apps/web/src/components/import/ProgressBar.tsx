'use client';

import { Loader2 } from 'lucide-react';
import { UploadProgress } from '@/types/chat-import';

interface ProgressBarProps {
  progress: UploadProgress;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const getStageLabel = (stage: UploadProgress['stage']) => {
    switch (stage) {
      case 'uploading':
        return 'Uploading files...';
      case 'detecting':
        return 'Detecting platform...';
      case 'parsing':
        return 'Parsing conversations...';
      case 'analyzing':
        return 'Analyzing content...';
      case 'ready':
        return 'Ready for configuration';
      case 'error':
        return 'Error occurred';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {progress.stage !== 'ready' && progress.stage !== 'error' && (
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          )}
          <span className="font-medium">{getStageLabel(progress.stage)}</span>
        </div>
        <span className="text-slate-400">{Math.round(progress.percent)}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            progress.stage === 'error'
              ? 'bg-red-500'
              : progress.stage === 'ready'
              ? 'bg-green-500'
              : 'bg-purple-600'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {/* Message */}
      {progress.message && (
        <p className="text-xs text-slate-400">{progress.message}</p>
      )}
    </div>
  );
}
