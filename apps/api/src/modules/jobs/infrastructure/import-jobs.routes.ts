/**
 * Import Jobs Routes
 *
 * File upload endpoint that creates background import jobs.
 * Replaces the synchronous /import/enhanced endpoint with async job-based processing.
 *
 * Flow:
 * 1. Accept multipart/form-data file upload
 * 2. Save files to temp storage
 * 3. Create import job with file paths
 * 4. Return job ID immediately
 * 5. Client monitors progress via SSE (/api/v1/stream/jobs)
 *
 * Related:
 * - apps/api/src/routes/import-enhanced.ts (legacy synchronous endpoint)
 * - apps/api/src/modules/workers/infrastructure/ImportWorker.ts
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../../../services/auth.service';
import { requireAuth } from '../../../middleware/auth.middleware';
import { streamingUploadService } from '../../../services/streaming-upload';
import { SQLiteJobRepository } from './JobRepository';
import { EnqueueJob, EnqueueJobCommand } from '../application/EnqueueJob';
import Database from 'better-sqlite3';
import { z } from 'zod';

/**
 * Import configuration schema (form fields)
 */
const ImportConfigSchema = z
  .object({
    // Platform
    platform: z.enum(['chatgpt', 'claude', 'gemini', 'generic']).optional(),

    // Code extraction
    exportCode: z.boolean().default(true),
    codeMinChars: z.number().default(50),

    // Grouping
    autoGroup: z.boolean().default(true),
    targetGroupCount: z.number().default(25),

    // Duplicates
    duplicateDetection: z.boolean().default(true),
    duplicateThreshold: z.number().default(0.85),
  })
  .partial();

/**
 * Factory function to create import jobs routes
 */
export function createImportJobsRoutes(authService: AuthService, db: Database.Database): Router {
  const router = Router();

  // Initialize repository and use case
  const jobRepository = new SQLiteJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepository);

  /**
   * POST /api/v1/jobs/import
   * Upload files and create import job
   *
   * Content-Type: multipart/form-data
   *
   * Form fields:
   * - files: File[] (one or more files)
   * - config: JSON string (optional import configuration)
   *
   * Returns:
   * {
   *   success: true,
   *   jobId: string,
   *   uploadIds: string[],
   *   message: string
   * }
   */
  router.post('/import', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const userEmail = (req as any).user?.email;
      const operating = (req as any).operating;

      console.log('📦 IMPORT JOB START ============================================');
      console.log(`  User: ${userEmail} (${userId})`);
      console.log(`  Account: ${userAccountId}`);
      console.log(`  Timestamp: ${new Date().toISOString()}`);

      if (!userAccountId || !userId) {
        console.log('  ❌ IMPORT JOB FAILED: Missing authentication');
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      // Handle streaming file upload
      const uploadResult = await streamingUploadService.handleUploadWithFields(req);
      const files = uploadResult.files;
      const fields = uploadResult.fields;

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded',
        });
      }

      console.log(`  📁 Uploaded ${files.length} file(s):`);
      files.forEach((f) => {
        console.log(`     - ${f.fileName} (${(f.size / 1024).toFixed(2)} KB)`);
      });

      // Parse import configuration from form fields
      let importOptions: any = {};
      if (fields.config) {
        try {
          const parsed = JSON.parse(fields.config);
          importOptions = ImportConfigSchema.parse(parsed);
        } catch (error: any) {
          console.warn(`  ⚠️  Failed to parse config: ${error.message}`);
          // Continue with defaults
        }
      }

      // Build job config
      const jobConfig = {
        files: files.map((f) => ({
          fileName: f.fileName,
          fileSize: f.size,
          mimeType: f.mimeType,
          filePath: f.filePath, // Path to temp file
        })),
        importOptions: {
          platform: importOptions.platform,
          exportCode: importOptions.exportCode ?? true,
          codeMinChars: importOptions.codeMinChars ?? 50,
          autoGroup: importOptions.autoGroup ?? true,
          targetGroupCount: importOptions.targetGroupCount ?? 25,
          duplicateDetection: importOptions.duplicateDetection ?? true,
          duplicateThreshold: importOptions.duplicateThreshold ?? 0.85,
        },
      };

      // Create import job
      const command: EnqueueJobCommand = {
        type: 'import',
        accountId: targetAccountId,
        createdBy: userId,
        config: jobConfig,
        idempotencyKey: undefined, // Allow duplicate imports
        concurrencyGroup: undefined, // Allow parallel imports
      };

      const result = await enqueueJob.execute(command);

      console.log(`  ✅ Import job created: ${result.jobId}`);
      console.log(`  Status: ${result.status}`);
      console.log('================================================================');

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        uploadIds: files.map((f) => f.uploadId),
        message: `Import job created. Monitor progress via SSE at /api/v1/stream/jobs`,
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      console.error('❌ Error creating import job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create import job',
      });
    }
  });

  /**
   * POST /api/v1/jobs/delete
   * Create delete job
   *
   * Body:
   * {
   *   scope: 'canvas' | 'all-clients'
   * }
   *
   * Returns:
   * {
   *   success: true,
   *   jobId: string
   * }
   */
  router.post('/delete', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userAccountId = (req as any).user?.accountId;
      const operating = (req as any).operating;

      if (!userAccountId || !userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Determine target account based on operating context
      const targetAccountId = operating?.accountId || userAccountId;

      const { scope } = req.body;

      if (!scope || !['canvas', 'all-clients'].includes(scope)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid scope. Must be "canvas" or "all-clients"',
        });
      }

      // Create delete job with exclusive lock
      const command: EnqueueJobCommand = {
        type: 'delete',
        accountId: targetAccountId,
        createdBy: userId,
        config: {
          deleteScope: scope,
        },
        idempotencyKey: undefined,
        concurrencyGroup: `delete:${targetAccountId}`, // Exclusive lock for deletes
      };

      const result = await enqueueJob.execute(command);

      console.log(`🗑️  Delete job created: ${result.jobId} (scope: ${scope})`);

      return res.status(201).json({
        success: true,
        jobId: result.jobId,
        message: `Delete job created. Monitor progress via SSE at /api/v1/stream/jobs`,
        job: result.job.toJSON(),
      });
    } catch (error: any) {
      console.error('Error creating delete job:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to create delete job',
      });
    }
  });

  return router;
}
