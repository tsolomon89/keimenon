'use client';

import { useMemo } from 'react';
import { Activity, AlertTriangle, Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import { useJobStream } from '@/hooks/useJobStream';
import { ImportMiniGraph } from '@/components/import/ImportMiniGraph';
import type { Operation } from '@/contexts/BackgroundOperationsContext';

interface ProcessingCanvasViewProps {
  operation: Operation | null;
}

export function ProcessingCanvasView({ operation }: ProcessingCanvasViewProps) {
  const { jobs, graphUpdates, connected } = useJobStream();
  const jobUpdate = operation ? jobs.get(operation.id) : undefined;

  const progress = Math.round(jobUpdate?.progress?.percent ?? operation?.progress ?? 0);
  const status = jobUpdate?.status ?? operation?.status ?? 'queued';

  const latestGraph = graphUpdates.length > 0 ? graphUpdates[graphUpdates.length - 1] : null;
  const recentNodes = latestGraph?.recentNodes ?? [];

  const stats = useMemo(() => {
    const base = operation?.stats ?? {};
    return [
      { label: 'Nodes Created', value: base.nodesCreated ?? 0 },
      { label: 'Sources Created', value: base.sourcesCreated ?? 0 },
      { label: 'Edges Created', value: base.edgesCreated ?? 0 },
      { label: 'Conversations Processed', value: base.conversationsProcessed ?? 0 },
    ];
  }, [operation]);

  if (!operation) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
        <Activity className="w-10 h-10" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Processing view unavailable</p>
          <p className="text-xs">
            Select an active import job from the dashboard to visualize processing in real time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <header className="border-b border-slate-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Active import</p>
            <h2 className="text-xl font-semibold text-white">{operation.title}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {connected ? 'Live updates connected' : 'Reconnecting to job stream...'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Progress</p>
              <p className="text-sm font-semibold text-white">{progress}%</p>
            </div>
            <div className="w-40 h-1.5 rounded-full bg-slate-900 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {['succeeded', 'failed', 'canceled'].includes(status) ? (
                <PauseCircle className="w-4 h-4" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span className="capitalize">{status}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 p-6 overflow-hidden">
        <section className="bg-slate-900/60 border border-slate-900 rounded-xl p-6 flex flex-col gap-4">
          <header className="flex items-center gap-3">
            <PlayCircle className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Processing metrics</h3>
              <p className="text-xs text-slate-500">Aggregated stats from the current import job</p>
            </div>
          </header>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((metric) => (
              <div
                key={metric.label}
                className="bg-slate-900 border border-slate-800 rounded-lg p-4"
              >
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className="text-xl font-semibold text-white mt-2">
                  {metric.value?.toLocaleString?.() ?? metric.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-900/60 border border-slate-900 rounded-xl p-6 flex flex-col gap-4 xl:col-span-2">
          <header className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Live graph activity</h3>
              <p className="text-xs text-slate-500">
                Nodes generated within the last few processing ticks
              </p>
            </div>
          </header>
          {recentNodes.length > 0 ? (
            <div className="flex-1 min-h-[320px] rounded-lg border border-slate-800 bg-slate-950">
              <ImportMiniGraph
                recentNodes={recentNodes.map((n) => ({
                  ...n,
                  label: n.label || n.kind || 'Node',
                }))}
                width={960}
                height={360}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-[320px] rounded-lg border border-slate-800 bg-slate-950/70 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm">
              <AlertTriangle className="w-6 h-6" />
              <p>No recent graph updates yet.</p>
              <p className="text-xs text-slate-600">
                Node activity will appear here as imports process new data.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
