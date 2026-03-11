/**
 * Jobs Stream API Routes
 *
 * Server-Sent Events (SSE) endpoint for real-time job updates.
 *
 * Endpoint:
 * - GET /api/v1/stream/jobs - Subscribe to job updates for authenticated account
 *
 * Events:
 * - connected: Initial connection confirmation
 * - jobs.update: Batch of job updates (coalesced at ~2Hz)
 * - heartbeat: Keep-alive ping every 30s
 *
 * Related: Product Directive - "Single realtime channel per account"
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { SSEBroadcaster } from './SSEBroadcaster';
import { appLogger } from '../../../utils/logger';

/**
 * Factory function to create stream routes
 */
export function createStreamRoutes(authService: AuthService, broadcaster: SSEBroadcaster): Router {
  const router = Router();

  /**
   * GET /api/v1/stream/jobs
   * Subscribe to real-time job updates via SSE
   *
   * Auth (one of):
   * - Headers: Authorization: Bearer <token>
   * - Query: ?token=<token>
   *
   * Events:
   * - connected: { accountId, timestamp, message }
   * - jobs.update: { jobs: [...], timestamp }
   * - heartbeat: { timestamp }
   */
  router.get('/jobs', async (req: Request, res: Response): Promise<void> => {
    // Support both header and query param auth for EventSource compatibility
    const tokenFromQuery = req.query.token as string;
    const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '');
    const token = tokenFromQuery || tokenFromHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Validate token
    try {
      const payload = await authService.verifyToken(token);
      if (!payload) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      // Attach user info to request (similar to requireAuth middleware)
      (req as any).user = {
        userId: payload.userId,
        accountId: payload.accountId,
        email: payload.email,
        permissionLevel: payload.permissionLevel,
      };

      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Setup SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Add connection to broadcaster
      broadcaster.addConnection(targetAccountId, res);

      appLogger.debug('sse.stream.connected', {
        accountId: targetAccountId,
      });

      // Connection will be automatically removed when client disconnects
      // (handled by broadcaster's close event listener)

      // Note: SSE connection stays open - no explicit return needed
      // The broadcaster will write events to this response stream
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
      });
      return;
    }
  });

  return router;
}
