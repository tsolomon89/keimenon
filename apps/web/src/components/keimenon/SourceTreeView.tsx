'use client';

import { useState, useRef, useMemo, useCallback, CSSProperties } from 'react';
import { List } from 'react-window';
import { useContainerHeight } from '@/hooks/useContainerHeight';
import { flattenTree, FlattenedNode } from '@/lib/flattenTree';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MessageSquare,
  FileText,
  Code,
  Search,
  Plus,
} from 'lucide-react';
import { TreeNode, SourceNode, FolderNode } from '@/types/keimenon';

interface SourceTreeViewProps {
  nodes: TreeNode[];
  selectedIds: string[];
  onSelect: (id: string, multiSelect: boolean) => void;
  onCreateFolder?: () => void;
}

// Row height for virtualized tree
const TREE_ROW_HEIGHT = 32;

// Props for virtualized tree row
interface TreeRowProps {
  flattenedNodes: FlattenedNode<TreeNode>[];
  selectedIds: string[];
  onSelect: (id: string, multiSelect: boolean) => void;
  toggleExpand: (id: string) => void;
  getIcon: (node: TreeNode) => React.ReactNode;
  getPlatformBadge: (platform?: string) => React.ReactNode;
}

// Virtualized tree row component
function TreeRow({
  index,
  style,
  flattenedNodes,
  selectedIds,
  onSelect,
  toggleExpand,
  getIcon,
  getPlatformBadge,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
} & TreeRowProps): React.ReactElement | null {
  const { node, depth, isExpanded, hasChildren } = flattenedNodes[index];
  const isSelected = selectedIds.includes(node.id);
  const isFolder = node.type === 'folder';

  return (
    <div style={style}>
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
          hover:bg-slate-800 transition-colors
          ${isSelected ? 'bg-purple-600/20 border border-purple-500/30' : ''}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={(e) => onSelect(node.id, e.ctrlKey || e.metaKey)}
      >
        {/* Expand/collapse button for folders */}
        {isFolder && hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            className="p-0.5 hover:bg-slate-700 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-400" />
            )}
          </button>
        )}

        {/* Spacer for non-expandable items */}
        {(!isFolder || !hasChildren) && <div className="w-4" />}

        {/* Icon */}
        <div>{getIcon(node)}</div>

        {/* Title */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm truncate">
            {node.type === 'folder' ? (node as FolderNode).name : (node as SourceNode).title}
          </span>
          {node.type !== 'folder' && getPlatformBadge((node as SourceNode).platform)}
        </div>

        {/* Metadata badge */}
        {node.type !== 'folder' && (node as SourceNode).messageCount !== undefined && (
          <span className="text-xs text-slate-500">{(node as SourceNode).messageCount} msgs</span>
        )}
      </div>
    </div>
  );
}

export function SourceTreeView({
  nodes,
  selectedIds,
  onSelect,
  onCreateFolder,
}: SourceTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Virtualization refs
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listHeight = useContainerHeight(listContainerRef, 300);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newExpanded = new Set(prev);
      if (prev.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }, []);

  const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
    if (!searchQuery) return nodes;

    return nodes.filter((node) => {
      if (node.type === 'folder') {
        return node.name.toLowerCase().includes(searchQuery.toLowerCase());
      } else {
        return node.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
    });
  };

  const getIcon = useCallback(
    (node: TreeNode) => {
      if (node.type === 'folder') {
        const isExpanded = expandedIds.has(node.id);
        return isExpanded ? (
          <FolderOpen className="w-4 h-4 text-blue-400" />
        ) : (
          <Folder className="w-4 h-4 text-blue-500" />
        );
      }

      switch (node.type) {
        case 'conversation':
          return <MessageSquare className="w-4 h-4 text-purple-400" />;
        case 'source_doc':
          return <FileText className="w-4 h-4 text-green-400" />;
        case 'code_asset':
          return <Code className="w-4 h-4 text-orange-400" />;
        default:
          return <FileText className="w-4 h-4 text-gray-400" />;
      }
    },
    [expandedIds]
  );

  const getPlatformBadge = useCallback((platform?: string) => {
    if (!platform) return null;

    const colors = {
      chatgpt: 'bg-green-600/20 text-green-400 border-green-500/30',
      claude: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
      gemini: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    };

    return (
      <span
        className={`text-xs px-1.5 py-0.5 rounded border ${colors[platform as keyof typeof colors] || 'bg-gray-600/20 text-gray-400 border-gray-500/30'}`}
      >
        {platform === 'chatgpt' ? 'GPT' : platform === 'claude' ? 'CLD' : 'GEM'}
      </span>
    );
  }, []);

  const filteredNodes = filterNodes(nodes);
  const rootNodes = filteredNodes.filter((node) => !('parentId' in node) || !node.parentId);

  // Flatten tree for virtualization
  const flattenedNodes = useMemo(() => {
    return flattenTree(rootNodes, {
      getId: (node) => node.id,
      getChildren: (node, allNodes) => {
        if (node.type !== 'folder') return [];
        const folder = node as FolderNode;
        return folder.children
          .map((childId) => filteredNodes.find((n) => n.id === childId))
          .filter((n): n is TreeNode => n !== undefined);
      },
      expandedIds,
    });
  }, [rootNodes, filteredNodes, expandedIds]);

  // Memoized row props for virtualized list
  const treeRowProps = useMemo(
    (): TreeRowProps => ({
      flattenedNodes,
      selectedIds,
      onSelect,
      toggleExpand,
      getIcon,
      getPlatformBadge,
    }),
    [flattenedNodes, selectedIds, onSelect, toggleExpand, getIcon, getPlatformBadge]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-purple-500 outline-none"
          />
        </div>
      </div>

      {/* Action bar */}
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {nodes.length} sources
          {selectedIds.length > 0 && ` • ${selectedIds.length} selected`}
        </span>
        {onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Folder
          </button>
        )}
      </div>

      {/* Tree */}
      <div ref={listContainerRef} className="flex-1 overflow-hidden">
        {flattenedNodes.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-12">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-600" />
            <p>No sources yet</p>
            <p className="mt-2 text-xs">Import conversations to get started</p>
          </div>
        ) : (
          <List<TreeRowProps>
            style={{ height: Math.min(flattenedNodes.length * TREE_ROW_HEIGHT, listHeight) }}
            rowCount={flattenedNodes.length}
            rowHeight={TREE_ROW_HEIGHT}
            rowComponent={TreeRow}
            rowProps={treeRowProps}
          />
        )}
      </div>
    </div>
  );
}
