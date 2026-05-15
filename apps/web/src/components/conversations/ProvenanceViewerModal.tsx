import React, { useEffect, useState } from 'react';
import { AgentRunProvenance, organizationService } from '@/services/organization-service';
import { X, Network, FileText, MessageSquare, Tag, AlertCircle, Loader2 } from 'lucide-react';

interface ProvenanceViewerModalProps {
  runId: string;
  onClose: () => void;
}

export function ProvenanceViewerModal({ runId, onClose }: ProvenanceViewerModalProps) {
  const [provenance, setProvenance] = useState<AgentRunProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProvenance = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await organizationService.getAgentRunProvenance(runId);
        setProvenance(data);
      } catch (err: any) {
        console.error('Failed to fetch provenance:', err);
        setError(err.message || 'Failed to load provenance data');
      } finally {
        setLoading(false);
      }
    };

    fetchProvenance();
  }, [runId]);

  const renderIcon = (kind: string) => {
    switch (kind) {
      case 'SourceSpan':
        return <FileText className="w-4 h-4 text-emerald-400" />;
      case 'Phrase':
        return <MessageSquare className="w-4 h-4 text-sky-400" />;
      case 'Topic':
        return <Tag className="w-4 h-4 text-purple-400" />;
      default:
        return <Network className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-modal-title"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-md">
              <Network className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 id="provenance-modal-title" className="text-lg font-semibold text-slate-100">
                Evidence Provenance
              </h2>
              <p className="text-sm text-slate-400">Run ID: {runId.split('-')[0]}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-4">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-400 text-sm">Hydrating provenance subgraph...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-4 text-rose-400">
              <AlertCircle className="w-8 h-8" />
              <p>{error}</p>
            </div>
          ) : !provenance || provenance.evidence.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-400">
              <Network className="w-8 h-8 text-slate-600 mb-2" />
              <p>No explicit evidence was bound to this run.</p>
              <p className="text-xs text-slate-500">
                The model may have answered from general knowledge.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                    Total Items
                  </p>
                  <p className="text-2xl font-light text-slate-200">
                    {provenance.stats.total_items}
                  </p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Spans</p>
                  <p className="text-2xl font-light text-emerald-400">{provenance.stats.spans}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Phrases</p>
                  <p className="text-2xl font-light text-sky-400">{provenance.stats.phrases}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Topics</p>
                  <p className="text-2xl font-light text-purple-400">{provenance.stats.topics}</p>
                </div>
              </div>

              {/* Evidence List */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                  USED_EVIDENCE Subgraph
                </h3>
                {provenance.evidence.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700 hover:border-slate-600 transition-colors group"
                  >
                    <div className="flex-shrink-0 mt-1">{renderIcon(item.kind)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-400 px-2 py-0.5 bg-slate-800 rounded">
                          {item.kind}
                        </span>
                        {item.source_id && (
                          <span className="text-xs text-slate-500 font-mono truncate">
                            Source: {item.source_id.split('-')[0]}
                          </span>
                        )}
                        {item.frequency !== undefined && item.frequency > 0 && (
                          <span className="text-xs text-slate-500">Freq: {item.frequency}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-300 line-clamp-3 group-hover:line-clamp-none transition-all">
                        {item.text}
                      </p>
                      {(item.start_char !== undefined || item.end_char !== undefined) && (
                        <p className="text-xs text-slate-600 mt-2 font-mono">
                          Chars: [{item.start_char ?? '?'} - {item.end_char ?? '?'}]
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
