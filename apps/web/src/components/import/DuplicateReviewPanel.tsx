'use client';

import { useState, useEffect, useMemo } from 'react';
import { DuplicateGroup, ReviewDecision } from '@/types/chat-import';
import { DuplicateTreeView } from './DuplicateTreeView';
import { DuplicateComparisonView } from './DuplicateComparisonView';
import { DuplicateActionsPanel } from './DuplicateActionsPanel';
import { useUndoRedo } from '@/hooks/useUndoRedo';

interface DuplicateReviewPanelProps {
  groups: DuplicateGroup[];
  onReviewComplete: (decisions: Map<string, ReviewDecision>) => void;
  onCancel: () => void;
}

export function DuplicateReviewPanel({
  groups,
  onReviewComplete,
  onCancel,
}: DuplicateReviewPanelProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups.length > 0 ? groups[0].id : null
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  // Undo/Redo for decisions
  const initialDecisions = useMemo(() => {
    const entries: Array<[string, ReviewDecision]> = [];
    groups.forEach((group) => {
      group.candidates.forEach((candidate) => {
        if (!candidate.decision) {
          return;
        }

        entries.push([
          candidate.id,
          {
            duplicateId: candidate.id,
            action: candidate.decision,
            timestamp: Date.now(),
            primaryNodeId: candidate.primary.id,
            duplicateNodeId: candidate.duplicate.id,
          },
        ]);
      });
    });
    return new Map(entries);
  }, [groups]);

  const {
    state: decisions,
    setState: setDecisions,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo<Map<string, ReviewDecision>>(initialDecisions);

  useEffect(() => {
    setDecisions(initialDecisions);
  }, [initialDecisions, setDecisions]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const selectedCandidate = selectedGroup?.candidates.find((c) => c.id === selectedCandidateId);
  const totalCandidates = groups.reduce((sum, g) => sum + g.candidates.length, 0);
  const reviewedCount = decisions.size;
  const progressPercent = totalCandidates > 0 ? (reviewedCount / totalCandidates) * 100 : 0;
  const pendingCount = Math.max(totalCandidates - reviewedCount, 0);

  const handleDecision = (candidateId: string, action: ReviewDecision['action']) => {
    // Find the candidate to include canonical node IDs in apply payload.
    const candidate = selectedGroup?.candidates.find((c) => c.id === candidateId);
    if (!candidate) {
      console.error('Candidate not found:', candidateId);
      return;
    }

    // Update local state only; backend mutation happens in one job-scoped apply call.
    const newDecisions = new Map(decisions);
    newDecisions.set(candidateId, {
      duplicateId: candidateId,
      action,
      timestamp: Date.now(),
      primaryNodeId: candidate.primary.id,
      duplicateNodeId: candidate.duplicate.id,
    });
    setDecisions(newDecisions);

    // Auto-advance to next candidate.
    if (selectedGroup) {
      const currentIndex = selectedGroup.candidates.findIndex((c) => c.id === candidateId);
      if (currentIndex < selectedGroup.candidates.length - 1) {
        setSelectedCandidateId(selectedGroup.candidates[currentIndex + 1].id);
      } else {
        const currentGroupIndex = groups.findIndex((g) => g.id === selectedGroupId);
        if (currentGroupIndex < groups.length - 1) {
          const nextGroup = groups[currentGroupIndex + 1];
          setSelectedGroupId(nextGroup.id);
          setSelectedCandidateId(nextGroup.candidates[0]?.id || null);
        }
      }
    }
  };

  const handleComplete = () => {
    if (decisions.size < totalCandidates) {
      return;
    }
    onReviewComplete(decisions);
  };

  const handleBulkAction = (action: ReviewDecision['action']) => {
    const newDecisions = new Map(decisions);

    if (selectedGroup) {
      selectedGroup.candidates.forEach((candidate) => {
        newDecisions.set(candidate.id, {
          duplicateId: candidate.id,
          action,
          timestamp: Date.now(),
          primaryNodeId: candidate.primary.id,
          duplicateNodeId: candidate.duplicate.id,
        });
      });
      setDecisions(newDecisions);
    }
  };

  const handleBulkActionAll = (action: ReviewDecision['action']) => {
    const newDecisions = new Map(decisions);

    groups.forEach((group) => {
      group.candidates.forEach((candidate) => {
        newDecisions.set(candidate.id, {
          duplicateId: candidate.id,
          action,
          timestamp: Date.now(),
          primaryNodeId: candidate.primary.id,
          duplicateNodeId: candidate.duplicate.id,
        });
      });
    });
    setDecisions(newDecisions);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCandidateId) return;

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1':
          e.preventDefault();
          handleDecision(selectedCandidateId, 'keep-primary');
          break;
        case '2':
          e.preventDefault();
          handleDecision(selectedCandidateId, 'keep-duplicate');
          break;
        case '3':
          e.preventDefault();
          handleDecision(selectedCandidateId, 'keep-both');
          break;
        case '4':
          e.preventDefault();
          handleDecision(selectedCandidateId, 'merge');
          break;
        case '5':
          e.preventDefault();
          handleDecision(selectedCandidateId, 'sequester');
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case 'y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          navigateCandidate(e.key === 'ArrowUp' ? 'prev' : 'next');
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
        case 'Enter':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (decisions.size >= totalCandidates) {
              handleComplete();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCandidateId, selectedGroupId, groups, decisions, undo, redo, totalCandidates]);

  const navigateCandidate = (direction: 'prev' | 'next') => {
    if (!selectedGroup || !selectedCandidateId) return;

    const currentIndex = selectedGroup.candidates.findIndex((c) => c.id === selectedCandidateId);

    if (direction === 'next') {
      if (currentIndex < selectedGroup.candidates.length - 1) {
        setSelectedCandidateId(selectedGroup.candidates[currentIndex + 1].id);
      } else {
        const currentGroupIndex = groups.findIndex((g) => g.id === selectedGroupId);
        if (currentGroupIndex < groups.length - 1) {
          const nextGroup = groups[currentGroupIndex + 1];
          setSelectedGroupId(nextGroup.id);
          setSelectedCandidateId(nextGroup.candidates[0]?.id || null);
        }
      }
    } else {
      if (currentIndex > 0) {
        setSelectedCandidateId(selectedGroup.candidates[currentIndex - 1].id);
      } else {
        const currentGroupIndex = groups.findIndex((g) => g.id === selectedGroupId);
        if (currentGroupIndex > 0) {
          const prevGroup = groups[currentGroupIndex - 1];
          setSelectedGroupId(prevGroup.id);
          setSelectedCandidateId(prevGroup.candidates[prevGroup.candidates.length - 1]?.id || null);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold">Review Duplicates</h2>
            <div className="text-xs text-slate-500 mt-1">
              Use up/down arrows to navigate, 1-5 for actions, Ctrl+Z/Y to undo/redo, Esc to cancel,
              Ctrl+Enter to complete
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors">
                Bulk Actions
              </button>
              <div className="absolute right-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <div className="p-2">
                  <div className="text-xs text-slate-400 mb-2 px-2">Apply to current group:</div>
                  <button
                    onClick={() => handleBulkAction('keep-primary')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Primary for All
                  </button>
                  <button
                    onClick={() => handleBulkAction('keep-duplicate')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Duplicate for All
                  </button>
                  <button
                    onClick={() => handleBulkAction('keep-both')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Both for All
                  </button>
                  <button
                    onClick={() => handleBulkAction('sequester')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Sequester Duplicates for All
                  </button>
                  <div className="border-t border-slate-700 my-2"></div>
                  <div className="text-xs text-slate-400 mb-2 px-2">Apply to all groups:</div>
                  <button
                    onClick={() => handleBulkActionAll('keep-primary')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Primary Everywhere
                  </button>
                  <button
                    onClick={() => handleBulkActionAll('keep-duplicate')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Duplicate Everywhere
                  </button>
                  <button
                    onClick={() => handleBulkActionAll('keep-both')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Keep Both Everywhere
                  </button>
                  <button
                    onClick={() => handleBulkActionAll('sequester')}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 rounded transition-colors"
                  >
                    Sequester Duplicates Everywhere
                  </button>
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              {reviewedCount} / {totalCandidates} reviewed
            </div>
            {pendingCount > 0 && (
              <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded">
                {pendingCount} pending
              </div>
            )}
          </div>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-slate-700 overflow-y-auto bg-slate-900/50">
          <DuplicateTreeView
            groups={groups}
            selectedGroupId={selectedGroupId}
            selectedCandidateId={selectedCandidateId}
            decisions={decisions}
            onGroupSelect={setSelectedGroupId}
            onCandidateSelect={setSelectedCandidateId}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedCandidate ? (
            <DuplicateComparisonView
              candidate={selectedCandidate}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              <p>Select a duplicate pair to review</p>
            </div>
          )}
        </div>

        <div className="w-80 border-l border-slate-700 overflow-y-auto bg-slate-900/50">
          {selectedCandidate && (
            <DuplicateActionsPanel
              candidate={selectedCandidate}
              decision={selectedCandidateId ? decisions.get(selectedCandidateId) : undefined}
              onDecision={(action) =>
                selectedCandidateId && handleDecision(selectedCandidateId, action)
              }
            />
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 text-slate-400 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 text-slate-400 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
                />
              </svg>
            </button>
          </div>
        </div>
        <button
          onClick={handleComplete}
          disabled={pendingCount > 0}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {pendingCount > 0 ? `Complete Review (${pendingCount} pending)` : 'Complete Review'}
        </button>
      </div>
    </div>
  );
}
