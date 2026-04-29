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
  autoResumed: number;
  failed: string[];
}

function appendRecoveryTimelineEvent(
  job: Job,
  event: 'recovered_blocked' | 'auto_resumed',
  details: Record<string, unknown> = {}
): void {
  const metadata = (job.state.metadata || {}) as Record<string, unknown>;
  const timeline = Array.isArray(metadata.recoveryTimeline)
    ? [...(metadata.recoveryTimeline as Array<Record<string, unknown>>)]
    : [];
  timeline.push({
    event,
    timestamp: Date.now(),
    ...details,
  });
  job.updateStateMetadata({
    recoveryTimeline: timeline.slice(-50),
    lastRecoveryEvent: event,
  });
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
      return { total: 0, running: 0, autoResumed: 0, failed: [] };
    }

    console.log(`📋 Found ${activeJobs.length} running job(s) — recovering startup orphans`);

    const result: RecoveryResult = {
      total: activeJobs.length,
      running: activeJobs.length,
      autoResumed: 0,
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
          appendRecoveryTimelineEvent(job, 'recovered_blocked', {
            reason: 'SERVER_RESTART',
          });
          job.updateStateMetadata({
            recoverableAfterRestart: true,
            interruptedAt: Date.now(),
            interruptedReason: 'SERVER_RESTART',
          });
          job.retry();
          appendRecoveryTimelineEvent(job, 'auto_resumed', {
            reason: 'SERVER_RESTART',
          });
          job.updateStateMetadata({
            autoResumedAt: Date.now(),
            autoResumeReason: 'SERVER_RESTART',
          });
          result.autoResumed += 1;
          await jobRepository.save(job);
          console.log(`   ✓ Auto-resumed import ${job.id} from restart interruption${suffix}`);
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

    const recoverableBlockedJobs = await jobRepository.find({
      status: 'blocked',
      limit: 1000,
    });
    for (const job of recoverableBlockedJobs) {
      if (job.type !== 'import') {
        continue;
      }
      const metadata = (job.state.metadata || {}) as Record<string, unknown>;
      const interruptedReason = String(metadata.interruptedReason || '');
      const recoverableAfterRestart = metadata.recoverableAfterRestart === true;
      if (!recoverableAfterRestart || interruptedReason !== 'SERVER_RESTART') {
        continue;
      }
      try {
        if (!job.canResume) {
          continue;
        }
        job.retry();
        appendRecoveryTimelineEvent(job, 'auto_resumed', {
          reason: 'SERVER_RESTART',
          source: 'blocked_job_scan',
        });
        job.updateStateMetadata({
          autoResumedAt: Date.now(),
          autoResumeReason: 'SERVER_RESTART',
        });
        await jobRepository.save(job);
        result.autoResumed += 1;
      } catch (error: any) {
        console.error(`   ✗ Failed to auto-resume blocked job ${job.id}:`, error.message);
      }
    }

    // Summary
    const successCount = result.total - result.failed.length;
    console.log(`✅ Orphaned job recovery complete:`);
    console.log(`   - Total found: ${result.total}`);
    console.log(`   - Running → Failed: ${result.running}`);
    console.log(`   - Auto-resumed imports: ${result.autoResumed}`);
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
