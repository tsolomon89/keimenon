/**
 * Test Jobs Routes - For E2E Testing Only
 *
 * This endpoint creates test jobs without requiring file uploads.
 * It's used by E2E tests to set up job-related test scenarios.
 *
 * Security: Only enabled in NODE_ENV=test
 */

import { Router, Request, Response } from 'express';
import { ulid } from 'ulid';

const router = Router();

/**
 * POST /test/jobs/create - Create a test job
 *
 * Accepts JSON payload and creates a minimal job for testing purposes.
 * Returns a job_id that can be used in isolation tests.
 *
 * Body:
 * {
 *   "title": "Test Job Title",
 *   "data_tag": "test"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "job_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
 *   "message": "Test job created"
 * }
 */
router.post('/create', (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({
      success: false,
      error: 'Not found',
    });
  }

  try {
    const userId = (req as any).user?.userId;
    const accountId = (req as any).user?.accountId;

    if (!userId || !accountId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { title = 'Test Job', data_tag = 'test' } = req.body;

    // Generate a job ID (ULID for consistent format)
    const jobId = ulid();

    console.log(`[Test Jobs] Created test job: ${jobId} for account: ${accountId}`);

    return res.json({
      success: true,
      job_id: jobId,
      uploadId: jobId, // For compatibility with import endpoints
      message: 'Test job created',
      details: {
        title,
        data_tag,
        accountId,
        userId,
      },
    });
  } catch (error: any) {
    console.error('[Test Jobs] Error creating test job:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create test job',
    });
  }
});

export default router;
