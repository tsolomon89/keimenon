'use client';

import { RefreshCw, ServerCrash, CheckCircle2, Loader2 } from 'lucide-react';
import type { StartupReadinessState } from '@/hooks/useStartupReadiness';

interface StartupGateProps {
  state: StartupReadinessState;
  onRetry: () => void;
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function StartupGate({ state, onRetry }: StartupGateProps) {
  const waitingChecks = Object.entries(state.checks)
    .filter(([, isReady]) => !isReady)
    .map(([key]) => key);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Keimenon Startup</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Preparing backend services</h1>
          </div>
          {state.phase === 'ready' ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          ) : state.phase === 'error' ? (
            <ServerCrash className="h-8 w-8 text-red-400" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          )}
        </div>

        <div className="mt-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between">
            <span>Readiness endpoint</span>
            <code className="rounded bg-slate-800 px-2 py-1 text-xs">{state.endpoint}</code>
          </div>
          <div className="flex items-center justify-between">
            <span>Elapsed</span>
            <span className="font-medium text-white">{formatDuration(state.elapsedMs)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Checks performed</span>
            <span className="font-medium text-white">{state.attempts}</span>
          </div>
        </div>

        {waitingChecks.length > 0 && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-300">Waiting on readiness checks</p>
            <p className="mt-2 text-sm text-amber-100">{waitingChecks.join(', ')}</p>
          </div>
        )}

        {state.issues.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-300">Backend issues</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">
              {state.issues.slice(0, 5).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {state.lastError && (
          <div className="mt-4 rounded-xl border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-100">
            <p className="font-medium text-red-300">Connection error</p>
            <p className="mt-1">{state.lastError}</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Login will open automatically once backend services are healthy.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry now
          </button>
        </div>
      </div>
    </div>
  );
}
