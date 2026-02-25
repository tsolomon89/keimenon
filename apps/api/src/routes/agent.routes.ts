/**
 * Agent API Routes
 *
 * REST API for agent task management:
 * - POST /api/v1/agent/tasks - Create and execute a task
 * - GET /api/v1/agent/tasks - List task history
 * - GET /api/v1/agent/tasks/:id - Get task details
 * - DELETE /api/v1/agent/tasks/:id - Cancel a running task
 * - GET /api/v1/agent/types - List available task types
 * - GET /api/v1/agent/health - Health check
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAgentService, CreateTaskRequest } from '../services/agent-service.js';
import type { TaskType } from '@keimenon/agent-core';

const router = Router();

/**
 * Health check
 * GET /api/v1/agent/health
 */
router.get('/health', (_req: Request, res: Response) => {
  const agentService = getAgentService();
  res.json({
    status: 'ok',
    availableTypes: agentService.getAvailableTaskTypes(),
    runningTasks: agentService.getRunningTasks().length,
  });
});

/**
 * List available task types
 * GET /api/v1/agent/types
 */
router.get('/types', (_req: Request, res: Response) => {
  const agentService = getAgentService();
  const types = agentService.getAvailableTaskTypes();

  res.json({
    types: types.map(type => ({
      type,
      description: getTaskTypeDescription(type),
    })),
  });
});

/**
 * Create and execute a task
 * POST /api/v1/agent/tasks
 *
 * Body:
 * {
 *   type: 'GROUP_SUMMARY_BUILD' | 'DUPLICATE_SUGGEST' | 'VERIFY_SOURCE_CHAIN',
 *   input: { ... task-specific input ... },
 *   config?: { model_policy?: string, max_tokens?: number }
 * }
 */
router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountId = getAccountId(req);
    if (!accountId) {
      res.status(401).json({ error: 'Unauthorized: account_id required' });
      return;
    }

    const { type, input, config } = req.body;

    if (!type || !input) {
      res.status(400).json({ error: 'type and input are required' });
      return;
    }

    const agentService = getAgentService();

    if (!agentService.isTaskTypeAvailable(type)) {
      res.status(400).json({
        error: `Unknown task type: ${type}`,
        availableTypes: agentService.getAvailableTaskTypes(),
      });
      return;
    }

    const request: CreateTaskRequest = {
      type: type as TaskType,
      accountId,
      input,
      config,
    };

    // Execute task (synchronous for now - could be made async with SSE)
    const result = await agentService.executeTask(request);

    res.status(result.result.success ? 200 : 500).json({
      task: {
        id: result.task.id,
        type: result.task.type,
        status: result.task.status,
        created_at: result.task.created_at,
        completed_at: result.task.completed_at,
        error: result.task.error,
      },
      run: {
        id: result.run.id,
        attempt: result.run.attempt,
        status: result.run.status,
        metrics: result.run.metrics,
      },
      output: result.result.output,
      artifacts: result.result.artifacts,
      error: result.result.error,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List task history
 * GET /api/v1/agent/tasks
 */
router.get('/tasks', (req: Request, res: Response) => {
  const accountId = getAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: 'Unauthorized: account_id required' });
    return;
  }

  const agentService = getAgentService();
  const tasks = agentService.getTaskHistory(accountId);

  res.json({
    tasks: tasks.map(task => ({
      id: task.id,
      type: task.type,
      status: task.status,
      created_at: task.created_at,
      completed_at: task.completed_at,
      error: task.error,
    })),
    total: tasks.length,
  });
});

/**
 * Get task details
 * GET /api/v1/agent/tasks/:id
 */
router.get('/tasks/:id', (req: Request, res: Response) => {
  const accountId = getAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: 'Unauthorized: account_id required' });
    return;
  }

  const { id } = req.params;
  const agentService = getAgentService();
  const tasks = agentService.getTaskHistory(accountId);
  const task = tasks.find(t => t.id === id);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

/**
 * Cancel a running task
 * DELETE /api/v1/agent/tasks/:id
 */
router.delete('/tasks/:id', (req: Request, res: Response) => {
  const accountId = getAccountId(req);
  if (!accountId) {
    res.status(401).json({ error: 'Unauthorized: account_id required' });
    return;
  }

  const { id } = req.params;
  const agentService = getAgentService();

  const cancelled = agentService.cancelTask(id);

  if (cancelled) {
    res.json({ success: true, message: 'Task cancellation requested' });
  } else {
    res.status(404).json({ error: 'Task not found or not running' });
  }
});

/**
 * Get account ID from request
 * In production, this would come from JWT or session
 */
function getAccountId(req: Request): string | null {
  // Try various sources for account ID
  const accountId =
    req.headers['x-account-id'] as string ||
    (req as any).user?.accountId ||
    (req as any).account?.id ||
    req.query.account_id as string;

  return accountId || null;
}

/**
 * Get task type description
 */
function getTaskTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    GROUP_SUMMARY_BUILD: 'Generate a canonical summary document from group sources',
    DUPLICATE_SUGGEST: 'Propose duplicate clusters with similarity scores (does not auto-merge)',
    VERIFY_SOURCE_CHAIN: 'Create evidence chains from web search (Pro+ feature)',
  };
  return descriptions[type] || 'Unknown task type';
}

export default router;
