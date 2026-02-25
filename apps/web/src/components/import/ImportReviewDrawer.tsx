'use client';

import React, { useState } from 'react';
import { Tile, cn } from '@keimenon/ui';
import { SourceInspector } from './SourceInspector';
import { ImportCandidate } from '@/store/keimenonStore';

interface ImportReviewDrawerProps {
  candidates: ImportCandidate[];
  onReviewAction: (id: string, action: 'approve' | 'reject' | 'merge') => void;
  onClose: () => void;
}

export function ImportReviewDrawer({
  candidates,
  onReviewAction,
  onClose
}: ImportReviewDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedCandidate = candidates.find(c => c.id === selectedId);

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col z-50 transform transition-transform">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
        <h2 className="text-xl font-bold text-white">Import Review</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* List of Candidates */}
        <div className="w-1/2 border-r border-slate-700 overflow-y-auto p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">Candidates ({candidates.length})</h3>
          {candidates.map(candidate => (
            <div 
              key={candidate.id}
              onClick={() => setSelectedId(candidate.id)}
              className={cn(
                "p-3 rounded-lg cursor-pointer border transition-all",
                selectedId === candidate.id 
                  ? "bg-purple-900/30 border-purple-500" 
                  : "bg-slate-800 border-slate-700 hover:border-slate-500"
              )}
            >
              <div className="font-medium text-slate-200 truncate">{candidate.title}</div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>{candidate.stats.segmentCount} segs</span>
                <span>{candidate.stats.charCount} chars</span>
              </div>
              {candidate.stats.dupPercent > 10 && (
                <div className="mt-1 text-xs text-orange-400">
                  ⚠️ {candidate.stats.dupPercent}% dup
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Details Panel */}
        <div className="w-1/2 p-4 overflow-y-auto bg-slate-900/50">
          {selectedCandidate ? (
            <SourceInspector 
              source={selectedCandidate}
              onReviewAction={onReviewAction}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a candidate to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
