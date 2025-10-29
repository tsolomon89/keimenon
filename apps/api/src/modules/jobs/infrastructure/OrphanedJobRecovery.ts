/**
 * Orphaned Job Recovery
 *
 * On server startup, identifies and marks jobs that were interrupted by
 * server crashes or restarts as failed.
 *
 * Recovery Logic:
 * - Queries all jobs with status 'queued' or 'running'
 * - Marks them as 'failed' with error "Server restarted during execution"
 * - Logs recovery count for observability
 *
 * Why This Matters:
 * - Prevents jobs stuck in "running" state forever
 * - Clears UI showing stale "Processing" jobs
 * - Provides clear feedback to users about interrupted work
 *
 * Integration:
 * - Called once during server startup in apps/api/src/index.ts
 * - Before worker pool initialization
 * - After database connection established
 */

import { JobRepository } from './JobRepository';
import { Job } from '../domain/Job';

export interface RecoveryResult {
  total: number;
  queued: number;
  running: number;
  failed: string[];
}

/**
 * Recover orphaned jobs left in non-terminal states by previous server instance
 */
export async function recoverOrphanedJobs(jobRepository: JobRepository): Promise<RecoveryResult> {
  console.log('🔍 Checking for orphaned jobs from previous server instance...');

  try {
    // Query all jobs in active states (not terminal)
    // Note: JobRepository.find() without accountId will fetch from all accounts
    const activeJobs = await jobRepository.find({
      status: ['queued', 'running'],
      limit: 1000, // Safety limit - adjust if needed
    });

    if (activeJobs.length === 0) {
      console.log('✅ No orphaned jobs found');
      return { total: 0, queued: 0, running: 0, failed: [] };
    }

    console.log(`⚠️  Found ${activeJobs.length} orphaned jobs, marking as failed...`);

    const result: RecoveryResult = {
      total: activeJobs.length,
      queued: 0,
      running: 0,
      failed: [],
    };

    // Mark each job as failed/canceled with clear error message
    for (const job of activeJobs) {
      try {
        // Track original status before modification
        const originalStatus = job.status;
        if (originalStatus === 'queued') result.queued++;
        if (originalStatus === 'running') result.running++;

        // Cancel the orphaned job with clear explanation
        // Use cancel() instead of fail() because:
        // - It works for both 'queued' and 'running' states
        // - fail() only works for 'running' state
        job.cancel(
          'Server restarted during job execution. Job was automatically canceled. Please retry if needed.'
        );

        // Persist updated job state
        await jobRepository.save(job);

        console.log(`   ✓ Marked job ${job.id} as canceled (was: ${originalStatus})`);
      } catch (error: any) {
        console.error(`   ✗ Failed to mark job ${job.id} as canceled:`, error.message);
        result.failed.push(job.id);
      }
    }

    // Summary
    const successCount = result.total - result.failed.length;
    console.log(`✅ Orphaned job recovery complete:`);
    console.log(`   - Total found: ${result.total}`);
    console.log(`   - Queued → Canceled: ${result.queued}`);
    console.log(`   - Running → Canceled: ${result.running}`);
    console.log(`   - Successfully recovered: ${successCount}`);

    if (result.failed.length > 0) {
      console.log(`   - Failed to recover: ${result.failed.length} (see errors above)`);
    }

    return result;
  } catch (error: any) {
    console.error('❌ Orphaned job recovery failed:', error.message);
    console.error('   Stack:', error.stack);
    throw error;
  }
}
