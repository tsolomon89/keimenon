import { describe, expect, it, vi } from 'vitest';
import { Job } from '../../modules/jobs/domain/Job';
import { ImportJobStage } from '@keimenon/types';
import { initializeObjectiveBuildJobBridge } from '../objective-build-job-bridge';

function createCompletedImportJob(taskId: string): Job {
  const job = Job.create({
    type: 'import',
    accountId: 'acc_test',
    createdBy: 'user_test',
    config: {},
  });
  job.start();
  job.succeed('import complete');
  job.updateStateMetadata({
    objectiveBuildTaskId: taskId,
  });
  return job;
}

describe('objective-build-job-bridge', () => {
  it('maps objective task lifecycle events into jobs SSE stages', async () => {
    const taskId = 'task_objective_1';
    const job = createCompletedImportJob(taskId);

    const saves: string[] = [];
    const broadcasts: Array<{ stage?: string; message?: string }> = [];
    let handler: ((event: any) => void) | null = null;

    const mockAgentService = {
      subscribe: vi.fn((fn: (event: any) => void) => {
        handler = fn;
        return vi.fn();
      }),
    } as any;

    const mockJobRepository = {
      findByObjectiveBuildTaskId: vi.fn(async (id: string) => (id === taskId ? job : null)),
      findById: vi.fn(async () => job),
      save: vi.fn(async (updatedJob: Job) => {
        const status = (updatedJob.state.metadata as any)?.objectiveBuild?.status;
        if (status) {
          saves.push(status);
        }
      }),
    } as any;

    const mockBroadcaster = {
      broadcastJobUpdate: vi.fn((payload: any) => {
        broadcasts.push({
          stage: payload?.progress?.stage,
          message: payload?.progress?.message,
        });
      }),
    } as any;

    const stop = initializeObjectiveBuildJobBridge(
      mockAgentService,
      mockJobRepository,
      mockBroadcaster
    );

    expect(handler).not.toBeNull();

    handler?.({
      type: 'task:started',
      taskId,
      taskType: 'VERIFY_SOURCE_CHAIN',
      timestamp: Date.now(),
    });

    await vi.waitFor(() => {
      expect(broadcasts.length).toBe(1);
    });
    expect(broadcasts[0].stage).toBe(ImportJobStage.OBJECTIVE_EXTRACT);

    handler?.({
      type: 'task:progress',
      taskId,
      percent: 70,
      message: 'verifying',
      timestamp: Date.now(),
    });

    await vi.waitFor(() => {
      expect(broadcasts.length).toBe(2);
    });
    expect(broadcasts[1].stage).toBe(ImportJobStage.OBJECTIVE_VERIFY);

    handler?.({
      type: 'task:completed',
      taskId,
      artifacts: [],
      timestamp: Date.now(),
    });

    await vi.waitFor(() => {
      expect(broadcasts.length).toBe(3);
    });
    expect(broadcasts[2].stage).toBe(ImportJobStage.OBJECTIVE_DONE);
    expect(saves).toContain('running');
    expect(saves).toContain('completed');

    stop();
  });
});
