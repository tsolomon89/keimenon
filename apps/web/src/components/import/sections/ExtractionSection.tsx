'use client';

import { Settings } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';

interface ExtractionSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
}

export function ExtractionSection({ config, onConfigChange }: ExtractionSectionProps) {
  const handleUserChange = (checked: boolean) => {
    onConfigChange({
      ...config,
      extraction: { ...config.extraction, includeUser: checked },
    });
  };

  const handleAssistantChange = (checked: boolean) => {
    onConfigChange({
      ...config,
      extraction: { ...config.extraction, includeAssistant: checked },
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Settings className="w-4 h-4" />
        Extraction
      </h3>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.extraction.includeUser}
            onChange={(e) => handleUserChange(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700"
          />
          <span className="text-sm">User messages</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.extraction.includeAssistant}
            onChange={(e) => handleAssistantChange(e.target.checked)}
            className="rounded bg-slate-800 border-slate-700"
          />
          <span className="text-sm">AI/Assistant messages</span>
        </label>
      </div>

      <p className="text-xs text-slate-400">
        Select which message types to extract from conversations
      </p>
    </div>
  );
}
