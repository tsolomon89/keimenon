'use client';

import { useMemo } from 'react';
import { Columns, List, Calendar, MessageSquare, Hash } from 'lucide-react';
import { DuplicateCandidate } from '@/types/chat-import';

interface DuplicateComparisonViewProps {
  candidate: DuplicateCandidate;
  viewMode: 'side-by-side' | 'unified';
  onViewModeChange: (mode: 'side-by-side' | 'unified') => void;
}

export function DuplicateComparisonView({
  candidate,
  viewMode,
  onViewModeChange,
}: DuplicateComparisonViewProps) {
  const mergePreview = useMemo(() => {
    const toLines = (value: string) =>
      value
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    const primaryLines = toLines(candidate.primary.content);
    const duplicateLines = toLines(candidate.duplicate.content);
    const primaryIndex = new Set(primaryLines.map(normalize));

    const merged: string[] = [];
    const seen = new Set<string>();
    const appendUnique = (line: string) => {
      const key = normalize(line);
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(line);
    };

    primaryLines.forEach(appendUnique);
    duplicateLines.forEach(appendUnique);

    const overlapCount = duplicateLines.reduce(
      (count, line) => (primaryIndex.has(normalize(line)) ? count + 1 : count),
      0
    );

    return {
      text: merged.join('\n'),
      overlapCount,
      totalPrimary: primaryLines.length,
      totalDuplicate: duplicateLines.length,
    };
  }, [candidate.duplicate.content, candidate.primary.content]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getDiffHighlight = (text: string, isNew: boolean) => {
    return (
      <div
        className={`p-4 rounded-lg font-mono text-sm whitespace-pre-wrap ${
          isNew
            ? 'bg-green-900/20 border-l-4 border-green-500'
            : 'bg-red-900/20 border-l-4 border-red-500'
        }`}
      >
        {text}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-700 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Content Comparison</h3>

          {/* View mode toggle */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => onViewModeChange('side-by-side')}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors
                ${viewMode === 'side-by-side' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-300'}
              `}
            >
              <Columns className="w-3.5 h-3.5" />
              Side by Side
            </button>
            <button
              onClick={() => onViewModeChange('unified')}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors
                ${viewMode === 'unified' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-300'}
              `}
            >
              <List className="w-3.5 h-3.5" />
              Unified
            </button>
          </div>
        </div>

        {/* Similarity metrics */}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            <span>Similarity: {Math.round(candidate.similarity * 100)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Token overlap: {candidate.metrics.tokenOverlap}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" />
            <span>Edit distance: {candidate.metrics.editDistance}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4 p-3 rounded-lg border border-slate-700 bg-slate-900/60">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-200">Merge Preview Assistance</h4>
            <span className="text-[11px] text-slate-400">
              overlap {mergePreview.overlapCount}/{mergePreview.totalDuplicate} duplicate lines
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Preview-only helper. Apply remains a single job-scoped decision action.
          </p>
          <pre className="max-h-40 overflow-auto text-xs whitespace-pre-wrap font-mono bg-slate-950/80 rounded p-2 border border-slate-800">
            {mergePreview.text || candidate.primary.content}
          </pre>
        </div>

        {viewMode === 'side-by-side' ? (
          // Side-by-side view
          <div className="grid grid-cols-2 gap-4 h-full">
            {/* Primary */}
            <div className="space-y-3">
              <div className="sticky top-0 bg-slate-900 pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <h4 className="text-sm font-semibold">Primary</h4>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" />
                    <span className="truncate">{candidate.primary.conversationTitle}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(candidate.primary.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3" />
                    <span>{candidate.primary.charCount} characters</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {candidate.primary.content}
                </pre>
              </div>
            </div>

            {/* Duplicate */}
            <div className="space-y-3">
              <div className="sticky top-0 bg-slate-900 pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <h4 className="text-sm font-semibold">Duplicate</h4>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" />
                    <span className="truncate">{candidate.duplicate.conversationTitle}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(candidate.duplicate.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3" />
                    <span>{candidate.duplicate.charCount} characters</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {candidate.duplicate.content}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          // Unified diff view
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <h4 className="text-sm font-semibold">
                  Primary ({candidate.primary.conversationTitle})
                </h4>
              </div>
              {getDiffHighlight(candidate.primary.content, false)}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <h4 className="text-sm font-semibold">
                  Duplicate ({candidate.duplicate.conversationTitle})
                </h4>
              </div>
              {getDiffHighlight(candidate.duplicate.content, true)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
