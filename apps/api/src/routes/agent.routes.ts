/**
 * Agent API Routes
 *
 * /api/v1/agent/*
 * - POST /tasks
 * - POST /tasks/:id/retry
 * - GET /tasks
 * - GET /tasks/:id
 * - DELETE /tasks/:id
 * - GET /types
 * - GET /health
 * - GET /events (SSE)
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { AuthServiceV2 } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { getAgentService, type CreateTaskRequest } from '../services/agent-service';
import { featureManifestForAccountClass } from '@keimenon/types';

export function createAgentRoutes(authService?: AuthServiceV2): Router {
  const router = Router();

  if (authService) {
    router.use(requireAuth(authService));
  }

  router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const agentService = getAgentService();
      const health = await agentService.getHealth();
      res.json(health);
    } catch (error) {
      next(error);
    }
  });

  router.get('/types', (_req: Request, res: Response) => {
    const agentService = getAgentService();
    const types = agentService.getAvailableTaskTypes();

    res.json({
      types: types.map((type) => ({
        type,
        description: getTaskTypeDescription(type),
      })),
    });
  });

  router.get('/events', (req: Request, res: Response) => {
    const accountId = getAccountId(req);
    if (!accountId) {
      res.status(401).json({ error: 'Unauthorized: account_id required' });
      return;
    }

    const taskIdFilter = typeof req.query.taskId === 'string' ? req.query.taskId : undefined;
    const agentService = getAgentService();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write(`event: connected\n`);
    res.write(
      `data: ${JSON.stringify({ type: 'connected', accountId, timestamp: Date.now() })}\n\n`
    );

    const unsubscribe = agentService.subscribe((event) => {
      if ('taskId' in event && taskIdFilter && event.taskId !== taskIdFilter) {
        return;
      }

      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = getAccountId(req);
      if (!accountId) {
        res.status(401).json({ error: 'Unauthorized: account_id required' });
        return;
      }

      const accountClass = (req.user?.accountClass || 'free') as
        | 'free'
        | 'professional'
        | 'business';
      const features = featureManifestForAccountClass(accountClass);

      const { type, input, config } = req.body;
      if (!type || !input) {
        res.status(400).json({ error: 'type and input are required' });
        return;
      }

      if (!features.agent_runtime) {
        res.status(403).json({
          error: 'Agent runtime is not enabled for this account tier',
          requiredFeature: 'agent_runtime',
        });
        return;
      }

      if (String(type) === 'VERIFY_SOURCE_CHAIN') {
        if (!features.objective_layer || !features.external_research) {
          res.status(403).json({
            error: 'VERIFY_SOURCE_CHAIN requires objective layer + external research entitlements',
            requiredFeatures: ['objective_layer', 'external_research'],
          });
          return;
        }
      }

      const request: CreateTaskRequest = {
        type,
        accountId,
        input,
        config,
      };

      const agentService = getAgentService();
      const result = await agentService.executeTask(request);

      res.status(202).json({
        task: {
          id: result.task.id,
          type: result.task.type,
          status: result.task.status,
          created_at: result.task.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/tasks/:id/retry', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = getAccountId(req);
      if (!accountId) {
        res.status(401).json({ error: 'Unauthorized: account_id required' });
        return;
      }

      const { id } = req.params;
      const agentService = getAgentService();
      const result = await agentService.retryTask(id, accountId);

      res.status(202).json({
        task: {
          id: result.task.id,
          type: result.task.type,
          status: result.task.status,
          created_at: result.task.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = getAccountId(req);
      if (!accountId) {
        res.status(401).json({ error: 'Unauthorized: account_id required' });
        return;
      }

      const agentService = getAgentService();
      const tasks = await agentService.getTaskHistory(accountId);

      res.json({
        tasks: tasks.map((task) => ({
          id: task.id,
          type: task.type,
          status: task.status,
          created_at: task.created_at,
          started_at: task.started_at,
          completed_at: task.completed_at,
          error: task.error,
        })),
        total: tasks.length,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = getAccountId(req);
      if (!accountId) {
        res.status(401).json({ error: 'Unauthorized: account_id required' });
        return;
      }

      const { id } = req.params;
      const agentService = getAgentService();
      const details = await agentService.getTaskDetails(id);

      if (!details) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (details.task.account_id !== accountId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json({
        task: details.task,
        runs: details.runs,
        artifacts: details.artifacts,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = getAccountId(req);
      if (!accountId) {
        res.status(401).json({ error: 'Unauthorized: account_id required' });
        return;
      }

      const { id } = req.params;
      const agentService = getAgentService();
      const task = await agentService.getTask(id);

      if (!task || task.account_id !== accountId) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const cancelled = await agentService.cancelTask(id);
      if (!cancelled) {
        res.status(409).json({ error: 'Task is not running' });
        return;
      }

      res.json({ success: true, message: 'Task cancellation requested' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function getAccountId(req: Request): string | null {
  return (
    req.user?.accountId ||
    (req.headers['x-account-id'] as string) ||
    (req.query.account_id as string) ||
    null
  );
}

function getTaskTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    GROUP_SUMMARY_BUILD: 'Generate a canonical summary document from group sources',
    DUPLICATE_SUGGEST: 'Propose duplicate clusters with similarity scores (does not auto-merge)',
    VERIFY_SOURCE_CHAIN: 'Create evidence chains from web search (Pro+ feature)',
  };
  return descriptions[type] || 'Unknown task type';
}

export default createAgentRoutes();
