import React, { useEffect, useState } from 'react';
import {
  Loader2,
  ArrowLeft,
  BookOpen,
  Folder,
  Database,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  organizationService,
  ConversationThread,
  ConversationContextPack,
} from '../../services/organization-service';

interface ConversationSynthesisViewProps {
  conversation: ConversationThread;
  onBack: () => void;
  onLaunchRuntime?: () => void;
  className?: string;
}

export function ConversationSynthesisView({
  conversation,
  onBack,
  onLaunchRuntime,
  className = '',
}: ConversationSynthesisViewProps) {
  const [contextPack, setContextPack] = useState<ConversationContextPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchContextPack() {
      try {
        setLoading(true);
        setError(null);
        const pack = await organizationService.getConversationContextPack(conversation.id);
        if (isMounted) {
          setContextPack(pack);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load context pack');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchContextPack();

    return () => {
      isMounted = false;
    };
  }, [conversation.id]);

  return (
    <div className={`flex flex-col h-full bg-slate-900 text-slate-200 ${className}`}>
      {/* Header */}
      <div className="flex-none flex items-center p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <button
          onClick={onBack}
          className="p-2 mr-3 rounded-md hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-white truncate">
            {conversation.title || 'Untitled Conversation'}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 text-blue-400" />
              {conversation.purpose}
            </span>
            <span>&bull;</span>
            <span className="truncate opacity-75 text-slate-500 font-mono">
              ID: {conversation.id}
            </span>
          </div>
        </div>
        {onLaunchRuntime && (
          <button
            onClick={onLaunchRuntime}
            className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Launch Runtime
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Welcome / Description */}
          <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-900/30 rounded-xl p-6">
            <h3 className="text-blue-300 font-medium flex items-center gap-2 mb-2">
              <Database className="w-5 h-5" />
              Synthesis Runtime Bounds
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              This is a read-only visualization of the context boundaries passed to the conversation
              runtime. Only the evidence listed below is accessible for synthesis. It has been
              strictly scoped to your account and selected nodes.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
              <p>Extracting bounded evidence...</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-300">Context Extraction Failed</h4>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          ) : contextPack ? (
            <div className="space-y-6">
              {/* Truncation Warning */}
              {contextPack.truncation.evidence_truncated && (
                <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4 text-amber-400 text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-medium">Evidence Truncated</span>
                    <p className="mt-1 opacity-90">
                      The resolved context exceeds the runtime safety bounds (
                      {contextPack.limits.max_evidence_items} items). Some evidence has been omitted
                      to preserve synthesis stability.
                    </p>
                  </div>
                </div>
              )}

              {/* Bounds Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">
                    Sources
                  </div>
                  <div className="text-2xl font-light text-white">
                    {contextPack.source_ids.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Limit: {contextPack.limits.max_sources}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">
                    Groups
                  </div>
                  <div className="text-2xl font-light text-white">
                    {contextPack.group_ids.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Limit: {contextPack.limits.max_groups}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">
                    Evidence Items
                  </div>
                  <div className="text-2xl font-light text-white">
                    {contextPack.evidence.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Limit: {contextPack.limits.max_evidence_items}
                  </div>
                </div>
              </div>

              {/* Bounded IDs List */}
              <div className="flex flex-col gap-4">
                {contextPack.source_ids.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4 text-emerald-400" />
                      Bounded Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {contextPack.source_ids.map((id) => (
                        <span
                          key={id}
                          className="bg-emerald-900/20 text-emerald-300/80 border border-emerald-900/50 px-2 py-1 rounded text-xs font-mono"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {contextPack.group_ids.length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
                      <Folder className="w-4 h-4 text-amber-400" />
                      Bounded Groups
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {contextPack.group_ids.map((id) => (
                        <span
                          key={id}
                          className="bg-amber-900/20 text-amber-300/80 border border-amber-900/50 px-2 py-1 rounded text-xs font-mono"
                        >
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Evidence Stream */}
              <div className="mt-8 pt-8 border-t border-slate-800">
                <h4 className="text-lg font-medium text-white mb-6">Resolved Evidence Stream</h4>

                {contextPack.evidence.length === 0 ? (
                  <div className="text-center py-12 bg-slate-800/20 rounded-lg border border-slate-800/50">
                    <p className="text-slate-500">
                      No verifiable evidence found within the provided context bounds.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contextPack.evidence.map((item, idx) => (
                      <div
                        key={`${item.node_id}-${idx}`}
                        className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden group"
                      >
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/60 border-b border-slate-700/50">
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                            {item.kind}
                          </span>
                          <span
                            className="text-xs font-mono text-slate-500 truncate"
                            title={item.node_id}
                          >
                            {item.node_id}
                          </span>
                          {item.label && (
                            <span className="text-xs text-slate-400 ml-auto truncate max-w-[200px]">
                              {item.label}
                            </span>
                          )}
                        </div>
                        {item.text && (
                          <div className="p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-serif">
                            {item.text}
                          </div>
                        )}
                        {!item.text && item.provenance !== undefined && (
                          <div className="p-4 text-xs font-mono text-slate-500 overflow-x-auto">
                            <pre>{JSON.stringify(item.provenance, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
