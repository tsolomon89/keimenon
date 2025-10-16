'use client';

import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  X,
} from 'lucide-react';

/**
 * Universal Navigation Bar - Reusable tree/file-manager UI
 * Used for: Groups & Folders, Account Navigation, Settings Tree
 */

export interface TreeNode {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
  children?: TreeNode[];
  metadata?: Record<string, any>;
  visible?: boolean; // For permission-based hiding
}

export interface FilterConfig {
  id: string;
  label: string;
  type: 'checkbox' | 'select' | 'date-range';
  options?: { value: string; label: string }[];
  value?: any;
  onChange: (value: any) => void;
}

interface NavigationBarProps {
  mode: 'groups' | 'accounts' | 'settings';
  data: TreeNode[];
  selectedId?: string;
  selectedIds?: Set<string>; // Multi-select support
  onSelect: (node: TreeNode, event?: React.MouseEvent) => void;
  filters?: FilterConfig[];
  searchPlaceholder?: string;
  showActions?: boolean;
  emptyMessage?: string;
  multiSelect?: boolean; // Enable multi-select mode
}

export function NavigationBar({
  mode: _mode,
  data,
  selectedId,
  selectedIds,
  onSelect,
  filters,
  searchPlaceholder = 'Search...',
  showActions: _showActions = false,
  emptyMessage = 'No items',
  multiSelect = false,
}: NavigationBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    const query = searchQuery.toLowerCase();
    const filterNode = (node: TreeNode): TreeNode | null => {
      const matches = node.label.toLowerCase().includes(query);
      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((n): n is TreeNode => n !== null);

      if (matches || (filteredChildren && filteredChildren.length > 0)) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    };

    return data.map(filterNode).filter((n): n is TreeNode => n !== null);
  }, [data, searchQuery]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const renderBadge = (badge: string | number, color: string = 'slate') => {
    const colors = {
      blue: 'bg-blue-600/20 border-blue-500/30 text-blue-300',
      green: 'bg-green-600/20 border-green-500/30 text-green-300',
      red: 'bg-red-600/20 border-red-500/30 text-red-300',
      yellow: 'bg-yellow-600/20 border-yellow-500/30 text-yellow-300',
      purple: 'bg-purple-600/20 border-purple-500/30 text-purple-300',
      slate: 'bg-slate-600/20 border-slate-500/30 text-slate-300',
    };

    return (
      <span className={`px-1.5 py-0.5 text-xs border rounded ${colors[color as keyof typeof colors] || colors.slate}`}>
        {badge}
      </span>
    );
  };

  const renderNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    if (node.visible === false) return null;

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    // Check if selected (support both single and multi-select)
    const isSelected = multiSelect
      ? (selectedIds?.has(node.id) || false)
      : (selectedId === node.id);

    const IconComponent = node.icon;

    return (
      <div key={node.id}>
        {/* Node row */}
        <button
          onClick={(e) => {
            if (hasChildren) {
              toggleExpanded(node.id);
            }
            onSelect(node, e);
          }}
          className={`
            w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
            ${isSelected
              ? 'bg-purple-600/20 border-l-2 border-purple-500 text-white'
              : 'hover:bg-slate-800/50 text-slate-300 hover:text-white'
            }
          `}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
        >
          {/* Expand/collapse icon */}
          {hasChildren && (
            <span className="flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500" />
              )}
            </span>
          )}

          {/* Node icon */}
          {IconComponent && (
            <IconComponent className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-400' : 'text-slate-400'}`} />
          )}

          {/* Node label */}
          <span className="flex-1 truncate">{node.label}</span>

          {/* Badge */}
          {node.badge !== undefined && renderBadge(node.badge, node.badgeColor)}
        </button>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-3 py-3 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-3 h-3 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* Filters (optional) */}
      {filters && filters.length > 0 && (
        <div className="border-b border-slate-800">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`} />
          </button>

          {showFilters && (
            <div className="px-3 py-2 space-y-2 bg-slate-900/30">
              {filters.map((filter) => (
                <div key={filter.id}>
                  {filter.type === 'checkbox' && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={filter.value || false}
                        onChange={(e) => filter.onChange(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700"
                      />
                      <span>{filter.label}</span>
                    </label>
                  )}

                  {filter.type === 'select' && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{filter.label}</label>
                      <select
                        value={filter.value || ''}
                        onChange={(e) => filter.onChange(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white"
                      >
                        <option value="">All</option>
                        {filter.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {filteredData.length > 0 ? (
          <div className="py-2">
            {filteredData.map((node) => renderNode(node, 0))}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-sm text-slate-500">
            {searchQuery ? `No results for "${searchQuery}"` : emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
