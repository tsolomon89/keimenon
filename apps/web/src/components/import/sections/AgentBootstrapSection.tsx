'use client';

import { Bot, ShieldAlert } from 'lucide-react';
import { ChatImportConfig } from '@/types/chat-import';

interface AgentBootstrapSectionProps {
  config: ChatImportConfig;
  onConfigChange: (config: ChatImportConfig) => void;
  agentRuntimeEnabled: boolean;
}

export function AgentBootstrapSection({
  config,
  onConfigChange,
  agentRuntimeEnabled,
}: AgentBootstrapSectionProps) {
  const bootstrapMode = config.agent?.bootstrap ?? 'manual';

  const setBootstrapMode = (bootstrap: 'manual' | 'auto') => {
    onConfigChange({
      ...config,
      agent: {
        ...config.agent,
        bootstrap,
      },
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Agent Bootstrap</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBootstrapMode('manual')}
          className={`p-3 rounded-lg border text-left transition-all ${
            bootstrapMode === 'manual'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="font-medium text-sm">Manual (Default)</div>
          <div className="text-xs text-slate-400 mt-1">
            Import completes without automatic objective queueing.
          </div>
        </button>

        <button
          type="button"
          disabled={!agentRuntimeEnabled}
          onClick={() => setBootstrapMode('auto')}
          className={`p-3 rounded-lg border text-left transition-all disabled:opacity-45 disabled:cursor-not-allowed ${
            bootstrapMode === 'auto'
              ? 'bg-purple-600/20 border-purple-500 text-white'
              : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            <Bot className="w-4 h-4" />
            Auto Queue
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Queue objective verification automatically when entitlement checks pass.
          </div>
        </button>
      </div>

      {!agentRuntimeEnabled && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">
            `auto` bootstrap is disabled because this account does not have agent runtime
            entitlement.
          </p>
        </div>
      )}
    </div>
  );
}
