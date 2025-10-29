/**
 * Import Progress Stream (Server-Sent Events)
 *
 * Provides real-time progress updates for import jobs via SSE.
 * Clients connect to /api/v1/import/progress/stream/:uploadId and receive
 * continuous updates as the import progresses.
 *
 * Event Format:
 * data: { stage, progress, message, detail, stats, recentNodes }
 *
 * @see docs/migrations/UNIFIED_IMPORT.md for integration details
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth.service';
import { EventEmitter } from 'events';
import { streamingUploadService } from '../services/streaming-upload';

/**
 * Global event emitter for import progress
 * Key: uploadId, Value: progress events
 */
export class ImportProgressEmitter extends EventEmitter {
  private activeStreams = new Map<string, Set<Response>>();

  /**
   * Emit progress update for a specific upload
   */
  emitProgress(uploadId: string, progress: ProgressEvent) {
    this.emit(`progress:${uploadId}`, progress);
  }

  /**
   * Register SSE response stream
   */
  registerStream(uploadId: string, res: Response) {
    if (!this.activeStreams.has(uploadId)) {
      this.activeStreams.set(uploadId, new Set());
    }
    this.activeStreams.get(uploadId)!.add(res);
  }

  /**
   * Unregister SSE response stream
   */
  unregisterStream(uploadId: string, res: Response) {
    const streams = this.activeStreams.get(uploadId);
    if (streams) {
      streams.delete(res);
      if (streams.size === 0) {
        this.activeStreams.delete(uploadId);
      }
    }
  }

  /**
   * Get count of active streams for an upload
   */
  getStreamCount(uploadId: string): number {
    return this.activeStreams.get(uploadId)?.size || 0;
  }
}

// Global singleton instance
export const importProgressEmitter = new ImportProgressEmitter();

/**
 * Progress event payload
 */
export interface ProgressEvent {
  uploadId: string;
  stage:
    | 'queued'
    | 'reading'
    | 'parsing'
    | 'processing'
    | 'normalizing'
    | 'indexing'
    | 'linking'
    | 'done'
    | 'error';
  progress: number; // 0-100
  message: string;
  detail: string;
  stats: {
    nodesCreated: number;
    edgesCreated: number;
    sourcesCreated: number;
    conversationsProcessed: number;
    messagesProcessed: number;
  };
  recentNodes?: Array<{
    id: string;
    kind: string;
    label: string;
  }>;
  error?: string;
  timestamp: number;
}

/**
 * Create SSE routes with authentication
 */
export function createImportProgressStreamRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/import/progress/stream/:uploadId
   * Server-Sent Events endpoint for real-time progress
   */
  router.get('/stream/:uploadId', requireAuth(authService), (req: Request, res: Response) => {
    const { uploadId } = req.params;
    const user = (req as any).user;

    console.log(`📡 SSE connection opened: ${uploadId} (user: ${user.email})`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', uploadId })}\n\n`);

    // Register this response stream
    importProgressEmitter.registerStream(uploadId, res);

    // Listen for progress events
    const progressHandler = (progress: ProgressEvent) => {
      try {
        // TODO: Verify user has permission to view this upload
        // For now, we trust authentication middleware

        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (error) {
        console.error('Error writing SSE event:', error);
      }
    };

    importProgressEmitter.on(`progress:${uploadId}`, progressHandler);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`📡 SSE connection closed: ${uploadId}`);
      importProgressEmitter.off(`progress:${uploadId}`, progressHandler);
      importProgressEmitter.unregisterStream(uploadId, res);
    });

    // Keep connection alive with periodic heartbeat (every 30s)
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  });

  /**
   * GET /api/v1/import/progress/:uploadId
   * HTTP polling fallback for clients that don't support SSE
   */
  router.get('/:uploadId', requireAuth(authService), async (req: Request, res: Response) => {
    const { uploadId } = req.params;
    const user = (req as any).user;

    // Get progress from streaming upload service
    const uploadProgress = streamingUploadService.getProgress(uploadId);

    if (!uploadProgress) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found',
        uploadId,
      });
    }

    // Verify user has permission to view this upload
    if (uploadProgress.accountId && uploadProgress.accountId !== user.accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Map to progress event format
    return res.json({
      success: true,
      uploadId,
      progress: {
        stage:
          uploadProgress.status === 'uploading'
            ? 'reading'
            : uploadProgress.status === 'processing'
              ? 'parsing'
              : uploadProgress.status === 'complete'
                ? 'done'
                : uploadProgress.status === 'error'
                  ? 'error'
                  : 'pending',
        progress: uploadProgress.progress || uploadProgress.percentage || 0,
        message: uploadProgress.error || 'Processing...',
        detail: `${uploadProgress.fileName} - ${uploadProgress.percentage}% uploaded`,
        stats: uploadProgress.stats || {
          nodesCreated: 0,
          edgesCreated: 0,
          sourcesCreated: 0,
          conversationsProcessed: 0,
          messagesProcessed: 0,
        },
        timestamp: uploadProgress.startedAt || Date.now(),
      },
      note: 'Use /stream/:uploadId endpoint for real-time SSE updates',
    });
  });

  /**
   * DELETE /api/v1/import/progress/:uploadId
   * Cancel an in-progress import
   */
  router.delete('/:uploadId', requireAuth(authService), async (req: Request, res: Response) => {
    const { uploadId } = req.params;
    const user = (req as any).user;

    console.log(`❌ Import cancellation requested: ${uploadId} (user: ${user.email})`);

    // Get progress to verify user ownership
    const uploadProgress = streamingUploadService.getProgress(uploadId);

    if (!uploadProgress) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found',
      });
    }

    // Verify user has permission to cancel this upload
    if (uploadProgress.accountId && uploadProgress.accountId !== user.accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Cancel the upload in streaming service
    streamingUploadService.cancelUpload(uploadId);

    // Emit cancellation event to SSE clients
    importProgressEmitter.emitProgress(uploadId, {
      uploadId,
      stage: 'error',
      progress: 0,
      message: 'Import cancelled',
      detail: 'Import was cancelled by user',
      stats: {
        nodesCreated: 0,
        edgesCreated: 0,
        sourcesCreated: 0,
        conversationsProcessed: 0,
        messagesProcessed: 0,
      },
      error: 'Cancelled by user',
      timestamp: Date.now(),
    });

    return res.json({
      success: true,
      message: 'Import cancelled successfully',
      uploadId,
    });
  });

  return router;
}

/**
 * Helper function to emit progress from import services
 * Call this from import-enhanced.ts at various stages
 *
 * @example
 * import { emitImportProgress } from './routes/import-progress-stream';
 *
 * // During parsing
 * emitImportProgress(uploadId, {
 *   stage: 'parsing',
 *   progress: 30,
 *   message: 'Parsing conversations...',
 *   detail: 'Found 42 conversations',
 *   stats: { conversationsProcessed: 42, ... }
 * });
 */
export function emitImportProgress(uploadId: string, update: Partial<ProgressEvent>): void {
  const event: ProgressEvent = {
    uploadId,
    stage: update.stage || 'processing',
    progress: update.progress || 0,
    message: update.message || '',
    detail: update.detail || '',
    stats: update.stats || {
      nodesCreated: 0,
      edgesCreated: 0,
      sourcesCreated: 0,
      conversationsProcessed: 0,
      messagesProcessed: 0,
    },
    recentNodes: update.recentNodes,
    error: update.error,
    timestamp: Date.now(),
  };

  importProgressEmitter.emitProgress(uploadId, event);
}
