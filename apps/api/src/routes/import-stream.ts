import { Router, Request, Response } from 'express';
import { streamingUploadService } from '../services/streaming-upload';
import { StreamingJSONParser } from '../services/streaming-json-parser';
import { z } from 'zod';

const router = Router();

// Helper to get database client
function getDbClient() {
  if (!global.dbClient) {
    throw new Error('Database not initialized');
  }
  return global.dbClient;
}

// Store active imports
const activeImports = new Map<
  string,
  {
    parser: StreamingJSONParser;
    uploadId: string;
    conversationsProcessed: number;
    totalConversations: number;
    status: 'uploading' | 'parsing' | 'importing' | 'complete' | 'error';
    error?: string;
  }
>();

/**
 * POST /api/v1/import/stream
 * Streaming file upload for large conversation files
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    // Handle streaming upload
    const files = await streamingUploadService.handleUpload(req);

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid files uploaded. Only JSON and JSONL files are accepted.',
      });
    }

    // Start async processing for each file
    const importPromises = files.map(async (file) => {
      const parser = new StreamingJSONParser();
      const { uploadId, fileName, filePath } = file;

      const importState: {
        parser: StreamingJSONParser;
        uploadId: string;
        conversationsProcessed: number;
        totalConversations: number;
        status: 'uploading' | 'parsing' | 'importing' | 'complete' | 'error';
        error?: string;
      } = {
        parser,
        uploadId,
        conversationsProcessed: 0,
        totalConversations: 0,
        status: 'parsing',
      };

      activeImports.set(uploadId, importState);

      // Set up batch processing
      const db = getDbClient();

      const batchSize = 100;
      let batch: any[] = [];

      parser.on('batch', async (conversations) => {
        batch.push(...conversations);

        // Process batch when it reaches size limit
        if (batch.length >= batchSize) {
          const toProcess = batch.splice(0, batchSize);
          await processBatch(db, toProcess);
          importState.conversationsProcessed += toProcess.length;
        }
      });

      parser.on('progress', (progress) => {
        importState.conversationsProcessed = progress.conversationsProcessed;
        streamingUploadService.updateStatus(uploadId, 'processing');
      });

      try {
        // Parse the file
        await parser.parseFile(filePath);

        // Process remaining batch
        if (batch.length > 0) {
          await processBatch(db, batch);
          importState.conversationsProcessed += batch.length;
        }

        importState.status = 'complete';
        streamingUploadService.updateStatus(uploadId, 'complete');

        // Cleanup temp file after successful import
        await streamingUploadService.cleanup(filePath);

        return {
          uploadId,
          fileName,
          conversationsImported: importState.conversationsProcessed,
          status: 'complete',
        };
      } catch (error: any) {
        importState.status = 'error';
        importState.error = error.message;
        streamingUploadService.updateStatus(uploadId, 'error', error.message);

        throw error;
      }
    });

    const results = await Promise.allSettled(importPromises);

    const successfulImports = results
      .filter((r) => r.status === 'fulfilled')
      .map((r: any) => r.value);

    const failedImports = results
      .filter((r) => r.status === 'rejected')
      .map((r: any) => ({
        error: r.reason?.message || 'Unknown error',
      }));

    return res.json({
      success: successfulImports.length > 0,
      results: successfulImports,
      failed: failedImports,
      summary: {
        total: files.length,
        successful: successfulImports.length,
        failed: failedImports.length,
        totalConversations: successfulImports.reduce((sum, r) => sum + r.conversationsImported, 0),
      },
    });
  } catch (error: any) {
    console.error('Streaming import error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process upload',
    });
  }
});

/**
 * GET /api/v1/import/stream/progress/:uploadId
 * Get progress of a streaming import
 */
router.get('/progress/:uploadId', (req: Request, res: Response) => {
  const { uploadId } = req.params;

  const uploadProgress = streamingUploadService.getProgress(uploadId);
  const importState = activeImports.get(uploadId);

  if (!uploadProgress && !importState) {
    return res.status(404).json({
      success: false,
      error: 'Upload not found',
    });
  }

  return res.json({
    success: true,
    upload: uploadProgress,
    import: importState
      ? {
          conversationsProcessed: importState.conversationsProcessed,
          status: importState.status,
          error: importState.error,
        }
      : null,
  });
});

/**
 * DELETE /api/v1/import/stream/cancel/:uploadId
 * Cancel an in-progress import
 */
router.delete('/cancel/:uploadId', (req: Request, res: Response) => {
  const { uploadId } = req.params;

  streamingUploadService.cancelUpload(uploadId);
  activeImports.delete(uploadId);

  return res.json({
    success: true,
    message: 'Import cancelled',
  });
});

/**
 * Process a batch of conversations and insert into database
 */
async function processBatch(db: any, conversations: any[]) {
  for (const conv of conversations) {
    // Create conversation node
    const conversationNode = {
      id: conv.id,
      kind: 'ChatThread',
      title: conv.title,
      platform: conv.platform,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      message_count: conv.messages.length,
    };

    await db.createNode(conversationNode);

    // Create message nodes and edges
    for (let idx = 0; idx < conv.messages.length; idx++) {
      const msg = conv.messages[idx];

      const messageNode = {
        id: msg.metadata?.id || `${conv.id}_msg_${idx}`,
        kind: 'Message',
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        index: idx,
        created_at: Date.now(),
      };

      await db.createNode(messageNode);

      // Create CONTAINS edge from conversation to message
      const edge = {
        id: `edge_${conv.id}_${idx}`,
        kind: 'CONTAINS',
        from: conv.id,
        to: messageNode.id,
        created_at: Date.now(),
        metadata: { rank: idx },
      };

      await db.createEdge(edge);
    }
  }
}

export default router;
