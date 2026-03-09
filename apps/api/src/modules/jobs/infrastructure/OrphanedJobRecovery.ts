/**
 * Orphaned Job Recovery
 *
 * On server startup, identifies and recovers jobs interrupted by
 * server crashes or restarts.
 *
 * Recovery Logic:
 * - Queries jobs with status 'running'
 * - Import jobs: mark as blocked/recoverable so users can resume from checkpoints
 * - Non-import jobs: mark as failed with error "Server restarted during execution"
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
 * Recover orphaned jobs left in non-terminal states by previous server instance.
 *
 * INVARIANT: On server startup, ALL running jobs are orphaned by definition.
 * No worker thread survives a server restart, so there is no legitimate reason
 * for a job to be in 'running' status when the server boots.
 */
export async function recoverOrphanedJobs(jobRepository: JobRepository): Promise<RecoveryResult> {
  console.log('🔍 Checking for orphaned running jobs from previous server instance...');

  try {
    // Query running jobs only. Queued jobs can still be picked up after restart.
    const activeJobs = await jobRepository.find({
      status: 'running',
      limit: 1000, // Safety limit - adjust if needed
    });

    if (activeJobs.length === 0) {
      console.log('✅ No orphaned jobs found');
      return { total: 0, running: 0, failed: [] };
    }

    console.log(`📋 Found ${activeJobs.length} running job(s) — recovering startup orphans`);

    const result: RecoveryResult = {
      total: activeJobs.length,
      running: activeJobs.length,
      failed: [],
    };

    for (const job of activeJobs) {
      try {
        const startedAt = job.state.startedAt?.getTime();
        const suffix = startedAt
          ? ` (started ${Math.round((Date.now() - startedAt) / 1000 / 60)} minutes ago)`
          : ' (missing startedAt timestamp)';

        if (job.type === 'import') {
          job.block(
            `Server restarted during import execution${suffix}. Resume to continue from the latest checkpoint.`
          );
          job.updateStateMetadata({
            recoverableAfterRestart: true,
            interruptedAt: Date.now(),
            interruptedReason: 'SERVER_RESTART',
          });
          await jobRepository.save(job);
          console.log(`   ✓ Marked import ${job.id} as blocked/recoverable${suffix}`);
        } else {
          job.fail({
            code: 'ORPHANED',
            message: `Server restarted during job execution${suffix}. Please retry if needed.`,
          });
          await jobRepository.save(job);
          console.log(`   ✓ Marked job ${job.id} as failed${suffix}`);
        }
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
