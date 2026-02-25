'use client';

import { Pause, Play } from 'lucide-react';
import { PlatformDetection, UploadProgress } from '@/types/chat-import';
import { PlatformDetectionBadge } from './PlatformDetectionBadge';
import { ProgressBar } from './ProgressBar';

interface ImportStageProcessingProps {
  platformDetection: PlatformDetection | null;
  progress: UploadProgress;
  onPause?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
}

export function ImportStageProcessing({
  platformDetection,
  progress,
  onPause,
  onResume,
  isPaused,
}: ImportStageProcessingProps) {
  const showControls = progress.stage === 'uploading' && (onPause || onResume);

  return (
    <div className="space-y-4">
      {platformDetection && <PlatformDetectionBadge detection={platformDetection} />}
      <ProgressBar progress={progress} />
      
      {showControls && (
        <div className="flex justify-center gap-2 mt-2">
          {!isPaused ? (
            <button
              onClick={onPause}
              disabled={!onPause}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause Upload
            </button>
          ) : (
             <button
              onClick={onResume}
              disabled={!onResume}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-md transition-colors"
            >
              <Play className="w-4 h-4" />
              Resume Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
