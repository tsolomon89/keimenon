'use client';

import { CheckCircle, FileText } from 'lucide-react';
import { PlatformDetection } from '@/types/chat-import';

interface PlatformDetectionBadgeProps {
  detection: PlatformDetection;
}

export function PlatformDetectionBadge({ detection }: PlatformDetectionBadgeProps) {
  const getPlatformIcon = (_platform: string) => {
    // Could use specific icons per platform
    return <FileText className="w-5 h-5" />;
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case 'chatgpt':
        return 'ChatGPT';
      case 'claude':
        return 'Claude';
      case 'gemini':
        return 'Gemini';
      default:
        return 'Unknown Format';
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-500" />
        <div className="p-2 bg-purple-600/20 rounded">
          {getPlatformIcon(detection.platform)}
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">Detected: {getPlatformName(detection.platform)}</span>
          {detection.confidence < 1 && (
            <span className="text-xs text-slate-400">
              ({Math.round(detection.confidence * 100)}% confidence)
            </span>
          )}
        </div>
        <div className="text-sm text-slate-400 mt-1">
          {detection.conversationCount} conversations • {detection.messageCount} messages
        </div>
      </div>
    </div>
  );
}
