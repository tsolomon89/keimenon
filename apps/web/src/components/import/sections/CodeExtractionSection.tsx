'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Code, MessageSquare, Tag, Info } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';
import { TagInput } from '@/components/ui/TagInput';

interface CodeExtractionSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function CodeExtractionSection({
  config,
  onConfigChange,
}: CodeExtractionSectionProps) {
  const [showSettings, setShowSettings] = useState(false);

  const handleExtractCodeChange = (checked: boolean) => {
    onConfigChange({ ...config, extractCode: checked });
    if (checked) setShowSettings(true);
  };

  const updateCodeSettings = (updates: Partial<ChatImportConfig['codeSettings']>) => {
    onConfigChange({
      ...config,
      codeSettings: { ...config.codeSettings, ...updates },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.extractCode}
            onChange={(e) => handleExtractCodeChange(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700"
          />
          <span className="text-sm font-semibold">Extract code blocks from messages</span>
        </label>
        {config.extractCode && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
          >
            {showSettings ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Hide Settings
              </>
            ) : (
              <>
                <ChevronRight className="w-3 h-3" />
                Show Settings
              </>
            )}
          </button>
        )}
      </div>

      {config.extractCode && showSettings && (
        <div className="ml-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700 space-y-4">
          <div>
            <label className="block text-sm mb-2">Minimum code block length</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={config.codeSettings.minLength}
                onChange={(e) =>
                  updateCodeSettings({ minLength: parseInt(e.target.value) || 0 })
                }
                className="w-32 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:border-purple-500 outline-none"
              />
              <span className="text-sm text-slate-400">characters</span>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2">
              Filter by languages (leave empty for all)
            </label>
            <TagInput
              tags={config.codeSettings.languages}
              onTagsChange={(languages) => updateCodeSettings({ languages })}
              placeholder="e.g., python, javascript, sql"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Group code blocks by</label>
            <div className="space-y-2">
              {[
                { value: 'language' as const, icon: Code, label: 'Programming language' },
                {
                  value: 'conversation' as const,
                  icon: MessageSquare,
                  label: 'Conversation',
                },
                {
                  value: 'keyword' as const,
                  icon: Tag,
                  label: 'Keywords (uses groups above)',
                },
              ].map(({ value, icon: Icon, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="code-groupby"
                    value={value}
                    checked={config.codeSettings.groupBy === value}
                    onChange={(e) =>
                      updateCodeSettings({ groupBy: e.target.value as any })
                    }
                    className="rounded-full bg-slate-800 border-slate-700"
                  />
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.codeSettings.deduplicate}
              onChange={(e) => updateCodeSettings({ deduplicate: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700"
            />
            <span className="text-sm">Deduplicate identical code blocks globally</span>
          </label>

          <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-lg">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300">
                Code blocks will use the same duplicate detection settings as messages
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
