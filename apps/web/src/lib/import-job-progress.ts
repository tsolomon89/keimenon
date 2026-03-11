import { ImportJobStage } from '@keimenon/types';

export type ImportUiStatus =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'processing'
  | 'blocked'
  | 'done'
  | 'error';

export type ImportPipelineStageStatus =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'done';

export interface DeriveImportProgressInput {
  backendStatus: string;
  jobType?: string;
  progress?: {
    message?: string;
    stage?: ImportJobStage | string | null;
  };
  previousStatus?: ImportUiStatus;
}

export interface DerivedImportProgress {
  status: ImportUiStatus;
  stage: ImportPipelineStageStatus;
}

export interface NormalizeImportProgressPercentInput {
  backendStatus: string;
  status: ImportUiStatus;
  rawPercent?: number | null;
  previousPercent?: number;
  stage?: ImportJobStage | string | null;
  metadata?: Record<string, unknown>;
}

const NON_TERMINAL_STAGE_STATUSES = new Set<ImportUiStatus>([
  'reading',
  'parsing',
  'normalizing',
  'indexing',
  'linking',
  'processing',
]);

const PIPELINE_STATUS_ORDER: ImportUiStatus[] = [
  'queued',
  'reading',
  'parsing',
  'normalizing',
  'indexing',
  'linking',
  'done',
];

const STAGE_PERCENT_FLOORS: Partial<Record<ImportUiStatus, number>> = {
  queued: 0,
  reading: 3,
  parsing: 10,
  normalizing: 20,
  indexing: 35,
  linking: 90,
  done: 100,
};

function statusRank(status?: ImportUiStatus | null): number {
  if (!status) {
    return -1;
  }
  return PIPELINE_STATUS_ORDER.indexOf(status);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapImportJobStage(stage?: ImportJobStage | string | null): ImportUiStatus | null {
  if (!stage) {
    return null;
  }

  const normalized = String(stage).toUpperCase();
  switch (normalized) {
    case ImportJobStage.PARSE:
      return 'parsing';
    case ImportJobStage.CANONICALIZE:
      return 'normalizing';
    case ImportJobStage.SPAN_EXTRACT:
      return 'parsing';
    case ImportJobStage.NORMALIZE:
      return 'normalizing';
    case ImportJobStage.ATOMIC_EXTRACT:
      return 'indexing';
    case ImportJobStage.PACKET_DERIVE:
      return 'indexing';
    case ImportJobStage.MASS_SCORE:
      return 'indexing';
    case ImportJobStage.LAYER_LINK:
      return 'linking';
    case ImportJobStage.DEDUPE:
    case ImportJobStage.AWAIT_DECISIONS:
    case ImportJobStage.APPLY_DECISIONS:
      return 'linking';
    case ImportJobStage.MATERIALIZE:
    case ImportJobStage.INDEXING:
      return 'indexing';
    case ImportJobStage.OBJECTIVE_QUEUE:
      return 'linking';
    case ImportJobStage.OBJECTIVE_EXTRACT:
    case ImportJobStage.OBJECTIVE_VERIFY:
    case ImportJobStage.OBJECTIVE_PUBLISH:
      return 'processing';
    case ImportJobStage.OBJECTIVE_DONE:
      return 'done';
    case ImportJobStage.SUCCEEDED:
      return 'done';
    case ImportJobStage.FAILED:
    case ImportJobStage.CANCELED:
      return 'error';
    default:
      return null;
  }
}

function mapMessageToStatus(message?: string): ImportUiStatus | null {
  if (!message) {
    return null;
  }

  const text = message.toLowerCase();

  if (text.includes('queued') || text.includes('waiting to start')) {
    return 'queued';
  }
  if (text.includes('read')) {
    return 'reading';
  }
  if (text.includes('parse') || text.includes('analyz')) {
    return 'parsing';
  }
  if (text.includes('normaliz')) {
    return 'normalizing';
  }
  if (
    text.includes('index') ||
    text.includes('materializ') ||
    text.includes('saving to database') ||
    text.includes('saving data') ||
    text.includes('atomic') ||
    text.includes('mass')
  ) {
    return 'indexing';
  }
  if (
    text.includes('link') ||
    text.includes('duplicate') ||
    text.includes('dedup') ||
    text.includes('packet')
  ) {
    return 'linking';
  }
  if (text.includes('objective') || text.includes('archetype') || text.includes('verify')) {
    return 'processing';
  }
  if (text.includes('pause') || text.includes('blocked')) {
    return 'blocked';
  }
  if (text.includes('complete') || text.includes('done') || text.includes('succeed')) {
    return 'done';
  }
  if (text.includes('failed') || text.includes('error')) {
    return 'error';
  }

  return null;
}

function toPipelineStage(
  status: ImportUiStatus,
  fallback: ImportPipelineStageStatus
): ImportPipelineStageStatus {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'reading':
      return 'reading';
    case 'parsing':
      return 'parsing';
    case 'normalizing':
      return 'normalizing';
    case 'indexing':
      return 'indexing';
    case 'linking':
      return 'linking';
    case 'done':
      return 'done';
    case 'blocked':
      return fallback;
    case 'error':
      return 'done';
    case 'processing':
    default:
      return fallback;
  }
}

function previousPipelineStage(previousStatus?: ImportUiStatus): ImportPipelineStageStatus | null {
  if (!previousStatus) {
    return null;
  }

  if (NON_TERMINAL_STAGE_STATUSES.has(previousStatus)) {
    return toPipelineStage(previousStatus, 'parsing');
  }

  return null;
}

export function deriveImportProgress(input: DeriveImportProgressInput): DerivedImportProgress {
  const { backendStatus, jobType = 'import', progress, previousStatus } = input;
  const isImportJob = jobType === 'import';
  const stageFromSignal =
    mapImportJobStage(progress?.stage) ?? mapMessageToStatus(progress?.message) ?? null;
  const previousStage = previousPipelineStage(previousStatus) ?? 'parsing';

  if (backendStatus === 'succeeded') {
    return { status: 'done', stage: 'done' };
  }

  if (backendStatus === 'failed' || backendStatus === 'canceled') {
    return { status: 'error', stage: 'done' };
  }

  if (backendStatus === 'blocked') {
    const blockedStageSource =
      stageFromSignal &&
      stageFromSignal !== 'queued' &&
      stageFromSignal !== 'blocked' &&
      stageFromSignal !== 'done' &&
      stageFromSignal !== 'error'
        ? stageFromSignal
        : (previousStatus ?? 'parsing');

    // Preserve paused status while keeping the last meaningful stage for pipeline rendering.
    return {
      status: 'blocked',
      stage: toPipelineStage(blockedStageSource, previousStage),
    };
  }

  if (backendStatus === 'queued') {
    return { status: 'queued', stage: 'queued' };
  }

  if (backendStatus === 'running') {
    if (!isImportJob) {
      return { status: 'processing', stage: previousStage };
    }

    const candidateStatus =
      stageFromSignal &&
      stageFromSignal !== 'queued' &&
      stageFromSignal !== 'blocked' &&
      stageFromSignal !== 'done' &&
      stageFromSignal !== 'error'
        ? stageFromSignal
        : NON_TERMINAL_STAGE_STATUSES.has(previousStatus as ImportUiStatus)
          ? (previousStatus as ImportUiStatus)
          : 'parsing';

    const previousRunningStatus = NON_TERMINAL_STAGE_STATUSES.has(previousStatus as ImportUiStatus)
      ? (previousStatus as ImportUiStatus)
      : null;
    const runningStatus =
      previousRunningStatus && statusRank(previousRunningStatus) > statusRank(candidateStatus)
        ? previousRunningStatus
        : candidateStatus;

    return {
      status: runningStatus,
      stage: toPipelineStage(runningStatus, previousStage),
    };
  }

  const fallbackStatus: ImportUiStatus = isImportJob ? 'parsing' : 'processing';
  return { status: fallbackStatus, stage: toPipelineStage(fallbackStatus, previousStage) };
}

export function mapImportStatusToUploadStage(
  status: ImportUiStatus
): 'uploading' | 'detecting' | 'parsing' | 'analyzing' | 'ready' | 'error' {
  switch (status) {
    case 'queued':
      return 'uploading';
    case 'reading':
    case 'parsing':
      return 'parsing';
    case 'done':
      return 'ready';
    case 'error':
      return 'error';
    default:
      return 'analyzing';
  }
}

export function normalizeImportProgressPercent(input: NormalizeImportProgressPercentInput): number {
  const { backendStatus, status, rawPercent, previousPercent, stage, metadata } = input;

  if (backendStatus === 'succeeded' || status === 'done') {
    return 100;
  }

  let percent = clampPercent(rawPercent ?? previousPercent ?? 0);

  const floor = STAGE_PERCENT_FLOORS[status];
  if (backendStatus === 'running' || backendStatus === 'blocked') {
    if (typeof floor === 'number') {
      percent = Math.max(percent, floor);
    }
    if (status !== 'error') {
      percent = Math.min(percent, 99);
    }
  }

  if (
    Number.isFinite(previousPercent) &&
    backendStatus !== 'succeeded' &&
    backendStatus !== 'failed' &&
    backendStatus !== 'canceled'
  ) {
    percent = Math.max(percent, clampPercent(previousPercent as number));
  }

  // Stage-aware shaping for long-running canonicalize/link phases.
  // This keeps visual progress moving when heartbeats indicate active work.
  if (backendStatus === 'running' || backendStatus === 'blocked') {
    const normalizedStage = stage ? String(stage).toUpperCase() : '';
    const elapsedMsInBatchRaw = metadata?.elapsedMsInBatch;
    const elapsedMsInBatch = Number(elapsedMsInBatchRaw);

    if (Number.isFinite(elapsedMsInBatch) && elapsedMsInBatch > 0) {
      if (normalizedStage === ImportJobStage.LAYER_LINK) {
        const base = Math.max(percent, 96);
        const heartbeatBoost = Math.min(3, Math.floor(elapsedMsInBatch / (45 * 60 * 1000)));
        percent = Math.min(99, Math.max(percent, base + heartbeatBoost));
      } else if (normalizedStage === ImportJobStage.CANONICALIZE) {
        const heartbeatBoost = Math.min(3, Math.floor(elapsedMsInBatch / (10 * 60 * 1000)));
        percent = Math.min(95, Math.max(percent, percent + heartbeatBoost));
      }
    }
  }

  return clampPercent(percent);
}

export function isOperationActive(status: ImportUiStatus): boolean {
  return status !== 'done' && status !== 'error';
}
