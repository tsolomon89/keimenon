'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';

interface DuplicateDetectionSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function DuplicateDetectionSection({
  config,
  onConfigChange,
}: DuplicateDetectionSectionProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateDedupe = (updates: Partial<ChatImportConfig['duplicateDetection']>) => {
    onConfigChange({
      ...config,
      duplicateDetection: { ...config.duplicateDetection, ...updates },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Similarity Grouping Review</h3>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
        >
          {showAdvanced ? (
            <>
              <ChevronDown className="w-3 h-3" />
              Hide Advanced
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3" />
              Show Advanced
            </>
          )}
        </button>
      </div>

      {/* Basic settings */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.duplicateDetection.enabled}
            onChange={(e) => updateDedupe({ enabled: e.target.checked })}
            className="rounded bg-slate-800 border-slate-700"
          />
          <span className="text-sm">Enable similarity conflict detection (non-destructive)</span>
        </label>

        {config.duplicateDetection.enabled && (
          <div className="ml-6 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.duplicateDetection.exactMatch}
                onChange={(e) => updateDedupe({ exactMatch: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700"
              />
              <span className="text-sm">Detect exact matches (hash-based)</span>
            </label>

            <div>
              <label className="block text-sm mb-2">Near-duplicate similarity threshold</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.duplicateDetection.similarityThreshold}
                  onChange={(e) =>
                    updateDedupe({ similarityThreshold: parseFloat(e.target.value) || 0 })
                  }
                  className="w-24 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-purple-500 outline-none"
                />
                <span className="text-sm text-slate-400">(0 = different, 1 = identical)</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Messages with similarity above this threshold will be flagged as similarity
                conflicts for review
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.duplicateDetection.crossConversation}
                onChange={(e) => updateDedupe({ crossConversation: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700"
              />
              <span className="text-sm">Compare similarity across different conversations</span>
            </label>
          </div>
        )}
      </div>

      {/* Advanced settings */}
      {showAdvanced && config.duplicateDetection.enabled && (
        <div className="ml-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm mb-2">Similarity algorithm</label>
            <select
              value={config.duplicateDetection.algorithm}
              onChange={(e) => updateDedupe({ algorithm: e.target.value as any })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-purple-500 outline-none"
            >
              <option value="jaccard">Jaccard (token overlap)</option>
              <option value="levenshtein">Levenshtein (edit distance)</option>
              <option value="cosine">Cosine similarity (Pro)</option>
              <option value="embedding">Embedding-based (Pro)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.duplicateDetection.normalizeTokens}
              onChange={(e) => updateDedupe({ normalizeTokens: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700"
            />
            <span className="text-sm">Normalize tokens (lowercase, remove punctuation)</span>
          </label>

          <div>
            <label className="block text-sm mb-2">Minimum token overlap count</label>
            <input
              type="number"
              min={1}
              value={config.duplicateDetection.minTokenOverlap}
              onChange={(e) => updateDedupe({ minTokenOverlap: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-purple-500 outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              Require at least this many shared tokens to consider a similarity conflict
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ignore when comparing:</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.duplicateDetection.ignoreWhitespace}
                onChange={(e) => updateDedupe({ ignoreWhitespace: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700"
              />
              <span className="text-sm">Whitespace differences</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.duplicateDetection.ignoreCase}
                onChange={(e) => updateDedupe({ ignoreCase: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700"
              />
              <span className="text-sm">Case differences</span>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-700 space-y-2">
            <p className="text-sm font-medium">Review options:</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.duplicateDetection.requireReview}
                onChange={(e) => updateDedupe({ requireReview: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700"
              />
              <span className="text-sm">Require manual review before applying changes</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
