import React, { useState } from 'react';
import {
  X,
  Server,
  ShieldAlert,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import type { GemmaLocalStatus } from '../../utils/gemma-status-helper';

interface GemmaSetupPanelProps {
  status: GemmaLocalStatus | null;
  onClose: () => void;
  onRefresh: () => void;
  isChecking?: boolean;
}

export function GemmaSetupPanel({ status, onClose, onRefresh, isChecking }: GemmaSetupPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!status || !status.guidance) return null;

  const { guidance } = status;
  const isOnline = status.status === 'online';

  return (
    <div className="absolute top-12 right-0 w-96 bg-slate-900 border border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-500" />
          )}
          <h3 className="text-sm font-medium text-slate-100">{guidance.title}</h3>
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
          <p className="text-sm text-slate-300 leading-relaxed mb-4">{guidance.explanation}</p>

          {guidance.next_steps.length > 0 && (
            <div className="bg-slate-800/50 rounded p-3 mb-4 border border-slate-700/50">
              <ul className="list-disc pl-4 space-y-1">
                {guidance.next_steps.map((step, idx) => (
                  <li key={idx} className="text-sm text-slate-200">
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Configured Local Runtime Endpoint
            </div>
            <div className="font-mono text-xs bg-slate-950 p-2 rounded text-emerald-400 border border-slate-800 break-all">
              {guidance.expected_runtime_endpoint}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Gemma-Family Model ID
            </div>
            <div className="font-mono text-xs bg-slate-950 p-2 rounded text-blue-400 border border-slate-800">
              {status.modelName || '<Unverified: Check /models>'}
            </div>
          </div>
        </div>

        {guidance.advanced_examples && guidance.advanced_examples.length > 0 && (
          <div className="border-t border-slate-800 pt-4 mt-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Advanced Host Examples</span>
              {showAdvanced ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4">
                {guidance.advanced_examples.map((example, idx) => (
                  <div key={idx} className="bg-slate-800/30 rounded p-3 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Server className="w-3 h-3 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{example.label}</span>
                    </div>
                    <div className="font-mono text-xs text-slate-400 break-all mb-2">
                      {example.base_url}
                    </div>
                    <div className="text-xs text-amber-500/90 italic border-l-2 border-amber-500/50 pl-2">
                      {example.note}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
