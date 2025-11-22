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
   * delete_operations_jobs_completed{status="success",scope="canvas"} 42
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

  return router;
}
