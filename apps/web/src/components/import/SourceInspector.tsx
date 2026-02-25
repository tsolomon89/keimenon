import React, { useState } from 'react';
import { cn } from '@keimenon/ui';
import { aiService } from '@/services/ai-service';
import { AiAnalysisResult, SmartClaim } from '@keimenon/types';

interface SourceDocInput {
  id: string;
  title: string;
  stats: {
    segmentCount: number;
    charCount: number;
    dupPercent: number;
  };
}

interface SourceInspectorProps {
  source: SourceDocInput;
  onReviewAction: (id: string, action: 'approve' | 'reject' | 'merge') => void;
}

export function SourceInspector({ source, onReviewAction }: SourceInspectorProps) {
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // TODO: In real app, we'd fetch the actual content first.
      // For now, we pass a dummy content or just the title to mock the backend.
      const result = await aiService.analyzeSource(source.id, `Content of ${source.title}`);
      setAnalysis(result);
    } catch (error) {
      console.error('Analysis failed', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h3 className="text-lg font-bold text-white mb-1">{source.title}</h3>
        <div className="text-sm text-slate-400">ID: {source.id}</div>
      </div>

      <div className="p-3 bg-slate-800 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Segments</span>
          <span className="text-white">{source.stats.segmentCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Characters</span>
          <span className="text-white">{source.stats.charCount}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Duplicate Risk</span>
          <span className={source.stats.dupPercent > 20 ? "text-red-400" : "text-green-400"}>
            {source.stats.dupPercent}%
          </span>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="border-t border-slate-700 pt-4">
        {!analysis ? (
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900/50 text-white rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span> Analyzing...
              </>
            ) : (
              <>
                <span>✨</span> Analyze with AI
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                AI Summary
              </h4>
              <p className="text-sm text-slate-200 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Extracted Claims ({analysis.claims.length})
              </h4>
              <div className="flex flex-col gap-2">
                {analysis.claims.map((claim) => (
                  <div key={claim.id} className="p-2 bg-slate-800 border-l-2 border-yellow-500 rounded text-xs text-slate-300">
                    "{claim.text}"
                    <div className="mt-1 flex gap-2">
                      {claim.tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] text-slate-400">#{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
             <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
               Tags
              </h4>
             <div className="flex flex-wrap gap-1">
                 {analysis.suggestedTags.map(tag => (
                     <span key={tag} className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-700">
                         {tag}
                     </span>
                 ))}
             </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-slate-700 pt-4">
        <button
          onClick={() => onReviewAction(source.id, 'approve')}
          className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors"
        >
          Approve & Import
        </button>
        <button
          onClick={() => onReviewAction(source.id, 'reject')}
          className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md font-medium transition-colors"
        >
          Reject
        </button>
        <button
          onClick={() => onReviewAction(source.id, 'merge')}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
        >
          Merge into...
        </button>
      </div>
    </div>
  );
}
