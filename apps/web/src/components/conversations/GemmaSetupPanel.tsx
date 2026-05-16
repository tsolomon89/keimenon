import React from 'react';
import {
  X,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Download,
  TerminalSquare,
} from 'lucide-react';
import type { LocalInferenceStatus } from '@keimenon/types';

interface GemmaSetupPanelProps {
  status: LocalInferenceStatus | null;
  onClose: () => void;
  onRefresh: () => void;
  isChecking?: boolean;
}

export function GemmaSetupPanel({ status, onClose, onRefresh, isChecking }: GemmaSetupPanelProps) {
  if (!status) return null;

  const isReady = status.state === 'ready';

  return (
    <div className="absolute top-12 right-0 w-96 bg-slate-900 border border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          {isReady ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          )}
          <h3 className="text-sm font-medium text-slate-100">Local Inference Status</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close setup panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto max-h-[70vh]">
        <div className="mb-6">
          <p className="text-sm text-slate-300 leading-relaxed mb-4">{status.message}</p>

          {status.next_actions && status.next_actions.length > 0 && (
            <div className="space-y-2 mt-4">
              {status.next_actions.map((action) => (
                <div
                  key={action.id}
                  className="bg-slate-800/50 p-3 rounded border border-slate-700/50"
                >
                  <div className="text-sm font-medium text-slate-200">{action.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{action.description}</div>
                  <button
                    onClick={async () => {
                      if (action.action_type === 'accept_terms') {
                        await fetch('/api/v1/runtime/local-inference/models/license-acceptance', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            model_family: 'gemma',
                            accepted: true,
                            terms_source: 'ui_panel',
                          }),
                        });
                        onRefresh();
                      } else if (action.action_type === 'open_external') {
                        if (action.id === 'open-model-folder') {
                          if ((window as any).electronAPI?.openModelFolder) {
                            await (window as any).electronAPI.openModelFolder();
                          } else {
                            alert('Folder opens are only supported in the desktop app.');
                          }
                        } else {
                          if ((window as any).electronAPI?.openDataFolder) {
                            await (window as any).electronAPI.openDataFolder();
                          } else {
                            alert('Folder opens are only supported in the desktop app.');
                          }
                        }
                      } else if (action.action_type === 'run_check') {
                        onRefresh();
                      }
                    }}
                    disabled={action.action_type === 'download' || action.disabled}
                    className={`mt-2 px-3 py-1.5 text-white text-xs rounded transition-colors w-full flex items-center justify-center gap-2 ${action.action_type === 'download' || action.disabled ? 'bg-slate-700 cursor-not-allowed opacity-50' : 'bg-blue-600 hover:bg-blue-500'}`}
                  >
                    {action.action_type === 'download' ? (
                      <Download className="w-3 h-3" />
                    ) : (
                      <TerminalSquare className="w-3 h-3" />
                    )}
                    {action.label}
                  </button>
                  {action.disabled_reason && (
                    <div className="text-xs text-amber-500 mt-2 text-center">
                      {action.disabled_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Active Backend
            </div>
            <div className="font-mono text-xs bg-slate-950 p-2 rounded text-emerald-400 border border-slate-800 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              {status.active_backend || status.preferred_backend}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Gemma-Family Model ID
            </div>
            <div className="font-mono text-xs bg-slate-950 p-2 rounded text-blue-400 border border-slate-800">
              {status.model_id || '<Unverified / Not Loaded>'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/80">
        <button
          onClick={onRefresh}
          disabled={isChecking}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-200 rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Re-check Status'}
        </button>
      </div>
    </div>
  );
}
