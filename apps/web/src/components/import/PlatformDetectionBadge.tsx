'use client';

import { CheckCircle, FileText } from 'lucide-react';
import { PlatformDetection } from '@/types/chat-import';

export interface RuntimeProcessingStats {
  conversationsProcessed?: number;
  messagesProcessed?: number;
  nodesCreated?: number;
  edgesCreated?: number;
  sourcesCreated?: number;
}

interface PlatformDetectionBadgeProps {
  detection: PlatformDetection;
  runtimeStats?: RuntimeProcessingStats | null;
}

export function PlatformDetectionBadge({ detection, runtimeStats }: PlatformDetectionBadgeProps) {
  const getPlatformIcon = (_platform: string) => {
    // Could use specific icons per platform.
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

  const conversationsProcessed = runtimeStats?.conversationsProcessed ?? 0;
  const messagesProcessed = runtimeStats?.messagesProcessed ?? 0;
  const nodesCreated = runtimeStats?.nodesCreated ?? 0;
  const edgesCreated = runtimeStats?.edgesCreated ?? 0;
  const hasRuntimeCounters =
    conversationsProcessed > 0 || messagesProcessed > 0 || nodesCreated > 0 || edgesCreated > 0;

  return (
    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-5 h-5 text-green-500" />
        <div className="p-2 bg-purple-600/20 rounded">{getPlatformIcon(detection.platform)}</div>
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
        <div className="text-sm text-slate-300 mt-1">
          {hasRuntimeCounters ? (
            <>
              Processed: {conversationsProcessed.toLocaleString()} conversations
              {messagesProcessed > 0
                ? ` | ${messagesProcessed.toLocaleString()} messages`
                : ` | ${nodesCreated.toLocaleString()} nodes | ${edgesCreated.toLocaleString()} edges`}
            </>
          ) : (
            <>
              Estimated: {detection.conversationCount.toLocaleString()} conversations |{' '}
              {detection.messageCount.toLocaleString()} messages
            </>
          )}
        </div>
        {hasRuntimeCounters && (
          <div className="text-xs text-slate-500 mt-1">
            Estimated scan: {detection.conversationCount.toLocaleString()} conversations |{' '}
            {detection.messageCount.toLocaleString()} messages
          </div>
        )}
      </div>
    </div>
  );
}
