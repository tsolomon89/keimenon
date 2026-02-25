'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Eye, EyeOff } from 'lucide-react';
import { SourceRole, useKeimenonStore } from '@/store/keimenonStore';

const SOURCE_ROLE_CONFIG: Record<
  SourceRole,
  { label: string; description: string; color: string }
> = {
  imported: {
    label: 'Imported',
    description: 'Chat imports, file uploads',
    color: 'blue',
  },
  workspace: {
    label: 'Workspace',
    description: 'Active working spaces',
    color: 'green',
  },
  brief: {
    label: 'Brief',
    description: 'Agent-generated summaries',
    color: 'purple',
  },
  agent_output: {
    label: 'Agent Output',
    description: 'Agent-created artifacts',
    color: 'orange',
  },
  research_bundle: {
    label: 'Research Bundle',
    description: 'Research task collections',
    color: 'red',
  },
};

const ALL_ROLES: SourceRole[] = [
  'imported',
  'workspace',
  'brief',
  'agent_output',
  'research_bundle',
];

interface SourceRoleFilterProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SourceRoleFilter({
  collapsed = false,
  onCollapsedChange,
}: SourceRoleFilterProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const sourceRoleFilter = useKeimenonStore(
    (state) => state.filters.sourceRoleFilter
  );
  const setSourceRoleFilter = useKeimenonStore(
    (state) => state.setSourceRoleFilter
  );
  const nodes = useKeimenonStore((state) => state.nodes);

  // Compute counts per role
  const roleCounts = useMemo(() => {
    const counts: Record<SourceRole, number> = {
      imported: 0,
      workspace: 0,
      brief: 0,
      agent_output: 0,
      research_bundle: 0,
    };
    nodes.forEach((n) => {
      const role = n.sourceRole ?? 'imported';
      if (role in counts) counts[role]++;
    });
    return counts;
  }, [nodes]);

  const handleToggle = () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapsedChange?.(newCollapsed);
  };

  const handleRoleToggle = (role: SourceRole) => {
    const newRoles = new Set(sourceRoleFilter);
    if (newRoles.has(role)) {
      newRoles.delete(role);
    } else {
      newRoles.add(role);
    }
    setSourceRoleFilter(Array.from(newRoles));
  };

  const handleSelectAll = () => setSourceRoleFilter(ALL_ROLES);
  const handleClearAll = () => setSourceRoleFilter([]);

  const isFiltering = sourceRoleFilter.size > 0;
  const hasAllSelected = sourceRoleFilter.size === ALL_ROLES.length;

  return (
    <div className="border-b border-slate-800">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter
            className={`w-4 h-4 ${isFiltering ? 'text-purple-400' : ''}`}
          />
          <span>Source Role</span>
          {isFiltering && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-600/20 border border-purple-500/30 text-purple-300 rounded">
              {sourceRoleFilter.size}
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Filter Options */}
      {!isCollapsed && (
        <div className="px-3 py-2 space-y-2 bg-slate-900/30">
          {/* Quick actions */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleSelectAll}
              disabled={hasAllSelected}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-50 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Show All
            </button>
            <button
              onClick={handleClearAll}
              disabled={sourceRoleFilter.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-50 transition-colors"
            >
              <EyeOff className="w-3 h-3" />
              Hide All
            </button>
          </div>

          {/* Role checkboxes */}
          {ALL_ROLES.map((role) => {
            const config = SOURCE_ROLE_CONFIG[role];
            const isSelected =
              sourceRoleFilter.size === 0 || sourceRoleFilter.has(role);
            const count = roleCounts[role];

            return (
              <label
                key={role}
                className="flex items-center gap-3 cursor-pointer text-slate-300 hover:text-white transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleRoleToggle(role)}
                  className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span className="flex-1 text-sm">{config.label}</span>
                <span className="text-xs text-slate-500">{count}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact version for toolbar dropdown
export function SourceRoleFilterDropdown() {
  const sourceRoleFilter = useKeimenonStore(
    (state) => state.filters.sourceRoleFilter
  );
  const setSourceRoleFilter = useKeimenonStore(
    (state) => state.setSourceRoleFilter
  );
  const nodes = useKeimenonStore((state) => state.nodes);

  const roleCounts = useMemo(() => {
    const counts: Record<SourceRole, number> = {
      imported: 0,
      workspace: 0,
      brief: 0,
      agent_output: 0,
      research_bundle: 0,
    };
    nodes.forEach((n) => {
      const role = n.sourceRole ?? 'imported';
      if (role in counts) counts[role]++;
    });
    return counts;
  }, [nodes]);

  const handleRoleToggle = (role: SourceRole) => {
    const newRoles = new Set(sourceRoleFilter);
    if (newRoles.has(role)) {
      newRoles.delete(role);
    } else {
      newRoles.add(role);
    }
    setSourceRoleFilter(Array.from(newRoles));
  };

  const handleSelectAll = () => setSourceRoleFilter(ALL_ROLES);
  const handleClearAll = () => setSourceRoleFilter([]);

  return (
    <div className="p-2 space-y-2 min-w-[180px]">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700">
        <button
          onClick={handleSelectAll}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Show All
        </button>
        <button
          onClick={handleClearAll}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>
      {ALL_ROLES.map((role) => {
        const config = SOURCE_ROLE_CONFIG[role];
        const isSelected =
          sourceRoleFilter.size === 0 || sourceRoleFilter.has(role);
        const count = roleCounts[role];

        return (
          <label
            key={role}
            className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors"
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleRoleToggle(role)}
              className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 cursor-pointer"
            />
            <span className="flex-1 text-xs">{config.label}</span>
            <span className="text-xs text-slate-500">{count}</span>
          </label>
        );
      })}
    </div>
  );
}
