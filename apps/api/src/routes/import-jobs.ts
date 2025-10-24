/**
 * Import Jobs API
 *
 * Provides endpoints to query active and completed import jobs.
 * Used by ImportsTableCard to display live import status.
 *
 * Endpoints:
 * - GET /api/v1/import/jobs - List recent/active imports for the authenticated user
 * - GET /api/v1/import/jobs/:uploadId - Get specific import job details
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { streamingUploadService } from '../services/streaming-upload';

export type ImportJobStatus =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'done'
  | 'error';

export interface ImportJob {
  id: string; // uploadId
  fileName: string;
  fileType: 'chat' | 'document' | 'mixed' | 'unknown';
  platform?: 'chatgpt' | 'claude' | 'gemini' | 'unknown';
  status: ImportJobStatus;
  progress: number; // 0-100
  startedAt: number;
  completedAt?: number;
  stats: {
    nodesCreated: number;
    edgesCreated: number;
    sourcesCreated: number;
    conversationsProcessed: number;
  };
  error?: string;
  accountId: string;
  userId: string;
}

/**
 * Factory function to create import jobs routes with auth
 */
export function createImportJobsRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/import/jobs
   * Get list of recent/active import jobs
   *
   * Supports operating context:
   * - Admin (no operating context): see their own imports
   * - Admin (in CRM mode): see target account's imports (if linked)
   * - Client users: see their own account's imports
   *
   * Query params:
   * - limit: number (default: 50, max: 100)
   * - status: 'active' | 'completed' | 'all' (default: 'all')
   *
   * Returns:
   * - jobs: Array of ImportJob objects
   */
  router.get('/', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const accountType = (req as any).user?.accountType;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;
      const isAdmin = accountType === 'admin';

      // If admin is viewing a different account, verify they have access
      if (isAdmin && operating && operating.accountId !== userAccountId) {
        // TODO: Verify admin has link to target account via account_links table
        // For now, we trust the requireAuth middleware already validated this
        // in auth.middleware.ts lines 84-90
      }

      // Parse query params
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const statusFilter = (req.query.status as string) || 'all';

      // Get upload statuses from streaming-upload service for target account
      // NOTE: streaming-upload service currently tracks uploads in-memory
      // In production, this should query from database for persistence
      const uploads = streamingUploadService.getRecentUploads(targetAccountId, limit);

      // Filter by status if requested
      let filteredUploads = uploads;
      if (statusFilter === 'active') {
        filteredUploads = uploads.filter(
          (u) => u.status === 'processing' || u.status === 'pending'
        );
      } else if (statusFilter === 'completed') {
        filteredUploads = uploads.filter((u) => u.status === 'complete' || u.status === 'error');
      }

      // Map to ImportJob format
      const jobs: ImportJob[] = filteredUploads.map((upload) => ({
        id: upload.uploadId,
        fileName: upload.fileName,
        fileType: detectFileType(upload.fileName),
        status: mapStatus(upload.status),
        progress: upload.progress || 0,
        startedAt: upload.startedAt || 0,
        completedAt: upload.completedAt || 0,
        stats: upload.stats || {
          nodesCreated: 0,
          edgesCreated: 0,
          sourcesCreated: 0,
          conversationsProcessed: 0,
        },
        error: upload.error,
        accountId: upload.accountId || '',
        userId: upload.userId || '',
      }));

      return res.json({
        success: true,
        jobs,
        total: jobs.length,
      });
    } catch (error: any) {
      console.error('Error fetching import jobs:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch import jobs',
      });
    }
  });

  /**
   * GET /api/v1/import/jobs/:uploadId
   * Get specific import job details
   *
   * Supports operating context:
   * - Admin (in CRM mode): can view client imports if linked
   * - Client users: can only view their own account's imports
   *
   * Returns:
   * - job: ImportJob object
   */
  router.get('/:uploadId', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const accountType = (req as any).user?.accountType;
      const operating = (req as any).operating;
      const { uploadId } = req.params;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;
      const isAdmin = accountType === 'admin';

      // Get upload status from streaming-upload service
      const upload = streamingUploadService.getUploadStatus(uploadId);

      if (!upload) {
        return res.status(404).json({
          success: false,
          error: 'Import job not found',
        });
      }

      // Verify access (security check)
      // Allow if: upload belongs to target account (respects operating context)
      if (upload.accountId !== targetAccountId) {
        // If admin, check if they're viewing via CRM mode
        if (isAdmin && operating && upload.accountId === operating.accountId) {
          // Admin is viewing client account's import - this is allowed
        } else {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
          });
        }
      }

      // Map to ImportJob format
      const job: ImportJob = {
        id: upload.uploadId,
        fileName: upload.fileName,
        fileType: detectFileType(upload.fileName),
        status: mapStatus(upload.status),
        progress: upload.progress || 0,
        startedAt: upload.startedAt || 0,
        completedAt: upload.completedAt || 0,
        stats: upload.stats || {
          nodesCreated: 0,
          edgesCreated: 0,
          sourcesCreated: 0,
          conversationsProcessed: 0,
        },
        error: upload.error,
        accountId: upload.accountId || '',
        userId: upload.userId || '',
      };

      return res.json({
        success: true,
        job,
      });
    } catch (error: any) {
      console.error('Error fetching import job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch import job',
      });
    }
  });

  return router;
}

/**
 * Detect file type from filename
 */
function detectFileType(fileName: string): 'chat' | 'document' | 'mixed' | 'unknown' {
  const lower = fileName.toLowerCase();

  // Chat export patterns
  if (lower.includes('chatgpt') || lower.includes('claude') || lower.includes('gemini')) {
    return 'chat';
  }

  // File extensions
  if (lower.endsWith('.json') || lower.endsWith('.jsonl')) {
    return 'chat'; // Assume JSON is chat export
  }

  if (lower.endsWith('.md') || lower.endsWith('.txt')) {
    return 'document';
  }

  if (lower.endsWith('.pdf')) {
    return 'document';
  }

  return 'unknown';
}

/**
 * Map streaming-upload status to import job status
 */
function mapStatus(uploadStatus: string): ImportJobStatus {
  switch (uploadStatus) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'reading'; // Default to reading if no specific stage info
    case 'complete':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'queued';
  }
}
