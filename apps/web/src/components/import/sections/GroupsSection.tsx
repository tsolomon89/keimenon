'use client';

import { Plus, Trash } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';
import { TagInput } from '@/components/ui/TagInput';

interface GroupsSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function GroupsSection({ config, onConfigChange }: GroupsSectionProps) {
  const addGroup = () => {
    onConfigChange({
      ...config,
      groups: [
        ...config.groups,
        {
          id: `grp_${Date.now()}`,
          name: '',
          keywords: [],
        },
      ],
    });
  };

  const removeGroup = (index: number) => {
    onConfigChange({
      ...config,
      groups: config.groups.filter((_, i) => i !== index),
    });
  };

  const updateGroupName = (index: number, name: string) => {
    const newGroups = [...config.groups];
    newGroups[index] = { ...newGroups[index], name };
    onConfigChange({ ...config, groups: newGroups });
  };

  const updateGroupKeywords = (index: number, keywords: string[]) => {
    const newGroups = [...config.groups];
    newGroups[index] = { ...newGroups[index], keywords };
    onConfigChange({ ...config, groups: newGroups });
  };

  // Only show for manual and hybrid processing modes.
  if (config.processingMode !== 'manual' && config.processingMode !== 'hybrid') {
    return null;
  }

  return (
    <div className="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Groups</h3>
        <button
          onClick={addGroup}
          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Group
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Define keyword-based groups. Messages matching keywords will be grouped together.
      </p>

      {config.groups.length === 0 ? (
        <div className="p-4 border border-dashed border-slate-700 rounded-lg text-center">
          <p className="text-sm text-slate-500">No groups defined yet</p>
          <p className="text-xs text-slate-600 mt-1">Click "Add Group" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {config.groups.map((group, idx) => (
            <div key={group.id} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Group name"
                  value={group.name}
                  onChange={(e) => updateGroupName(idx, e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:border-purple-500 outline-none text-sm"
                />
                <button
                  onClick={() => removeGroup(idx)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>

              <TagInput
                tags={group.keywords}
                onTagsChange={(keywords) => updateGroupKeywords(idx, keywords)}
                placeholder="Add keywords (press Enter)"
              />

              {group.matchCount !== undefined && (
                <p className="text-xs text-slate-400 mt-2">
                  {group.matchCount} messages match these keywords
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
