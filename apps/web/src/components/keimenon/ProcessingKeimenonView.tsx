/**
 * Processing Keimenon View
 *
 * Full-screen visualization of active import operations showing:
 * - 7-stage pipeline progress (queued → reading → parsing → normalizing → indexing → linking → done)
 * - Real-time minigraph visualization of nodes being created
 * - Live metrics (nodes, edges, sources, conversations)
 * - SSE-powered updates from backend
 *
 * Integration:
 * - Auto-shown when import job starts (KeimenonLayout.tsx:98)
 * - Receives graph updates via useJobStream hook (SSEBroadcaster → graph.update events)
 * - Displays ImportMiniGraph with force-directed layout and particle effects
 *
 * Related:
 * - apps/web/src/components/import/ImportMiniGraph.tsx (galaxy-style visualization)
 * - apps/web/src/components/import/ImportPipelineProgress.tsx (7-stage progress bar)
 * - apps/api/src/services/DatabaseWriteQueue.ts:286 (broadcasts graph updates)
 */

'use client';

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Loader2, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { useJobStream } from '@/hooks/useJobStream';
import { ImportMiniGraph } from '@/components/import/ImportMiniGraph';
import {
  ImportPipelineProgress,
  type ImportPipelineStage,
} from '@/components/import/ImportPipelineProgress';
import type { Operation } from '@/contexts/BackgroundOperationsContext';
import { cancelJob, pauseJob, resumeJob } from '@/lib/api-client';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@keimenon/ui';
import {
  deriveImportProgress,
  normalizeImportProgressPercent,
  type ImportUiStatus,
} from '@/lib/import-job-progress';

interface ProcessingKeimenonViewProps {
  operation: Operation | null;
}

function formatPipelineError(jobUpdate: any, fallback?: string): string | undefined {
  if (jobUpdate?.error?.code || jobUpdate?.error?.message) {
    const code = jobUpdate.error.code || 'FAILED';
    const stage = jobUpdate.progress?.stage ? String(jobUpdate.progress.stage) : 'UNKNOWN_STAGE';
    const percent =
      typeof jobUpdate.progress?.percent === 'number' ? jobUpdate.progress.percent : 0;
    const message = jobUpdate.error.message || fallback || 'Import failed';
    return `${code} at ${stage} (${percent}%): ${message}`;
  }

  return fallback;
}

export function ProcessingKeimenonView({ operation }: ProcessingKeimenonViewProps) {
  const { jobs, graphUpdates, connected } = useJobStream();
  const jobUpdate = operation ? jobs.get(operation.id) : undefined;
  const [isCanceling, setIsCanceling] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const toast = useToast();
  const lifecycleStatus =
    jobUpdate?.status ??
    (operation?.status === 'blocked'
      ? 'blocked'
      : operation?.status === 'done'
        ? 'succeeded'
        : operation?.status === 'error'
          ? 'failed'
          : operation?.status === 'queued'
            ? 'queued'
            : 'running');

  const derivedProgress = useMemo(
    () =>
      deriveImportProgress({
        backendStatus: lifecycleStatus,
        jobType: 'import',
        progress: { message: jobUpdate?.progress?.message, stage: jobUpdate?.progress?.stage },
        previousStatus: operation?.status as ImportUiStatus | undefined,
      }),
    [lifecycleStatus, jobUpdate?.progress?.message, jobUpdate?.progress?.stage, operation?.status]
  );

  const progress = normalizeImportProgressPercent({
    backendStatus: lifecycleStatus,
    status: derivedProgress.status,
    rawPercent: jobUpdate?.progress?.percent ?? operation?.progress,
    previousPercent: operation?.progress,
    stage: jobUpdate?.progress?.stage,
    metadata: jobUpdate?.progress?.metadata,
  });
  const status = derivedProgress.status;
  const pipelineError =
    derivedProgress.status === 'error'
      ? formatPipelineError(jobUpdate, operation?.error)
      : undefined;

  // Handle cancel button click
  const handleCancel = async () => {
    if (!operation?.id) return;

    const confirmed = window.confirm(
      'Are you sure you want to cancel this import?\n\nThe job will stop at the next checkpoint. Any data already imported will remain in your keimenon.'
    );

    if (!confirmed) return;

    setIsCanceling(true);
    try {
      await cancelJob(operation.id);
      toast.success(
        'Job cancellation requested',
        'The job will stop processing at the next checkpoint.'
      );
    } catch (error: any) {
      console.error('Failed to cancel job:', error);
      toast.error('Failed to cancel job', error.message || 'An unexpected error occurred.');
    } finally {
      setIsCanceling(false);
    }
  };

  // Handle pause button click
  const handlePause = async () => {
    if (!operation?.id) return;

    const confirmed = window.confirm(
      'Pause this import?\n\nThe job will pause at the next checkpoint. When resumed, it will continue from the latest checkpoint.'
    );

    if (!confirmed) return;

    setIsPausing(true);
    try {
      await pauseJob(operation.id);
      toast.success('Job paused successfully', 'Resume to continue from the latest checkpoint.');
    } catch (error: any) {
      console.error('Failed to pause job:', error);
      toast.error('Failed to pause job', error.message || 'An unexpected error occurred.');
    } finally {
      setIsPausing(false);
    }
  };

  // Handle resume button click
  const handleResume = async () => {
    if (!operation?.id) return;

    setIsResuming(true);
    try {
      await resumeJob(operation.id);
      toast.success('Job resumed successfully', 'Continuing from the latest checkpoint.');
    } catch (error: any) {
      console.error('Failed to resume job:', error);
      toast.error('Failed to resume job', error.message || 'An unexpected error occurred.');
    } finally {
      setIsResuming(false);
    }
  };

  const latestGraph = graphUpdates.length > 0 ? graphUpdates[graphUpdates.length - 1] : null;
  const recentNodes = latestGraph?.recentNodes ?? [];

  // Map operation status to pipeline stage
  const pipelineStage: ImportPipelineStage = derivedProgress.stage;

  // Aggregate stats from graph updates (real-time SSE data)
  const stats = useMemo(() => {
    const base = { ...(operation?.stats ?? {}), ...(jobUpdate?.stats ?? {}) };

    // Sum up nodes and edges from all graph updates for this session
    const graphStats = graphUpdates.reduce(
      (acc, update) => ({
        nodesAdded: acc.nodesAdded + (update.nodesAdded ?? 0),
        edgesAdded: acc.edgesAdded + (update.edgesAdded ?? 0),
      }),
      { nodesAdded: 0, edgesAdded: 0 }
    );

    // Use graph update stats if available, otherwise fall back to operation stats
    const nodesCreated = Math.max(base.nodesCreated ?? 0, graphStats.nodesAdded);
    const edgesCreated = Math.max(base.edgesCreated ?? 0, graphStats.edgesAdded);

    return [
      { label: 'Nodes Created', value: nodesCreated },
      { label: 'Sources Created', value: base.sourcesCreated ?? 0 },
      { label: 'Edges Created', value: edgesCreated },
      { label: 'Conversations Processed', value: base.conversationsProcessed ?? 0 },
      { label: 'Messages Processed', value: base.messagesProcessed ?? 0 },
    ];
  }, [operation, jobUpdate?.stats, graphUpdates]);

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
    <>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
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
                {['succeeded', 'failed', 'canceled', 'blocked'].includes(lifecycleStatus) ? (
                  <PauseCircle className="w-4 h-4" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span className="capitalize">{status}</span>
              </div>

              {/* Job control buttons */}
              <div className="flex items-center gap-2">
                {/* Resume button - only for paused (blocked) jobs */}
                {lifecycleStatus === 'blocked' && (
                  <button
                    onClick={handleResume}
                    disabled={isResuming}
                    className="px-3 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10
                           text-green-400 hover:bg-green-500/20 hover:border-green-500/50
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors text-xs font-medium flex items-center gap-1.5"
                    title="Resume job from latest checkpoint"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    {isResuming ? 'Resuming...' : 'Resume'}
                  </button>
                )}

                {/* Pause button - only for running jobs */}
                {lifecycleStatus === 'running' && (
                  <button
                    onClick={handlePause}
                    disabled={isPausing}
                    className="px-3 py-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10
                           text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500/50
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors text-xs font-medium flex items-center gap-1.5"
                    title="Pause job at next checkpoint"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    {isPausing ? 'Pausing...' : 'Pause'}
                  </button>
                )}

                {/* Cancel button - only for queued or running jobs */}
                {(lifecycleStatus === 'queued' || lifecycleStatus === 'running') && (
                  <button
                    onClick={handleCancel}
                    disabled={isCanceling}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10
                           text-red-400 hover:bg-red-500/20 hover:border-red-500/50
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors text-xs font-medium flex items-center gap-1.5"
                    title="Cancel job at next checkpoint"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {isCanceling ? 'Canceling...' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col gap-6 p-6 overflow-hidden">
          {/* Pipeline Progress Section */}
          <section className="bg-slate-900/60 border border-slate-900 rounded-xl p-6">
            <ImportPipelineProgress
              currentStage={pipelineStage}
              progress={progress}
              error={pipelineError}
            />
          </section>

          {/* Metrics and Graph Grid */}
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 overflow-hidden">
            <section className="bg-slate-900/60 border border-slate-900 rounded-xl p-6 flex flex-col gap-4">
              <header className="flex items-center gap-3">
                <PlayCircle className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Processing metrics</h3>
                  <p className="text-xs text-slate-500">
                    Aggregated stats from the current import job
                  </p>
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
      </div>
    </>
  );
}
