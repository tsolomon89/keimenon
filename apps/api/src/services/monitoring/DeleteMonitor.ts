/**
 * DeleteMonitor - Real-time monitoring and alerting for delete operations
 *
 * Monitors delete job performance and triggers alerts when thresholds are exceeded.
 *
 * Alert conditions:
 * - Failure rate > 5% over last 10 jobs
 * - Average duration > 5 minutes
 * - Concurrent attempts > 10 per hour
 * - No successful jobs in last 24 hours
 *
 * Related:
 * - apps/api/src/services/metrics/DeleteMetrics.ts (metrics source)
 * - apps/api/src/services/alerts/DeleteAlerts.ts (alert handlers)
 */

import { getDeleteMetrics, DeleteMetrics } from '../metrics/DeleteMetrics';

export interface AlertCondition {
  name: string;
  description: string;
  threshold: number;
  currentValue: number;
  exceeded: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface MonitoringReport {
  timestamp: number;
  alerts: AlertCondition[];
  metricsSnapshot: {
    successRate: number;
    avgDuration: number | null;
    p95Duration: number | null;
    totalJobs: number;
    failedJobs: number;
    concurrentAttempts: number;
  };
  recommendations: string[];
}

/**
 * DeleteMonitor Service
 *
 * Example usage:
 * ```typescript
 * const monitor = new DeleteMonitor(deleteMetrics);
 *
 * // Check for alerts
 * const report = monitor.checkAlerts();
 * if (report.alerts.some(a => a.exceeded)) {
 *   console.error('DELETE SYSTEM ALERTS:', report.alerts.filter(a => a.exceeded));
 * }
 * ```
 */
export class DeleteMonitor {
  // Alert thresholds (configurable)
  private readonly THRESHOLDS = {
    FAILURE_RATE_PERCENT: 5, // Alert if >5% failures
    AVG_DURATION_MS: 300000, // Alert if avg >5 minutes
    P95_DURATION_MS: 600000, // Alert if p95 >10 minutes
    CONCURRENT_ATTEMPTS_PER_HOUR: 10,
    MIN_JOBS_PER_DAY: 1, // Alert if <1 job per day (indicates stuck system)
  };

  constructor(private metrics: DeleteMetrics = getDeleteMetrics()) {}

  /**
   * Check all alert conditions and return report
   */
  checkAlerts(): MonitoringReport {
    const stats = this.metrics.getPerformanceStats();
    const concurrentAttempts = this.metrics.getConcurrentAttemptCount();

    const alerts: AlertCondition[] = [
      // Failure rate alert
      {
        name: 'high_failure_rate',
        description: 'Delete job failure rate exceeds threshold',
        threshold: this.THRESHOLDS.FAILURE_RATE_PERCENT,
        currentValue: 100 - stats.successRate,
        exceeded: stats.successRate < 100 - this.THRESHOLDS.FAILURE_RATE_PERCENT,
        severity: stats.successRate < 90 ? 'critical' : 'high',
      },

      // Average duration alert
      {
        name: 'slow_average_duration',
        description: 'Average delete job duration exceeds threshold',
        threshold: this.THRESHOLDS.AVG_DURATION_MS,
        currentValue: stats.durationAvg || 0,
        exceeded: (stats.durationAvg || 0) > this.THRESHOLDS.AVG_DURATION_MS,
        severity: 'medium',
      },

      // P95 duration alert
      {
        name: 'slow_p95_duration',
        description: 'P95 delete job duration exceeds threshold',
        threshold: this.THRESHOLDS.P95_DURATION_MS,
        currentValue: stats.durationP95 || 0,
        exceeded: (stats.durationP95 || 0) > this.THRESHOLDS.P95_DURATION_MS,
        severity: 'high',
      },

      // Concurrent attempts alert
      {
        name: 'excessive_concurrent_attempts',
        description: 'Too many concurrent deletion attempts (indicates UI/UX issue)',
        threshold: this.THRESHOLDS.CONCURRENT_ATTEMPTS_PER_HOUR,
        currentValue: concurrentAttempts,
        exceeded: concurrentAttempts > this.THRESHOLDS.CONCURRENT_ATTEMPTS_PER_HOUR,
        severity: 'low',
      },

      // No recent jobs alert (system health check)
      {
        name: 'no_recent_jobs',
        description: 'No delete jobs in last 24 hours (potential system issue)',
        threshold: this.THRESHOLDS.MIN_JOBS_PER_DAY,
        currentValue: stats.totalJobs,
        exceeded: stats.totalJobs < this.THRESHOLDS.MIN_JOBS_PER_DAY,
        severity: 'low',
      },
    ];

    const recommendations = this.generateRecommendations(alerts, stats);

    return {
      timestamp: Date.now(),
      alerts,
      metricsSnapshot: {
        successRate: stats.successRate,
        avgDuration: stats.durationAvg,
        p95Duration: stats.durationP95,
        totalJobs: stats.totalJobs,
        failedJobs: stats.failedJobs,
        concurrentAttempts,
      },
      recommendations,
    };
  }

  /**
   * Generate actionable recommendations based on alerts
   */
  private generateRecommendations(
    alerts: AlertCondition[],
    stats: ReturnType<DeleteMetrics['getPerformanceStats']>
  ): string[] {
    const recommendations: string[] = [];

    // High failure rate recommendations
    const failureAlert = alerts.find((a) => a.name === 'high_failure_rate' && a.exceeded);
    if (failureAlert) {
      recommendations.push(
        `⚠️  Failure rate is ${failureAlert.currentValue.toFixed(1)}% (threshold: ${failureAlert.threshold}%). Check error logs for common failure patterns.`
      );
      recommendations.push(
        `💡 Run: grep "DeleteWorker.*failed" logs/api.log | tail -20`
      );
    }

    // Slow performance recommendations
    const durationAlert = alerts.find((a) => a.name === 'slow_p95_duration' && a.exceeded);
    if (durationAlert) {
      const durationMin = (durationAlert.currentValue / 60000).toFixed(1);
      recommendations.push(
        `⚠️  P95 duration is ${durationMin} minutes (threshold: ${(durationAlert.threshold / 60000).toFixed(1)} min). Consider optimizing batch size or database indexes.`
      );
      recommendations.push(
        `💡 Check batch processing time: avg ${stats.batchTimeAvg?.toFixed(0) || 'N/A'}ms per batch`
      );
    }

    // Concurrent attempts recommendations
    const concurrentAlert = alerts.find(
      (a) => a.name === 'excessive_concurrent_attempts' && a.exceeded
    );
    if (concurrentAlert) {
      recommendations.push(
        `⚠️  ${concurrentAlert.currentValue} concurrent deletion attempts blocked. Users may be experiencing UI confusion.`
      );
      recommendations.push(
        `💡 Review UI feedback for deletion progress. Consider adding better loading states.`
      );
    }

    // No recent jobs recommendations
    const noJobsAlert = alerts.find((a) => a.name === 'no_recent_jobs' && a.exceeded);
    if (noJobsAlert) {
      recommendations.push(
        `⚠️  No delete jobs in last 24 hours. This may be normal or indicate a stuck system.`
      );
      recommendations.push(
        `💡 Check OrphanedJobRecovery logs and verify worker pool is running.`
      );
    }

    // General health check
    if (recommendations.length === 0) {
      recommendations.push(`✅ Delete system operating normally. No alerts detected.`);
    }

    return recommendations;
  }

  /**
   * Get human-readable monitoring summary
   */
  getMonitoringSummary(): string {
    const report = this.checkAlerts();
    const exceededAlerts = report.alerts.filter((a) => a.exceeded);

    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push('DELETE SYSTEM MONITORING REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Timestamp: ${new Date(report.timestamp).toISOString()}`);
    lines.push('');

    // Metrics snapshot
    lines.push('Metrics Snapshot:');
    lines.push(`  Success Rate: ${report.metricsSnapshot.successRate.toFixed(2)}%`);
    lines.push(
      `  Avg Duration: ${report.metricsSnapshot.avgDuration?.toFixed(0) || 'N/A'}ms`
    );
    lines.push(
      `  P95 Duration: ${report.metricsSnapshot.p95Duration?.toFixed(0) || 'N/A'}ms`
    );
    lines.push(`  Total Jobs: ${report.metricsSnapshot.totalJobs}`);
    lines.push(`  Failed Jobs: ${report.metricsSnapshot.failedJobs}`);
    lines.push(
      `  Concurrent Attempts Blocked: ${report.metricsSnapshot.concurrentAttempts}`
    );
    lines.push('');

    // Alerts
    if (exceededAlerts.length > 0) {
      lines.push(`🚨 ALERTS (${exceededAlerts.length}):`);
      exceededAlerts.forEach((alert) => {
        lines.push(
          `  [${alert.severity.toUpperCase()}] ${alert.name}: ${alert.description}`
        );
        lines.push(
          `    Current: ${alert.currentValue.toFixed(0)} | Threshold: ${alert.threshold}`
        );
      });
    } else {
      lines.push('✅ No alerts detected');
    }
    lines.push('');

    // Recommendations
    lines.push('Recommendations:');
    report.recommendations.forEach((rec) => {
      lines.push(`  ${rec}`);
    });

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Log monitoring summary to console
   */
  logSummary(): void {
    console.log(this.getMonitoringSummary());
  }
}

// Singleton instance
let monitorInstance: DeleteMonitor | null = null;

/**
 * Get or create DeleteMonitor singleton
 */
export function getDeleteMonitor(): DeleteMonitor {
  if (!monitorInstance) {
    monitorInstance = new DeleteMonitor();
  }
  return monitorInstance;
}

/**
 * Reset DeleteMonitor singleton (for testing)
 */
export function resetDeleteMonitor(): void {
  monitorInstance = null;
}
