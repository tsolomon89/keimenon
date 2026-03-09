import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAgentRoutes } from '../agent.routes';

const { mockAgentService } = vi.hoisted(() => ({
  mockAgentService: {
    getAvailableTaskTypes: vi.fn(),
    getRunningTasks: vi.fn(),
    executeTask: vi.fn(),
    retryTask: vi.fn(),
    getTaskHistory: vi.fn(),
    getTaskDetails: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
  },
}));

vi.mock('../../services/agent-service', () => ({
  getAgentService: () => mockAgentService,
}));

function buildApp(withUser = true): express.Application {
  const app = express();
  app.use(express.json());

  if (withUser) {
    app.use((req: any, _res, next) => {
      req.user = {
        accountId: 'acc_1',
      };
      next();
    });
  }

  app.use('/api/v1/agent', createAgentRoutes());
  return app;
}

describe('Agent Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentService.getAvailableTaskTypes.mockReturnValue([
      'GROUP_SUMMARY_BUILD',
      'DUPLICATE_SUGGEST',
    ]);
    mockAgentService.getRunningTasks.mockReturnValue([]);
  });

  it('GET /health returns runtime status', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/v1/agent/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.availableTypes).toEqual(['GROUP_SUMMARY_BUILD', 'DUPLICATE_SUGGEST']);
  });

  it('POST /tasks enqueues task and returns 202', async () => {
    const app = buildApp();
    mockAgentService.executeTask.mockResolvedValue({
      task: {
        id: 'task_1',
        type: 'DUPLICATE_SUGGEST',
        status: 'pending',
        created_at: Date.now(),
      },
    });

    const response = await request(app)
      .post('/api/v1/agent/tasks')
      .send({
        type: 'DUPLICATE_SUGGEST',
        input: { scope: 'group', scopeId: 'grp_1' },
      })
      .expect(202);

    expect(mockAgentService.executeTask).toHaveBeenCalledWith({
      type: 'DUPLICATE_SUGGEST',
      accountId: 'acc_1',
      input: { scope: 'group', scopeId: 'grp_1' },
      config: undefined,
    });
    expect(response.body.task.id).toBe('task_1');
  });

  it('POST /tasks/:id/retry enqueues retry and returns 202', async () => {
    const app = buildApp();
    mockAgentService.retryTask.mockResolvedValue({
      task: {
        id: 'task_2',
        type: 'DUPLICATE_SUGGEST',
        status: 'pending',
        created_at: Date.now(),
      },
    });

    await request(app).post('/api/v1/agent/tasks/task_1/retry').send({}).expect(202);

    expect(mockAgentService.retryTask).toHaveBeenCalledWith('task_1', 'acc_1');
  });

  it('GET /tasks returns task history for current account', async () => {
    const app = buildApp();
    mockAgentService.getTaskHistory.mockResolvedValue([
      {
        id: 'task_1',
        type: 'DUPLICATE_SUGGEST',
        status: 'completed',
        created_at: Date.now(),
      },
    ]);

    const response = await request(app).get('/api/v1/agent/tasks').expect(200);
    expect(mockAgentService.getTaskHistory).toHaveBeenCalledWith('acc_1');
    expect(response.body.total).toBe(1);
  });

  it('GET /tasks/:id returns task details', async () => {
    const app = buildApp();
    mockAgentService.getTaskDetails.mockResolvedValue({
      task: {
        id: 'task_1',
        account_id: 'acc_1',
        type: 'DUPLICATE_SUGGEST',
        status: 'completed',
      },
      runs: [{ id: 'run_1', task_id: 'task_1', status: 'completed' }],
      artifacts: [],
    });

    const response = await request(app).get('/api/v1/agent/tasks/task_1').expect(200);
    expect(response.body.task.id).toBe('task_1');
    expect(response.body.runs).toHaveLength(1);
  });

  it('DELETE /tasks/:id cancels running task', async () => {
    const app = buildApp();
    mockAgentService.getTask.mockResolvedValue({
      id: 'task_1',
      account_id: 'acc_1',
      status: 'running',
    });
    mockAgentService.cancelTask.mockResolvedValue(true);

    await request(app).delete('/api/v1/agent/tasks/task_1').expect(200);
    expect(mockAgentService.cancelTask).toHaveBeenCalledWith('task_1');
  });

  it('returns 401 on protected task endpoints without account context', async () => {
    const app = buildApp(false);
    await request(app)
      .post('/api/v1/agent/tasks')
      .send({ type: 'DUPLICATE_SUGGEST', input: { scope: 'group', scopeId: 'grp_1' } })
      .expect(401);
  });
});
