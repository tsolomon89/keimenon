'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { useJobStream } from '@/hooks/useJobStream';
import type { Operation } from '@/contexts/BackgroundOperationsContext';

const STATUS_COPY: Record<
  Operation['status'],
  { label: string; tone: 'default' | 'success' | 'danger' }
> = {
  queued: { label: 'Queued', tone: 'default' },
  reading: { label: 'Reading', tone: 'default' },
  parsing: { label: 'Parsing', tone: 'default' },
  normalizing: { label: 'Normalizing', tone: 'default' },
  indexing: { label: 'Indexing', tone: 'default' },
  linking: { label: 'Linking', tone: 'default' },
  processing: { label: 'Processing', tone: 'default' },
  done: { label: 'Complete', tone: 'success' },
  error: { label: 'Failed', tone: 'danger' },
};

interface ImportOperationInspectorProps {
  operation: Operation | null;
  onClose?: () => void;
  onViewProcessing?: () => void;
}

export function ImportOperationInspector({
  operation,
  onClose,
  onViewProcessing,
}: ImportOperationInspectorProps) {
  const { jobs, connected } = useJobStream();

  const jobUpdate = operation ? jobs.get(operation.id) : undefined;
  const status = jobUpdate?.status ?? operation?.status ?? 'queued';
  const progress = Math.round(jobUpdate?.progress?.percent ?? operation?.progress ?? 0);

  const metrics = useMemo(() => {
    if (!operation) {
      return [];
    }

    const stats = operation.stats || {};
    return [
      { label: 'Nodes Created', value: stats.nodesCreated ?? 0 },
      { label: 'Sources Created', value: stats.sourcesCreated ?? 0 },
      { label: 'Edges Created', value: stats.edgesCreated ?? 0 },
      { label: 'Conversations Processed', value: stats.conversationsProcessed ?? 0 },
    ];
  }, [operation]);

  if (!operation) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
        <Activity className="w-8 h-8" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">No background operation selected</p>
          <p className="text-xs">
            Choose an import job from the dashboard table to inspect its progress.
          </p>
        </div>
      </div>
    );
  }

  const tone = STATUS_COPY[status as Operation['status']] ?? STATUS_COPY.processing;
  const statusClass =
    tone.tone === 'success'
      ? 'bg-green-500/15 border border-green-500/30 text-green-300'
      : tone.tone === 'danger'
        ? 'bg-red-500/15 border border-red-500/30 text-red-300'
        : 'bg-slate-500/15 border border-slate-500/30 text-slate-300';

  const StatusIcon = status === 'done' ? CheckCircle2 : status === 'error' ? XCircle : Loader2;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <header className="flex items-start justify-between p-4 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white">{operation.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {operation.description || operation.fileType || 'Background operation'}
          </p>

          <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium uppercase tracking-wide">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${statusClass}`}>
              <StatusIcon
                className={
                  status === 'done' || status === 'error'
                    ? 'w-3.5 h-3.5'
                    : 'w-3.5 h-3.5 animate-spin'
                }
              />
              {tone.label}
            </div>
            <span className="text-slate-500">
              {progress}% | {connected ? 'Live' : 'Reconnecting...'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onViewProcessing && (
            <button
              type="button"
              onClick={() => onViewProcessing()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-200 hover:bg-purple-600/30 transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              View Processing
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Progress</p>
              <p className="text-sm font-semibold text-white">{progress}%</p>
            </div>
            <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={clsx('h-full transition-all', {
                  'bg-green-500': status === 'done',
                  'bg-red-500': status === 'error',
                  'bg-purple-500': status !== 'done' && status !== 'error',
                })}
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                Started{' '}
                {operation.startedAt ? new Date(operation.startedAt).toLocaleTimeString() : '-'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>
                Updated{' '}
                {jobUpdate?.timestamp ? new Date(jobUpdate.timestamp).toLocaleTimeString() : '-'}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-3">Metrics</h3>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="bg-slate-900/60 border border-slate-800 rounded-lg p-3"
              >
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {metric.value?.toLocaleString?.() ?? metric.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {jobUpdate?.progress?.message && (
          <section className="bg-blue-900/15 border border-blue-900/40 rounded-lg p-4 text-xs text-blue-200 flex gap-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-1" />
            <div>
              <p className="font-medium text-blue-100 mb-1">Latest Update</p>
              <p>{jobUpdate.progress.message}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
