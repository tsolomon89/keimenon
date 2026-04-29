'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  getTopicSuggestions,
  promoteTopic,
  rejectTopic,
  type TopicSuggestion,
} from '@/lib/api-client';
import { useKeimenonStore } from '@/store/keimenonStore';

/**
 * TopicInboxPanel — Review and curate machine-suggested topics.
 *
 * Lists topics in 'suggested' status with inline promote/reject actions.
 * Promoting a topic makes it visible and traversal-eligible.
 * Rejecting a topic hides it without destroying underlying phrase data.
 */
export function TopicInboxPanel() {
  const [topics, setTopics] = useState<TopicSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Set<string>>(new Set());

  const selectNode = useKeimenonStore((s) => s.selectNode);
  const openDetailPanel = useKeimenonStore((s) => s.openDetailPanel);
  const nodes = useKeimenonStore((s) => s.nodes);

  const loadTopics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getTopicSuggestions(50);
      setTopics(response.suggestions);
    } catch (err: any) {
      setError(err?.message || 'Failed to load topic suggestions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const handlePromote = async (topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionInProgress((prev) => new Set(prev).add(topicId));

    try {
      await promoteTopic(topicId);
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, topicStatus: 'promoted' as const } : t))
      );
    } catch (err: any) {
      console.error('[TopicInbox] Promote failed:', err);
    } finally {
      setActionInProgress((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  };

  const handleReject = async (topicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionInProgress((prev) => new Set(prev).add(topicId));

    try {
      await rejectTopic(topicId);
      setTopics((prev) =>
        prev.map((t) => (t.id === topicId ? { ...t, topicStatus: 'rejected' as const } : t))
      );
    } catch (err: any) {
      console.error('[TopicInbox] Reject failed:', err);
    } finally {
      setActionInProgress((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  };

  const handleTopicClick = (topic: TopicSuggestion) => {
    const node = nodes.find((n) => n.id === topic.id);
    if (node) {
      selectNode(topic.id, false);
      openDetailPanel(node);
    }
  };

  const suggestedTopics = topics.filter((t) => t.topicStatus === 'suggested');
  const promotedTopics = topics.filter((t) => t.topicStatus === 'promoted');
  const rejectedTopics = topics.filter((t) => t.topicStatus === 'rejected');

  const strengthColor = (strength: number | undefined) => {
    if (!strength) return 'bg-slate-600';
    if (strength >= 0.7) return 'bg-emerald-500';
    if (strength >= 0.4) return 'bg-amber-500';
    return 'bg-slate-500';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-sm font-medium text-slate-300">Topic Inbox</span>
          {suggestedTopics.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-full">
              {suggestedTopics.length}
            </span>
          )}
        </div>
        <button
          onClick={loadTopics}
          disabled={isLoading}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && topics.length === 0 && (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Loading topics…</span>
          </div>
        )}

        {error && (
          <div className="p-3 m-3 bg-red-600/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {!isLoading && !error && topics.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No topic suggestions</p>
            <p className="text-xs mt-1 text-slate-600">Import data to generate topics</p>
          </div>
        )}

        {/* Pending review */}
        {suggestedTopics.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-slate-800/30">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Pending Review ({suggestedTopics.length})
              </span>
            </div>
            {suggestedTopics.map((topic) => (
              <TopicRow
                key={topic.id}
                topic={topic}
                isActioning={actionInProgress.has(topic.id)}
                strengthColor={strengthColor}
                onPromote={handlePromote}
                onReject={handleReject}
                onClick={handleTopicClick}
              />
            ))}
          </div>
        )}

        {/* Promoted */}
        {promotedTopics.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-slate-800/30">
              <span className="text-[10px] uppercase tracking-wider text-emerald-500/70 font-medium">
                Promoted ({promotedTopics.length})
              </span>
            </div>
            {promotedTopics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicClick(topic)}
                className="w-full text-left px-3 py-2 border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors group flex items-center gap-2"
              >
                <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="text-xs text-slate-300 flex-1 truncate">{topic.name}</span>
                <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Rejected */}
        {rejectedTopics.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-slate-800/30">
              <span className="text-[10px] uppercase tracking-wider text-slate-600 font-medium">
                Rejected ({rejectedTopics.length})
              </span>
            </div>
            {rejectedTopics.map((topic) => (
              <div
                key={topic.id}
                className="px-3 py-2 border-b border-slate-800/30 flex items-center gap-2 opacity-50"
              >
                <XCircle className="w-3 h-3 text-slate-600 shrink-0" />
                <span className="text-xs text-slate-500 flex-1 truncate line-through">
                  {topic.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TopicRow({
  topic,
  isActioning,
  strengthColor,
  onPromote,
  onReject,
  onClick,
}: {
  topic: TopicSuggestion;
  isActioning: boolean;
  strengthColor: (s: number | undefined) => string;
  onPromote: (id: string, e: React.MouseEvent) => void;
  onReject: (id: string, e: React.MouseEvent) => void;
  onClick: (topic: TopicSuggestion) => void;
}) {
  const strengthPct = Math.round((topic.strength || 0) * 100);

  return (
    <button
      onClick={() => onClick(topic)}
      disabled={isActioning}
      className="w-full text-left px-3 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group"
    >
      <div className="flex items-start gap-2">
        {/* Strength dot */}
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${strengthColor(topic.strength)}`} />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">{topic.name}</p>

          {topic.description && (
            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{topic.description}</p>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-slate-500">{strengthPct}% coherence</span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500">{topic.phraseCount} phrases</span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500">{topic.edgeCount} edges</span>
          </div>

          {/* Keywords */}
          {topic.keywords && topic.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topic.keywords.slice(0, 4).map((kw, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-slate-700/50 text-[10px] text-slate-400 rounded"
                >
                  {kw}
                </span>
              ))}
              {topic.keywords.length > 4 && (
                <span className="text-[10px] text-slate-600">+{topic.keywords.length - 4}</span>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {isActioning ? (
            <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          ) : (
            <>
              <button
                onClick={(e) => onPromote(topic.id, e)}
                className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-600/10 rounded transition-colors"
                title="Promote topic"
              >
                <CheckCircle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => onReject(topic.id, e)}
                className="p-1 text-red-500 hover:text-red-400 hover:bg-red-600/10 rounded transition-colors"
                title="Reject topic"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
