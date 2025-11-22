/**
 * DeleteMetrics - Metrics tracking for delete operations
 *
 * Tracks performance, failures, and usage patterns for the delete system.
 *
 * Metrics tracked:
 * - Job duration (p50, p95, p99)
 * - Nodes deleted per job
 * - Failure rate
 * - Concurrent deletion attempts (409 responses)
 * - Batch processing performance
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/DeleteWorker.ts (instrumentation)
 * - apps/api/src/services/monitoring/DeleteMonitor.ts (alerting)
 * - apps/api/src/routes/metrics.routes.ts (API endpoint)
 */

import { MetricsService } from '../MetricsService';

export interface DeleteJobMetadata {
  jobId: string;
  accountId: string;
  scope: 'canvas' | 'all-clients';
  nodesDeleted: number;
  durationMs: number;
  batchCount?: number;
  avgBatchTimeMs?: number;
}

export interface DeleteFailureMetadata {
  jobId: string;
  accountId: string;
  scope: 'canvas' | 'all-clients';
  errorCode: string;
  errorMessage: string;
}

/**
 * DeleteMetrics Service
 *
 * Example usage:
 * ```typescript
 * const deleteMetrics = new DeleteMetrics();
 *
 * // Record successful deletion
 * deleteMetrics.recordJobCompletion({
 *   jobId: 'job_123',
 *   accountId: 'acc_456',
 *   scope: 'canvas',
 *   nodesDeleted: 1000,
 *   durationMs: 5000,
 * });
 *
 * // Record failure
 * deleteMetrics.recordJobFailure({
 *   jobId: 'job_789',
 *   accountId: 'acc_456',
 *   scope: 'canvas',
 *   errorCode: 'TIMEOUT',
 *   errorMessage: 'Job exceeded 5 minute timeout',
 * });
 *
 * // Get performance stats
 * const stats = deleteMetrics.getPerformanceStats();
 * console.log(`P95 duration: ${stats.durationP95}ms`);
 * ```
 */
export class DeleteMetrics extends MetricsService {
  constructor() {
    super('delete_operations');
  }

  /**
   * Record successful job completion
   */
  recordJobCompletion(metadata: DeleteJobMetadata): void {
    const { jobId, accountId, scope, nodesDeleted, durationMs, batchCount, avgBatchTimeMs } =
      metadata;

    // Increment success counter
    this.incrementCounter('jobs_completed', { status: 'success', scope });

    // Record duration histogram
    this.recordValue('job_duration_ms', durationMs, { scope });

    // Record nodes deleted histogram
    this.recordValue('nodes_deleted', nodesDeleted, { scope });

    // Record batch metrics if available
    if (batchCount !== undefined) {
      this.recordValue('batch_count', batchCount, { scope });
    }

    if (avgBatchTimeMs !== undefined) {
      this.recordValue('avg_batch_time_ms', avgBatchTimeMs, { scope });
    }

    // Update active gauge
    this.setGauge('last_job_duration_ms', durationMs, { scope });
    this.setGauge('last_nodes_deleted', nodesDeleted, { scope });

    console.log(
      `[DeleteMetrics] Job ${jobId} completed: ${nodesDeleted} nodes in ${durationMs}ms (${scope})`
    );
  }

  /**
   * Record job failure
   */
  recordJobFailure(metadata: DeleteFailureMetadata): void {
    const { jobId, accountId, scope, errorCode, errorMessage } = metadata;

    // Increment failure counter
    this.incrementCounter('jobs_completed', { status: 'failed', scope });
    this.incrementCounter('job_failures', { error_code: errorCode, scope });

    console.error(
      `[DeleteMetrics] Job ${jobId} failed: ${errorCode} - ${errorMessage} (${scope})`
    );
  }

  /**
   * Record concurrent deletion attempt (409 Conflict)
   */
  recordConcurrentAttempt(accountId: string, scope: string): void {
    this.incrementCounter('concurrent_attempts', { scope });
    this.setGauge('last_concurrent_attempt_time', Date.now());

    console.warn(
      `[DeleteMetrics] Concurrent deletion attempt for account ${accountId} (${scope})`
    );
  }

  /**
   * Record batch processing performance
   */
  recordBatchProcessed(
    batchNumber: number,
    nodesInBatch: number,
    processingTimeMs: number
  ): void {
    this.recordValue('batch_processing_time_ms', processingTimeMs);
    this.recordValue('batch_size', nodesInBatch);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    durationP50: number | null;
    durationP95: number | null;
    durationP99: number | null;
    durationAvg: number | null;
    nodesDeletedAvg: number | null;
    batchTimeAvg: number | null;
    successRate: number;
    totalJobs: number;
    failedJobs: number;
  } {
    const durationP50 = this.getPercentile('job_duration_ms', 0.5);
    const durationP95 = this.getPercentile('job_duration_ms', 0.95);
    const durationP99 = this.getPercentile('job_duration_ms', 0.99);
    const durationAvg = this.getAverage('job_duration_ms');
    const nodesDeletedAvg = this.getAverage('nodes_deleted');
    const batchTimeAvg = this.getAverage('avg_batch_time_ms');

    // Calculate success rate
    const summary = this.getSummary();
    let totalSuccess = 0;
    let totalFailed = 0;

    summary.counters.forEach((counter) => {
      if (counter.name === 'jobs_completed') {
        if (counter.labels?.status === 'success') {
          totalSuccess += counter.value;
        } else if (counter.labels?.status === 'failed') {
          totalFailed += counter.value;
        }
      }
    });

    const totalJobs = totalSuccess + totalFailed;
    const successRate = totalJobs > 0 ? (totalSuccess / totalJobs) * 100 : 100;

    return {
      durationP50,
      durationP95,
      durationP99,
      durationAvg,
      nodesDeletedAvg,
      batchTimeAvg,
      successRate,
      totalJobs,
      failedJobs: totalFailed,
    };
  }

  /**
   * Get failure breakdown by error code
   */
  getFailureBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    const summary = this.getSummary();

    summary.counters.forEach((counter) => {
      if (counter.name === 'job_failures' && counter.labels?.error_code) {
        breakdown[counter.labels.error_code] = counter.value;
      }
    });

    return breakdown;
  }

  /**
   * Get concurrent attempt count
   */
  getConcurrentAttemptCount(): number {
    const summary = this.getSummary();
    let count = 0;

    summary.counters.forEach((counter) => {
      if (counter.name === 'concurrent_attempts') {
        count += counter.value;
      }
    });

    return count;
  }

  /**
   * Generate metrics report for monitoring/alerting
   */
  generateReport(): {
    performance: ReturnType<DeleteMetrics['getPerformanceStats']>;
    failures: Record<string, number>;
    concurrentAttempts: number;
    summary: string;
  } {
    const performance = this.getPerformanceStats();
    const failures = this.getFailureBreakdown();
    const concurrentAttempts = this.getConcurrentAttemptCount();

    // Generate human-readable summary
    const summary = `
Delete Operations Report
========================
Total Jobs: ${performance.totalJobs}
Success Rate: ${performance.successRate.toFixed(2)}%
Failed Jobs: ${performance.failedJobs}

Performance:
- Average Duration: ${performance.durationAvg?.toFixed(0) || 'N/A'}ms
- P95 Duration: ${performance.durationP95?.toFixed(0) || 'N/A'}ms
- Average Nodes Deleted: ${performance.nodesDeletedAvg?.toFixed(0) || 'N/A'}

Failures by Error Code:
${Object.entries(failures)
  .map(([code, count]) => `- ${code}: ${count}`)
  .join('\n') || 'None'}

Concurrent Attempts Blocked: ${concurrentAttempts}
    `.trim();

    return {
      performance,
      failures,
      concurrentAttempts,
      summary,
    };
  }
}

// Singleton instance (can be configured as needed)
let deleteMetricsInstance: DeleteMetrics | null = null;

/**
 * Get or create DeleteMetrics singleton
 */
export function getDeleteMetrics(): DeleteMetrics {
  if (!deleteMetricsInstance) {
    deleteMetricsInstance = new DeleteMetrics();
  }
  return deleteMetricsInstance;
}

/**
 * Reset DeleteMetrics singleton (for testing)
 */
export function resetDeleteMetrics(): void {
  if (deleteMetricsInstance) {
    deleteMetricsInstance.reset();
  }
  deleteMetricsInstance = null;
}
