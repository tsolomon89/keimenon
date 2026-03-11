import type { AgentEvent } from '@keimenon/agent-core';
import { ImportJobStage, IMPORT_STAGE_LABELS } from '@keimenon/types';
import { appLogger } from '../utils/logger';
import type { AgentService } from './agent-service';
import type { Job } from '../modules/jobs/domain/Job';
import type { SQLiteJobRepository } from '../modules/jobs/infrastructure/JobRepository';
import type { SSEBroadcaster } from '../modules/jobs/infrastructure/SSEBroadcaster';

type ObjectiveBridgeStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

type ObjectiveStageUpdate = {
  stage: ImportJobStage;
  message: string;
  objectiveStatus: ObjectiveBridgeStatus;
  percent: number;
  shouldPersist: boolean;
};

function mapObjectiveStage(event: AgentEvent): ObjectiveStageUpdate | null {
  switch (event.type) {
    case 'task:started':
      return {
        stage: ImportJobStage.OBJECTIVE_EXTRACT,
        message: IMPORT_STAGE_LABELS[ImportJobStage.OBJECTIVE_EXTRACT],
        objectiveStatus: 'running',
        percent: 99,
        shouldPersist: true,
      };
    case 'task:progress': {
      const percent = Number.isFinite(event.percent) ? event.percent : 0;
      if (percent >= 95) {
        return {
          stage: ImportJobStage.OBJECTIVE_PUBLISH,
          message: event.message || IMPORT_STAGE_LABELS[ImportJobStage.OBJECTIVE_PUBLISH],
          objectiveStatus: 'running',
          percent: 99,
          shouldPersist: true,
        };
      }
      if (percent >= 55) {
        return {
          stage: ImportJobStage.OBJECTIVE_VERIFY,
          message: event.message || IMPORT_STAGE_LABELS[ImportJobStage.OBJECTIVE_VERIFY],
          objectiveStatus: 'running',
          percent: 99,
          shouldPersist: true,
        };
      }
      return {
        stage: ImportJobStage.OBJECTIVE_EXTRACT,
        message: event.message || IMPORT_STAGE_LABELS[ImportJobStage.OBJECTIVE_EXTRACT],
        objectiveStatus: 'running',
        percent: 99,
        shouldPersist: false,
      };
    }
    case 'task:completed':
      return {
        stage: ImportJobStage.OBJECTIVE_DONE,
        message: IMPORT_STAGE_LABELS[ImportJobStage.OBJECTIVE_DONE],
        objectiveStatus: 'completed',
        percent: 100,
        shouldPersist: true,
      };
    case 'task:failed':
      return {
        stage: ImportJobStage.OBJECTIVE_DONE,
        message: `Objective build failed: ${event.error}`,
        objectiveStatus: 'failed',
        percent: 100,
        shouldPersist: true,
      };
    case 'task:cancelled':
      return {
        stage: ImportJobStage.OBJECTIVE_DONE,
        message: event.reason
          ? `Objective build cancelled: ${event.reason}`
          : 'Objective build cancelled',
        objectiveStatus: 'cancelled',
        percent: 100,
        shouldPersist: true,
      };
    default:
      return null;
  }
}

export function initializeObjectiveBuildJobBridge(
  agentService: AgentService,
  jobRepository: SQLiteJobRepository,
  broadcaster: SSEBroadcaster
): () => void {
  const taskToJobRef = new Map<string, { jobId: string; accountId: string }>();
  const lastStageByTaskId = new Map<string, ImportJobStage>();
  const terminalTaskStatuses = new Set<ObjectiveBridgeStatus>(['completed', 'failed', 'cancelled']);

  const resolveJobForTask = async (taskId: string): Promise<Job | null> => {
    const cached = taskToJobRef.get(taskId);
    if (cached) {
      const cachedJob = await jobRepository.findById(cached.jobId, cached.accountId);
      if (cachedJob) {
        return cachedJob;
      }
      taskToJobRef.delete(taskId);
    }

    const linkedJob = await jobRepository.findByObjectiveBuildTaskId(taskId);
    if (!linkedJob) {
      return null;
    }

    taskToJobRef.set(taskId, { jobId: linkedJob.id, accountId: linkedJob.accountId });
    return linkedJob;
  };

  const handleAgentEvent = async (event: AgentEvent): Promise<void> => {
    if (!('taskId' in event)) {
      return;
    }

    const mapped = mapObjectiveStage(event);
    if (!mapped) {
      return;
    }

    const job = await resolveJobForTask(event.taskId);
    if (!job) {
      return;
    }

    const lastStage = lastStageByTaskId.get(event.taskId);
    const stageChanged = lastStage !== mapped.stage;
    const shouldEmit = stageChanged || terminalTaskStatuses.has(mapped.objectiveStatus);

    if (!shouldEmit) {
      return;
    }

    lastStageByTaskId.set(event.taskId, mapped.stage);

    const objectiveMetadata = {
      taskId: event.taskId,
      stage: mapped.stage,
      status: mapped.objectiveStatus,
      updatedAt: event.timestamp,
      message: mapped.message,
    };

    if (mapped.shouldPersist) {
      job.updateStateMetadata({
        objectiveBuild: objectiveMetadata,
      });
      await jobRepository.save(job);
    }

    broadcaster.broadcastJobUpdate({
      id: job.id,
      accountId: job.accountId,
      type: job.type,
      status: job.status,
      progress: {
        current: mapped.percent,
        total: 100,
        percent: mapped.percent,
        message: mapped.message,
        stage: mapped.stage,
        metadata: {
          ...(job.progress.metadata || {}),
          objectiveBuildTaskId: event.taskId,
          objectiveBuildStatus: mapped.objectiveStatus,
          objectiveBuildUpdatedAt: event.timestamp,
        },
      },
      state: job.state,
      stats: job.stats,
      config: job.config,
    } as any);

    if (terminalTaskStatuses.has(mapped.objectiveStatus)) {
      taskToJobRef.delete(event.taskId);
      lastStageByTaskId.delete(event.taskId);
    }
  };

  const unsubscribe = agentService.subscribe((event) => {
    void handleAgentEvent(event).catch((error) => {
      appLogger.warn('objective.bridge.event_failed', {
        message: error instanceof Error ? error.message : String(error),
        eventType: event.type,
      });
    });
  });

  appLogger.info('objective.bridge.initialized');

  return () => {
    unsubscribe();
    taskToJobRef.clear();
    lastStageByTaskId.clear();
    appLogger.info('objective.bridge.stopped');
  };
}
