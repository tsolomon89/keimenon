'use client';

import { PlatformDetection, UploadProgress } from '@/types/chat-import';
import { PlatformDetectionBadge } from './PlatformDetectionBadge';
import { ProgressBar } from './ProgressBar';

interface ImportStageProcessingProps {
  platformDetection: PlatformDetection | null;
  progress: UploadProgress;
}

export function ImportStageProcessing({
  platformDetection,
  progress,
}: ImportStageProcessingProps) {
  return (
    <div className="space-y-4">
      {platformDetection && <PlatformDetectionBadge detection={platformDetection} />}
      <ProgressBar progress={progress} />
    </div>
  );
}
