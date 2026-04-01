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
import {
  featureManifestForAccountClass,
  type AccountClass,
  type FeatureManifest,
} from '@keimenon/types';
import type { ToolStatus } from '@keimenon/agent-core';

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

  router.get('/types', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const agentService = getAgentService();
      await agentService.getHealth();
      const types = agentService.getAvailableTaskTypes();

      res.json({
        types: types.map((type) => ({
          type,
          description: getTaskTypeDescription(type),
        })),
      });
    } catch (error) {
      next(error);
    }
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

      const accountClass = getAccountClass(req);
      const features = featureManifestForAccountClass(accountClass);

      const { type, input, config } = req.body;
      if (!type || typeof input === 'undefined') {
        res.status(400).json({ error: 'type and input are required' });
        return;
      }

      const taskType = String(type);

      const taskEntitlementError = getTaskEntitlementError(taskType, features);
      if (taskEntitlementError) {
        res.status(403).json(taskEntitlementError);
        return;
      }

      const agentService = getAgentService();
      await agentService.getHealth();

      if (!agentService.isTaskTypeAvailable(taskType)) {
        res.status(400).json({ error: `Unknown task type: ${taskType}` });
        return;
      }

      const requiredProviders = getRequiredProvidersForTask(taskType);
      const unavailableProviders = getUnavailableProviders(
        agentService.getToolStatus(),
        requiredProviders
      );
      if (unavailableProviders.length > 0) {
        const providers = unavailableProviders.map((provider) => provider.provider);
        res.status(503).json({
          error: 'Provider unavailable',
          code: 'PROVIDER_UNAVAILABLE',
          status: 503,
          taskType,
          retryable: true,
          provider: providers.length === 1 ? providers[0] : undefined,
          providers,
          requiredProviders,
          unavailableProviders,
        });
        return;
      }

      const request: CreateTaskRequest = {
        type: taskType,
        accountId,
        input,
        config,
      };

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

      const accountClass = getAccountClass(req);
      const features = featureManifestForAccountClass(accountClass);
      const { id } = req.params;
      const agentService = getAgentService();
      const task = await agentService.getTask(id);
      if (!task || task.account_id !== accountId) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const taskEntitlementError = getTaskEntitlementError(task.type, features);
      if (taskEntitlementError) {
        res.status(403).json(taskEntitlementError);
        return;
      }

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

function getAccountClass(req: Request): AccountClass {
  const rawAccountClass = req.user?.accountClass;
  if (
    rawAccountClass === 'free' ||
    rawAccountClass === 'professional' ||
    rawAccountClass === 'business'
  ) {
    return rawAccountClass;
  }
  return 'free';
}

function getTaskEntitlementError(
  taskType: string,
  features: FeatureManifest
): {
  error: string;
  requiredFeature?: string;
  requiredFeatures?: string[];
} | null {
  if (!features.agent_runtime) {
    return {
      error: 'Agent runtime is not enabled for this account tier',
      requiredFeature: 'agent_runtime',
    };
  }

  if (taskType === 'VERIFY_SOURCE_CHAIN' || taskType === 'VERIFY_TOPIC') {
    if (!features.objective_layer || !features.external_research) {
      return {
        error: `${taskType} requires objective layer + external research entitlements`,
        requiredFeatures: ['objective_layer', 'external_research'],
      };
    }
  }

  if (taskType === 'VERIFY_TOPIC' && !features.proof_verification) {
    return {
      error: 'VERIFY_TOPIC requires proof verification entitlement',
      requiredFeatures: ['proof_verification'],
    };
  }

  return null;
}

function getTaskTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    GROUP_SUMMARY_BUILD: 'Generate a canonical summary document from group sources',
    DUPLICATE_SUGGEST: 'Propose duplicate clusters with similarity scores (does not auto-merge)',
    VERIFY_SOURCE_CHAIN: 'Create evidence chains from web search (Pro+ feature)',
    ANALYZE_SOURCE: 'Analyze a source with LLM and produce structured claims/tags',
    VERIFY_TOPIC: 'Verify a topic with external evidence and credibility scoring',
  };
  return descriptions[type] || 'Unknown task type';
}

function getRequiredProvidersForTask(taskType: string): Array<'llm' | 'web'> {
  switch (taskType) {
    case 'GROUP_SUMMARY_BUILD':
    case 'ANALYZE_SOURCE':
      return ['llm'];
    case 'VERIFY_SOURCE_CHAIN':
    case 'VERIFY_TOPIC':
      return ['llm', 'web'];
    default:
      return [];
  }
}

function getUnavailableProviders(
  toolStatus: ToolStatus[],
  requiredProviders: Array<'llm' | 'web'>
): Array<{ provider: 'llm' | 'web'; reason: string }> {
  const unavailable: Array<{ provider: 'llm' | 'web'; reason: string }> = [];

  for (const provider of requiredProviders) {
    const status = toolStatus.find((tool) => tool.name === provider);
    if (!status || !status.available) {
      unavailable.push({
        provider,
        reason: status?.error || `${provider} provider unavailable`,
      });
    }
  }

  return unavailable;
}

export default createAgentRoutes();
