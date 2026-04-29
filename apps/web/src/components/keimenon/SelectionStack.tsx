'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  X,
  Link,
  Eye,
  EyeOff,
  Trash2,
  Pin,
  PinOff,
  Loader2,
  GitCompareArrows,
} from 'lucide-react';
import { KeimenonNode } from '@/store/keimenonStore';
import { getNodeLabel, type LabelableNode } from '@/lib/node-labels';
import { explainConnection } from '@/lib/api-client';

interface SelectionStackProps {
  selectedNodes: KeimenonNode[];
  onRemoveFromSelection: (nodeId: string) => void;
  onClearAll: () => void;
  onViewDetails: (node: KeimenonNode) => void;
  onAddToScope?: (nodeId: string) => void;
  onSequester?: (nodeId: string) => void;
}

export function SelectionStack({
  selectedNodes,
  onRemoveFromSelection,
  onClearAll,
  onViewDetails,
  onAddToScope,
  onSequester,
}: SelectionStackProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [pinnedCards, setPinnedCards] = useState<Set<string>>(new Set());
  const [connectionExplanation, setConnectionExplanation] = useState<{
    sharedPhrases?: Array<{ text?: string; phrase?: string; weight?: number }>;
    overlapScore?: number;
  } | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const toggleExpanded = (nodeId: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const togglePinned = (nodeId: string) => {
    setPinnedCards((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Sort nodes: pinned first, then by ID
  const sortedNodes = [...selectedNodes].sort((a, b) => {
    const aPinned = pinnedCards.has(a.id);
    const bPinned = pinnedCards.has(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return a.id.localeCompare(b.id);
  });

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'conversation':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'message':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'source':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'code':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const resolveNodeLabel = (node: KeimenonNode) =>
    getNodeLabel(
      {
        id: node.id,
        kind: node.kind || node.type,
        label: node.data?.label,
        ...(node.data?.metadata || {}),
      } as LabelableNode,
      40
    );

  return (
    <div className="h-full flex flex-col bg-slate-900/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">
            Selection Stack ({selectedNodes.length})
          </h3>
          <button
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Clear All
          </button>
        </div>
        <p className="text-xs text-slate-500">Selected items - click to expand details</p>
      </div>

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sortedNodes.map((node) => {
          const isExpanded = expandedCards.has(node.id);
          const isPinned = pinnedCards.has(node.id);

          return (
            <div
              key={node.id}
              className={`border rounded-lg transition-all ${
                isPinned
                  ? 'border-purple-500/50 bg-purple-500/5'
                  : 'border-slate-700 bg-slate-800/50'
              }`}
            >
              {/* Card header */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${getNodeTypeColor(
                          node.type
                        )}`}
                      >
                        {node.type}
                      </span>
                      {isPinned && <Pin className="w-3 h-3 text-purple-400" />}
                    </div>
                    <h4 className="text-sm font-medium text-slate-200 truncate">
                      {resolveNodeLabel(node)}
                    </h4>
                    <p className="text-xs text-slate-500 truncate">{node.id.slice(0, 16)}...</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => togglePinned(node.id)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-purple-400 transition-colors"
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => toggleExpanded(node.id)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveFromSelection(node.id)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                    {/* Metadata preview */}
                    {node.data.metadata && Object.keys(node.data.metadata).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-400">Metadata:</p>
                        <div className="text-xs text-slate-500 space-y-0.5">
                          {Object.entries(node.data.metadata)
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <div key={key} className="flex justify-between gap-2">
                                <span className="text-slate-400">{key}:</span>
                                <span className="truncate">
                                  {typeof value === 'object'
                                    ? JSON.stringify(value).slice(0, 20)
                                    : String(value).slice(0, 20)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="flex flex-wrap gap-1 pt-2">
                      <button
                        onClick={() => onViewDetails(node)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300"
                      >
                        <Eye className="w-3 h-3" />
                        Details
                      </button>
                      {onAddToScope && (
                        <button
                          onClick={() => onAddToScope(node.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300"
                        >
                          <Link className="w-3 h-3" />
                          Add to Scope
                        </button>
                      )}
                      {onSequester && (
                        <button
                          onClick={() => onSequester(node.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300"
                        >
                          <EyeOff className="w-3 h-3" />
                          Sequester
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection explanation panel */}
      {connectionExplanation && (
        <div className="p-4 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-300">Connection Explanation</h4>
            <button
              onClick={() => {
                setConnectionExplanation(null);
                setExplainError(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {connectionExplanation.sharedPhrases && connectionExplanation.sharedPhrases.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Shared Phrases</p>
              {connectionExplanation.sharedPhrases.slice(0, 8).map((phrase, i: number) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-300 truncate">
                    {phrase.text || phrase.phrase || '(unnamed)'}
                  </span>
                  {phrase.weight && (
                    <span className="text-purple-400/70 text-[10px]">
                      {phrase.weight.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No shared phrases found.</p>
          )}
          {connectionExplanation.overlapScore != null && (
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-slate-400">Overlap Score</span>
              <span className="text-purple-300 font-medium">
                {(connectionExplanation.overlapScore * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {explainError && (
        <div className="p-3 m-3 bg-red-600/10 border border-red-500/20 rounded">
          <p className="text-xs text-red-300">{explainError}</p>
        </div>
      )}

      {/* Footer with batch actions */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 mb-2">Batch Operations:</p>
        <div className="flex flex-wrap gap-2">
          {/* Explain Connection — only when exactly 2 nodes selected */}
          {selectedNodes.length === 2 && (
            <button
              onClick={async () => {
                setIsExplaining(true);
                setExplainError(null);
                setConnectionExplanation(null);
                try {
                  const resp = await explainConnection(selectedNodes[0].id, selectedNodes[1].id);
                  setConnectionExplanation(resp.explanation);
                } catch (err: any) {
                  setExplainError(err?.message || 'Failed to explain connection');
                } finally {
                  setIsExplaining(false);
                }
              }}
              disabled={isExplaining}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 rounded transition-colors text-cyan-400 disabled:opacity-50"
            >
              {isExplaining ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <GitCompareArrows className="w-3 h-3" />
              )}
              Explain Connection
            </button>
          )}
          {onAddToScope && (
            <button
              onClick={() => {
                selectedNodes.forEach((node) => onAddToScope(node.id));
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded transition-colors text-purple-400"
            >
              <Link className="w-3 h-3" />
              Add All to Scope
            </button>
          )}
          {onSequester && (
            <button
              onClick={() => {
                selectedNodes.forEach((node) => onSequester(node.id));
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded transition-colors text-slate-300"
            >
              <EyeOff className="w-3 h-3" />
              Sequester All
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
