'use client';

import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { DuplicateGroup, DuplicateCandidate, ReviewDecision } from '@/types/chat-import';

interface DuplicateTreeViewProps {
  groups: DuplicateGroup[];
  selectedGroupId: string | null;
  selectedCandidateId: string | null;
  decisions: Map<string, ReviewDecision>;
  onGroupSelect: (groupId: string) => void;
  onCandidateSelect: (candidateId: string) => void;
}

export function DuplicateTreeView({
  groups,
  selectedGroupId,
  selectedCandidateId,
  decisions,
  onGroupSelect,
  onCandidateSelect,
}: DuplicateTreeViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.id))
  );

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (expandedGroups.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const getDecisionIcon = (candidate: DuplicateCandidate) => {
    const decision = decisions.get(candidate.id);
    if (!decision) {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }

    switch (decision.action) {
      case 'keep-primary':
      case 'keep-duplicate':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'keep-both':
        return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
      case 'merge':
        return <CheckCircle2 className="w-4 h-4 text-purple-500" />;
      default:
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getGroupProgress = (group: DuplicateGroup) => {
    const reviewed = group.candidates.filter((c) => decisions.has(c.id)).length;
    return { reviewed, total: group.candidates.length };
  };

  return (
    <div className="p-2">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const isSelected = selectedGroupId === group.id;
        const progress = getGroupProgress(group);

        return (
          <div key={group.id} className="mb-1">
            {/* Group header */}
            <div
              className={`
                flex items-center gap-2 p-2 rounded-lg cursor-pointer
                ${isSelected ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-slate-800'}
              `}
              onClick={() => {
                onGroupSelect(group.id);
                if (!isExpanded) {
                  toggleGroup(group.id);
                }
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroup(group.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  Duplicate Group {group.id.slice(0, 8)}
                </div>
                <div className="text-xs text-slate-400">
                  {progress.reviewed}/{progress.total} reviewed
                </div>
              </div>

              {progress.reviewed === progress.total && (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
            </div>

            {/* Candidate list */}
            {isExpanded && (
              <div className="ml-6 mt-1 space-y-1">
                {group.candidates.map((candidate) => {
                  const isCandidateSelected = selectedCandidateId === candidate.id;

                  return (
                    <div
                      key={candidate.id}
                      className={`
                        flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm
                        ${
                          isCandidateSelected
                            ? 'bg-purple-600/30 border border-purple-500/50'
                            : 'hover:bg-slate-800'
                        }
                      `}
                      onClick={() => onCandidateSelect(candidate.id)}
                    >
                      {getDecisionIcon(candidate)}

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {candidate.primary.conversationTitle} ↔{' '}
                          {candidate.duplicate.conversationTitle}
                        </div>
                        <div className="text-xs text-slate-400">
                          {Math.round(candidate.similarity * 100)}% similar
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
