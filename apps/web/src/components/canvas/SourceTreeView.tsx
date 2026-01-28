'use client';

import { useState } from 'react';
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

export function SourceTreeView({
  nodes,
  selectedIds,
  onSelect,
  onCreateFolder,
}: SourceTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (expandedIds.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

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

  const getIcon = (node: TreeNode) => {
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
  };

  const getPlatformBadge = (platform?: string) => {
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
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isSelected = selectedIds.includes(node.id);
    const isFolder = node.type === 'folder';
    const isExpanded = isFolder && expandedIds.has(node.id);

    return (
      <div key={node.id}>
        {/* Node row */}
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
          {isFolder && (
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

          {/* Icon */}
          <div className={!isFolder ? 'ml-5' : ''}>{getIcon(node)}</div>

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

        {/* Children (if folder is expanded) */}
        {isFolder && isExpanded && (node as FolderNode).children.length > 0 && (
          <div>
            {(node as FolderNode).children.map((childId) => {
              const childNode = nodes.find((n) => n.id === childId);
              return childNode ? renderNode(childNode, depth + 1) : null;
            })}
          </div>
        )}
      </div>
    );
  };

  const filteredNodes = filterNodes(nodes);
  const rootNodes = filteredNodes.filter((node) => !('parentId' in node) || !node.parentId);

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
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {rootNodes.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-12">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-600" />
            <p>No sources yet</p>
            <p className="mt-2 text-xs">Import conversations to get started</p>
          </div>
        ) : (
          rootNodes.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
}
