/**
 * Metrics API Routes
 * Provides access to system metrics for monitoring and alerting
 *
 * Endpoints:
 * - GET /api/v1/metrics/delete - Delete operation metrics
 * - GET /api/v1/metrics/delete/prometheus - Prometheus export format
 * - GET /api/v1/metrics/delete/report - Human-readable report
 * - GET /api/v1/metrics/delete/monitor - Monitoring/alerting report
 *
 * Related:
 * - apps/api/src/services/metrics/DeleteMetrics.ts
 * - apps/api/src/services/monitoring/DeleteMonitor.ts
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { asyncHandler, ErrorFactory } from '../middleware/error-handler.middleware';
import { getDeleteMetrics } from '../services/metrics/DeleteMetrics';
import { getDeleteMonitor } from '../services/monitoring/DeleteMonitor';
import { getImportMetrics } from '../services/metrics/ImportMetrics';
import { getDbClient } from '../utils/get-db-client';
import { getImportArtifactsRoot, getUploadChunksRoot } from '../utils/import-artifacts';
import fs from 'node:fs/promises';
import path from 'node:path';

interface DirectoryStats {
  root: string;
  exists: boolean;
  files: number;
  directories: number;
  bytes: number;
}

async function collectDirectoryStats(root: string): Promise<DirectoryStats> {
  const stats: DirectoryStats = {
    root,
    exists: false,
    files: 0,
    directories: 0,
    bytes: 0,
  };

  const walk = async (dirPath: string): Promise<void> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stats.directories += 1;
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        stats.files += 1;
        try {
          const fileStat = await fs.stat(fullPath);
          stats.bytes += fileStat.size;
        } catch {
          // Best effort for diagnostics endpoint
        }
      }
    }
  };

  try {
    await fs.access(root);
    stats.exists = true;
    await walk(root);
  } catch {
    return stats;
  }

  return stats;
}

export function createMetricsRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * GET /api/v1/metrics/delete
   * Get delete operation metrics (JSON format)
   *
   * Requires admin authentication
   *
   * Returns:
   * {
   *   performance: { durationP50, durationP95, ... },
   *   failures: { "TIMEOUT": 5, ... },
   *   concurrentAttempts: 10,
   *   summary: "..."
   * }
   */
  router.get(
    '/delete',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMetrics = getDeleteMetrics();
        const report = deleteMetrics.generateReport();

        return res.json({
          success: true,
          metrics: report,
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to generate metrics',
          'metrics.getDelete',
          { errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/metrics/delete/prometheus
   * Get delete operation metrics in Prometheus format
   *
   * Requires admin authentication
   *
   * Returns plain text in Prometheus exposition format:
   * delete_operations_jobs_completed{status="success",scope="keimenon"} 42
   * delete_operations_job_duration_ms_bucket{le="100"} 5
   */
  router.get(
    '/delete/prometheus',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMetrics = getDeleteMetrics();
        const prometheusOutput = deleteMetrics.exportPrometheus();

        res.set('Content-Type', 'text/plain');
        return res.send(prometheusOutput);
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to export Prometheus metrics',
          'metrics.getDeletePrometheus',
          { errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/metrics/delete/report
   * Get human-readable metrics report
   *
   * Requires admin authentication
   *
   * Returns plain text formatted report
   */
  router.get(
    '/delete/report',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMetrics = getDeleteMetrics();
        const report = deleteMetrics.generateReport();

        res.set('Content-Type', 'text/plain');
        return res.send(report.summary);
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to generate metrics report',
          'metrics.getDeleteReport',
          { errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/metrics/delete/monitor
   * Get monitoring/alerting report
   *
   * Requires admin authentication
   *
   * Returns:
   * {
   *   timestamp: 1700000000000,
   *   alerts: [{ name, description, threshold, currentValue, exceeded, severity }, ...],
   *   metricsSnapshot: { successRate, avgDuration, ... },
   *   recommendations: ["...", ...]
   * }
   */
  router.get(
    '/delete/monitor',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMonitor = getDeleteMonitor();
        const monitoringReport = deleteMonitor.checkAlerts();

        return res.json({
          success: true,
          monitoring: monitoringReport,
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to generate monitoring report',
          'metrics.getDeleteMonitor',
          { errorName: error.name }
        );
      }
    })
  );

  /**
   * GET /api/v1/metrics/delete/monitor/summary
   * Get human-readable monitoring summary
   *
   * Requires admin authentication
   *
   * Returns plain text formatted monitoring summary with alerts and recommendations
   */
  router.get(
    '/delete/monitor/summary',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMonitor = getDeleteMonitor();
        const summary = deleteMonitor.getMonitoringSummary();

        res.set('Content-Type', 'text/plain');
        return res.send(summary);
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to generate monitoring summary',
          'metrics.getDeleteMonitorSummary',
          { errorName: error.name }
        );
      }
    })
  );

  /**
   * POST /api/v1/metrics/delete/reset
   * Reset delete metrics (for testing/debugging)
   *
   * Requires admin authentication
   *
   * WARNING: This clears all historical metrics data
   */
  router.post(
    '/delete/reset',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const deleteMetrics = getDeleteMetrics();
        deleteMetrics.reset();

        return res.json({
          success: true,
          message: 'Delete metrics reset successfully',
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to reset metrics',
          'metrics.resetDelete',
          { errorName: error.name }
        );
      }
    })
  );

  router.get(
    '/import',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const importMetrics = getImportMetrics();
        return res.json({
          success: true,
          metrics: {
            snapshot: importMetrics.getPerformanceSnapshot(),
            summary: importMetrics.getSummary(),
          },
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to fetch import metrics',
          'metrics.getImport',
          { errorName: error.name }
        );
      }
    })
  );

  router.get(
    '/import/prometheus',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const importMetrics = getImportMetrics();
        res.set('Content-Type', 'text/plain');
        return res.send(importMetrics.exportPrometheus());
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to export import metrics',
          'metrics.getImportPrometheus',
          { errorName: error.name }
        );
      }
    })
  );

  router.get(
    '/import/monitor',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const importMetrics = getImportMetrics();
        const snapshot = importMetrics.getPerformanceSnapshot();
        const failureRateThreshold = Number.parseFloat(
          process.env.IMPORT_FAILURE_ALERT_THRESHOLD || '0.2'
        );
        const stalledThreshold = Number.parseInt(
          process.env.IMPORT_STALL_ALERT_THRESHOLD || '5',
          10
        );
        const schemaMismatchThreshold = Number.parseInt(
          process.env.IMPORT_SCHEMA_MISMATCH_ALERT_THRESHOLD || '3',
          10
        );
        const hardZeroThreshold = Number.parseInt(
          process.env.IMPORT_HARD_ZERO_ALERT_THRESHOLD || '1',
          10
        );

        const alerts = [
          {
            name: 'import_failure_ratio',
            exceeded: snapshot.failureRatePercent > failureRateThreshold * 100,
            thresholdPercent: failureRateThreshold * 100,
            currentPercent: snapshot.failureRatePercent,
          },
          {
            name: 'import_stall_detected_total',
            exceeded: snapshot.stallCount >= stalledThreshold,
            thresholdCount: stalledThreshold,
            currentCount: snapshot.stallCount,
          },
          {
            name: 'import_schema_mismatch_total',
            exceeded: snapshot.schemaMismatchCount >= schemaMismatchThreshold,
            thresholdCount: schemaMismatchThreshold,
            currentCount: snapshot.schemaMismatchCount,
          },
          {
            name: 'import_hard_zero_violation_total',
            exceeded: snapshot.hardZeroViolations >= hardZeroThreshold,
            thresholdCount: hardZeroThreshold,
            currentCount: snapshot.hardZeroViolations,
          },
        ];

        return res.json({
          success: true,
          monitoring: {
            timestamp: Date.now(),
            snapshot,
            alerts,
          },
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to generate import monitoring report',
          'metrics.getImportMonitor',
          { errorName: error.name }
        );
      }
    })
  );

  router.get(
    '/import/storage-report',
    requireAuth(authService),
    requireAdmin,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const dbClient = await getDbClient(req);
        const sqliteDb = (dbClient as any).db;
        const retentionMs = Number.parseInt(
          process.env.IMPORT_RETENTION_MS || String(30 * 24 * 60 * 60 * 1000),
          10
        );
        const cutoff = Date.now() - retentionMs;

        const [importArtifacts, uploadChunks] = await Promise.all([
          collectDirectoryStats(getImportArtifactsRoot()),
          collectDirectoryStats(getUploadChunksRoot()),
        ]);

        const jobEvents = sqliteDb
          .prepare(
            `
            SELECT
              COUNT(*) as rowCount,
              COALESCE(SUM(LENGTH(data)), 0) as dataBytes
            FROM job_events
          `
          )
          .get() as { rowCount: number; dataBytes: number };

        const terminalJobsOlderThanRetention = sqliteDb
          .prepare(
            `
            SELECT COUNT(*) as count
            FROM jobs
            WHERE type = 'import'
              AND status IN ('succeeded', 'failed', 'canceled')
              AND updated_at < ?
          `
          )
          .get(cutoff) as { count: number };

        const schemaCompatibility =
          typeof (dbClient as any).assertImportSchemaCompatibility === 'function';
        let schemaCompatible = true;
        let schemaError: string | undefined;
        if (schemaCompatibility) {
          try {
            (dbClient as any).assertImportSchemaCompatibility();
          } catch (error: any) {
            schemaCompatible = false;
            schemaError = error.message;
          }
        }

        const janitorStats = (global as any).importArtifactJanitor?.getStats?.() ?? null;
        const retentionStats = (global as any).importRetentionService?.getStats?.() ?? null;

        return res.json({
          success: true,
          report: {
            generatedAt: Date.now(),
            retentionMs,
            directories: {
              importArtifacts,
              uploadChunks,
            },
            database: {
              jobEvents,
              terminalJobsOlderThanRetention: terminalJobsOlderThanRetention.count,
            },
            schemaCompatibility: {
              checked: schemaCompatibility,
              compatible: schemaCompatible,
              error: schemaError,
            },
            janitor: janitorStats,
            retention: retentionStats,
          },
        });
      } catch (error: any) {
        throw ErrorFactory.internal(
          error.message || 'Failed to build import storage report',
          'metrics.getImportStorageReport',
          { errorName: error.name }
        );
      }
    })
  );

  return router;
}
