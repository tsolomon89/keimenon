'use client';

import {
  CheckCircle2,
  Copy,
  GitMerge,
  AlertCircle,
  Calendar,
  MessageSquare,
  Hash,
} from 'lucide-react';
import { DuplicateCandidate, ReviewDecision } from '@/types/chat-import';

interface DuplicateActionsPanelProps {
  candidate: DuplicateCandidate;
  decision?: ReviewDecision;
  onDecision: (action: ReviewDecision['action']) => void;
}

export function DuplicateActionsPanel({
  candidate,
  decision,
  onDecision,
}: DuplicateActionsPanelProps) {
  const actions: Array<{
    action: ReviewDecision['action'];
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    {
      action: 'keep-primary',
      label: 'Keep Primary',
      description: 'Keep the primary message, discard duplicate',
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'blue',
    },
    {
      action: 'keep-duplicate',
      label: 'Keep Duplicate',
      description: 'Keep the duplicate message, discard primary',
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'orange',
    },
    {
      action: 'keep-both',
      label: 'Keep Both',
      description: 'Keep both messages as separate entries',
      icon: <Copy className="w-5 h-5" />,
      color: 'green',
    },
    {
      action: 'merge',
      label: 'Merge',
      description: 'Combine both messages into one',
      icon: <GitMerge className="w-5 h-5" />,
      color: 'purple',
    },
    {
      action: 'sequester',
      label: 'Sequester',
      description: 'Keep raw data but exclude duplicate from model scope',
      icon: <AlertCircle className="w-5 h-5" />,
      color: 'orange',
    },
  ];

  const getActionColorClasses = (color: string, isSelected: boolean) => {
    const baseClasses = 'transition-all duration-200';
    if (isSelected) {
      switch (color) {
        case 'blue':
          return `${baseClasses} bg-blue-600 border-blue-500 text-white`;
        case 'orange':
          return `${baseClasses} bg-orange-600 border-orange-500 text-white`;
        case 'green':
          return `${baseClasses} bg-green-600 border-green-500 text-white`;
        case 'purple':
          return `${baseClasses} bg-purple-600 border-purple-500 text-white`;
        default:
          return baseClasses;
      }
    }
    return `${baseClasses} bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Current status */}
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2 text-sm font-medium mb-2">
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <span>Decision Status</span>
        </div>
        {decision ? (
          <div className="text-sm text-green-400">
            ✓ {actions.find((a) => a.action === decision.action)?.label}
          </div>
        ) : (
          <div className="text-sm text-slate-400">Not yet reviewed</div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold mb-3">Choose Action</h3>
        {actions.map((action) => {
          const isSelected = decision?.action === action.action;

          return (
            <button
              key={action.action}
              onClick={() => onDecision(action.action)}
              className={`
                w-full p-3 rounded-lg border text-left
                ${getActionColorClasses(action.color, isSelected)}
              `}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{action.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-1">{action.label}</div>
                  <div className={`text-xs ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                    {action.description}
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Metadata comparison */}
      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-semibold mb-3">Metadata</h3>
        <div className="space-y-3 text-xs">
          {/* Conversation titles */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <MessageSquare className="w-3 h-3" />
              <span>Conversation</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span className="truncate">{candidate.primary.conversationTitle}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                <span className="truncate">{candidate.duplicate.conversationTitle}</span>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Calendar className="w-3 h-3" />
              <span>Date</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span>{new Date(candidate.primary.timestamp).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                <span>{new Date(candidate.duplicate.timestamp).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Character counts */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Hash className="w-3 h-3" />
              <span>Length</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                <span>{candidate.primary.charCount} chars</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                <span>{candidate.duplicate.charCount} chars</span>
              </div>
            </div>
          </div>

          {/* Length ratio */}
          <div className="pt-2 border-t border-slate-700">
            <div className="text-slate-400">
              Length ratio: {candidate.metrics.lengthRatio.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions hint */}
      <div className="pt-4 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          <div className="font-medium mb-1">Keyboard shortcuts:</div>
          <div className="space-y-0.5">
            <div>1 - Keep Primary</div>
            <div>2 - Keep Duplicate</div>
            <div>3 - Keep Both</div>
            <div>4 - Merge</div>
            <div>5 - Sequester</div>
          </div>
        </div>
      </div>
    </div>
  );
}
