'use client';

import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useState, useRef, useMemo, useCallback, CSSProperties } from 'react';
import { List } from 'react-window';
import { useContainerHeight } from '@/hooks/useContainerHeight';
import { SimilarityGroup, SimilarityCandidate, ReviewDecision } from '@/types/chat-import';

interface SimilarityTreeViewProps {
  groups: SimilarityGroup[];
  selectedGroupId: string | null;
  selectedCandidateId: string | null;
  decisions: Map<string, ReviewDecision>;
  onGroupSelect: (groupId: string) => void;
  onCandidateSelect: (candidateId: string) => void;
}

// Row height for virtualized list
const GROUP_ROW_HEIGHT = 56;

// Flattened tree node type
type FlatSimilarityNode =
  | { type: 'group'; group: SimilarityGroup; isExpanded: boolean }
  | { type: 'candidate'; candidate: SimilarityCandidate; groupId: string };

// Props for virtualized row
interface SimilarityRowProps {
  flattenedNodes: FlatSimilarityNode[];
  selectedGroupId: string | null;
  selectedCandidateId: string | null;
  decisions: Map<string, ReviewDecision>;
  onGroupSelect: (groupId: string) => void;
  onCandidateSelect: (candidateId: string) => void;
  toggleGroup: (groupId: string) => void;
  getGroupProgress: (group: SimilarityGroup) => { reviewed: number; total: number };
  getDecisionIcon: (candidate: SimilarityCandidate) => React.ReactNode;
}

// Virtualized row component
function SimilarityRow({
  index,
  style,
  flattenedNodes,
  selectedGroupId,
  selectedCandidateId,
  onGroupSelect,
  onCandidateSelect,
  toggleGroup,
  getGroupProgress,
  getDecisionIcon,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes?: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
} & SimilarityRowProps): React.ReactElement | null {
  const node = flattenedNodes[index];

  if (node.type === 'group') {
    const { group, isExpanded } = node;
    const isSelected = selectedGroupId === group.id;
    const progress = getGroupProgress(group);

    return (
      <div style={style} className="px-2 py-0.5">
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
              Similarity Group {group.id.slice(0, 8)}
            </div>
            <div className="text-xs text-slate-400">
              {progress.reviewed}/{progress.total} reviewed
            </div>
          </div>

          {progress.reviewed === progress.total && (
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          )}
        </div>
      </div>
    );
  } else {
    const { candidate } = node;
    const isCandidateSelected = selectedCandidateId === candidate.id;

    return (
      <div style={style} className="px-2 py-0.5">
        <div
          className={`
            flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm ml-6
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
              {candidate.primary.conversationTitle} ↔ {candidate.duplicate.conversationTitle}
            </div>
            <div className="text-xs text-slate-400">
              {Math.round(candidate.similarity * 100)}% similar
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export function SimilarityTreeView({
  groups,
  selectedGroupId,
  selectedCandidateId,
  decisions,
  onGroupSelect,
  onCandidateSelect,
}: SimilarityTreeViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.id))
  );

  // Virtualization refs
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listHeight = useContainerHeight(listContainerRef, 300);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const newExpanded = new Set(prev);
      if (prev.has(groupId)) {
        newExpanded.delete(groupId);
      } else {
        newExpanded.add(groupId);
      }
      return newExpanded;
    });
  }, []);

  const getDecisionIcon = useCallback(
    (candidate: SimilarityCandidate) => {
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
        case 'sequester':
          return <CheckCircle2 className="w-4 h-4 text-amber-500" />;
        default:
          return <XCircle className="w-4 h-4 text-red-500" />;
      }
    },
    [decisions]
  );

  const getGroupProgress = useCallback(
    (group: SimilarityGroup) => {
      const reviewed = group.candidates.filter((c) => decisions.has(c.id)).length;
      return { reviewed, total: group.candidates.length };
    },
    [decisions]
  );

  // Flatten groups and candidates for virtualization
  const flattenedNodes = useMemo((): FlatSimilarityNode[] => {
    const result: FlatSimilarityNode[] = [];

    for (const group of groups) {
      const isExpanded = expandedGroups.has(group.id);
      result.push({ type: 'group', group, isExpanded });

      if (isExpanded) {
        for (const candidate of group.candidates) {
          result.push({ type: 'candidate', candidate, groupId: group.id });
        }
      }
    }

    return result;
  }, [groups, expandedGroups]);

  // Memoized row props
  const rowProps = useMemo(
    (): SimilarityRowProps => ({
      flattenedNodes,
      selectedGroupId,
      selectedCandidateId,
      decisions,
      onGroupSelect,
      onCandidateSelect,
      toggleGroup,
      getGroupProgress,
      getDecisionIcon,
    }),
    [
      flattenedNodes,
      selectedGroupId,
      selectedCandidateId,
      decisions,
      onGroupSelect,
      onCandidateSelect,
      toggleGroup,
      getGroupProgress,
      getDecisionIcon,
    ]
  );

  return (
    <div ref={listContainerRef} className="p-2 flex-1">
      {flattenedNodes.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-8">No similarity groups found</div>
      ) : (
        <List<SimilarityRowProps>
          style={{ height: Math.min(flattenedNodes.length * GROUP_ROW_HEIGHT, listHeight) }}
          rowCount={flattenedNodes.length}
          rowHeight={GROUP_ROW_HEIGHT}
          rowComponent={SimilarityRow}
          rowProps={rowProps}
        />
      )}
    </div>
  );
}
