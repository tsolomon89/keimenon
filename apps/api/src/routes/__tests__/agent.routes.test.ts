import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAgentRoutes } from '../agent.routes';

const { mockAgentService } = vi.hoisted(() => ({
  mockAgentService: {
    getAvailableTaskTypes: vi.fn(),
    getRunningTasks: vi.fn(),
    getHealth: vi.fn(),
    executeTask: vi.fn(),
    retryTask: vi.fn(),
    getTaskHistory: vi.fn(),
    getTaskDetails: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
    isTaskTypeAvailable: vi.fn(),
    getToolStatus: vi.fn(),
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
        accountClass: 'professional',
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
      'ANALYZE_SOURCE',
      'VERIFY_TOPIC',
    ]);
    mockAgentService.isTaskTypeAvailable.mockReturnValue(true);
    mockAgentService.getToolStatus.mockReturnValue([
      { name: 'llm', available: true, provider: 'litellm' },
      { name: 'web', available: true, provider: 'searxng' },
    ]);
    mockAgentService.getRunningTasks.mockReturnValue([]);
    mockAgentService.getHealth.mockResolvedValue({
      status: 'ok',
      availableTypes: [
        'GROUP_SUMMARY_BUILD',
        'DUPLICATE_SUGGEST',
        'ANALYZE_SOURCE',
        'VERIFY_TOPIC',
      ],
      runningTasks: 0,
      tools: [],
      degraded: false,
      degradedReasons: [],
    });
  });

  it('GET /health returns runtime status', async () => {
    const app = buildApp();

    const response = await request(app).get('/api/v1/agent/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.availableTypes).toEqual([
      'GROUP_SUMMARY_BUILD',
      'DUPLICATE_SUGGEST',
      'ANALYZE_SOURCE',
      'VERIFY_TOPIC',
    ]);
  });

  it('GET /api/v1/agents/* legacy path is not exposed', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/agents/health').expect(404);
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
    mockAgentService.getTask.mockResolvedValue({
      id: 'task_1',
      account_id: 'acc_1',
      type: 'DUPLICATE_SUGGEST',
      status: 'failed',
    });
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

  it('POST /tasks/:id/retry returns 403 when runtime entitlement is missing', async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = {
        accountId: 'acc_1',
        accountClass: 'free',
      };
      next();
    });
    app.use('/api/v1/agent', createAgentRoutes());

    mockAgentService.getTask.mockResolvedValue({
      id: 'task_1',
      account_id: 'acc_1',
      type: 'DUPLICATE_SUGGEST',
      status: 'failed',
    });

    const response = await request(app)
      .post('/api/v1/agent/tasks/task_1/retry')
      .send({})
      .expect(403);

    expect(response.body.requiredFeature).toBe('agent_runtime');
    expect(mockAgentService.retryTask).not.toHaveBeenCalled();
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

  it('POST /tasks returns 503 when required providers are unavailable', async () => {
    const app = buildApp();
    mockAgentService.getToolStatus.mockReturnValue([
      { name: 'llm', available: false, error: 'LiteLLM not configured' },
      { name: 'web', available: true, provider: 'searxng' },
    ]);

    const response = await request(app)
      .post('/api/v1/agent/tasks')
      .send({
        type: 'ANALYZE_SOURCE',
        input: { sourceId: 'src_1' },
      })
      .expect(503);

    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
    expect(response.body.taskType).toBe('ANALYZE_SOURCE');
    expect(response.body.retryable).toBe(true);
    expect(response.body.providers).toEqual(['llm']);
    expect(response.body.provider).toBe('llm');
    expect(mockAgentService.executeTask).not.toHaveBeenCalled();
  });
});
