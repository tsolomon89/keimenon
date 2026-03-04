/**
 * Orphaned Job Recovery
 *
 * On server startup, identifies and marks jobs that were interrupted by
 * server crashes or restarts as failed.
 *
 * Recovery Logic:
 * - Queries jobs with status 'running'
 * - Marks only stale running jobs as failed with error "Server restarted during execution"
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
  running: number;
  failed: string[];
}

/**
 * Recover orphaned jobs left in non-terminal states by previous server instance
 */
export async function recoverOrphanedJobs(jobRepository: JobRepository): Promise<RecoveryResult> {
  console.log('🔍 Checking for orphaned running jobs from previous server instance...');

  try {
    const orphanThresholdMs = Number.parseInt(process.env.JOB_ORPHAN_THRESHOLD_MS || '120000', 10);

    // Query running jobs only. Queued jobs can still be picked up after restart.
    const activeJobs = await jobRepository.find({
      status: 'running',
      limit: 1000, // Safety limit - adjust if needed
    });

    if (activeJobs.length === 0) {
      console.log('✅ No orphaned jobs found');
      return { total: 0, running: 0, failed: [] };
    }

    console.log(`📋 Found ${activeJobs.length} running jobs, checking for orphaned work...`);

    const result: RecoveryResult = {
      total: 0,
      running: 0,
      failed: [],
    };

    // Mark only stale or malformed running jobs as failed.
    for (const job of activeJobs) {
      try {
        const startedAt = job.state.startedAt?.getTime();
        const runningTimeMs = startedAt ? Date.now() - startedAt : Number.POSITIVE_INFINITY;

        if (startedAt && runningTimeMs <= orphanThresholdMs) {
          console.log(
            `ℹ️ Skipping recent running job ${job.id} (${Math.round(runningTimeMs / 1000)}s old)`
          );
          continue;
        }

        result.total++;
        result.running++;

        const suffix = startedAt
          ? ` (${Math.round(runningTimeMs / 1000 / 60)} minutes old)`
          : ' (missing startedAt timestamp)';
        job.fail({
          code: 'ORPHANED',
          message: `Server restarted during job execution${suffix}. Please retry if needed.`,
        });

        // Persist updated job state
        await jobRepository.save(job);

        console.log(`   ✓ Marked job ${job.id} as failed`);
      } catch (error: any) {
        console.error(`   ✗ Failed to mark job ${job.id} as failed:`, error.message);
        result.failed.push(job.id);
      }
    }

    // Summary
    const successCount = result.total - result.failed.length;
    console.log(`✅ Orphaned job recovery complete:`);
    console.log(`   - Total found: ${result.total}`);
    console.log(`   - Running → Failed: ${result.running}`);
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
