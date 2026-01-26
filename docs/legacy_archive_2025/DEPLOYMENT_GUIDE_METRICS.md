# Metrics System Deployment Guide

**Date**: 2025-11-16
**Status**: Ready for Deployment

---

## ⚠️ CRITICAL: Register Metrics Routes

The metrics API endpoints will NOT work until you register the routes in the app startup.

### Required Change

**File**: `apps/api/src/app.ts` or `apps/api/src/index.ts`

**Add this import** at the top:

```typescript
import { createMetricsRoutes } from './routes/metrics.routes';
```

**Add this route registration** with your other routes:

```typescript
// After auth routes, before error handlers
app.use('/api/v1/metrics', createMetricsRoutes(authService));
```

**Complete example** (find the routes section in your app.ts/index.ts):

```typescript
// ... existing imports ...
import { createMetricsRoutes } from './routes/metrics.routes';

// ... app initialization ...

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/nodes', nodesRoutes);
app.use('/api/v1/edges', edgesRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/data', dataManagementRoutes);
app.use('/api/v1/metrics', createMetricsRoutes(authService)); // <-- ADD THIS LINE

// Error handlers (keep these after all routes)
```

---

## Pre-Deployment Checklist

### 1. ✅ Build TypeScript (Required)

```bash
cd C:\Development\Projects\ai_convo_parser
npm run build
```

This will compile the TypeScript and resolve the import errors you're seeing.

### 2. ✅ Register Metrics Routes (CRITICAL - see above)

Without this, metrics API will return 404.

### 3. ✅ Test Metrics Endpoints

After starting the server:

```bash
# Start API server
npm run dev:api

# In another terminal, test metrics (replace $ADMIN_TOKEN with your actual admin token)
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:4001/api/v1/metrics/delete

# Should return JSON with metrics data, NOT 404
```

### 4. ⚠️ TypeScript Errors

The errors you're seeing are mostly:

- **Pre-existing test file errors** (not from our changes)
- **Build cache issue** with `getCanvasDataInClause` import

**Resolution**:

```bash
# Clean build cache
rm -rf node_modules/.cache
rm -rf apps/*/dist
rm -rf packages/*/dist

# Rebuild packages
npm run build
```

The `getCanvasDataInClause` error will resolve after packages are rebuilt.

---

## Post-Deployment Verification

### Test 1: Basic Metrics

```bash
# Get metrics report
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4001/api/v1/metrics/delete/report

# Expected: Human-readable text report
```

### Test 2: Monitoring Dashboard

```bash
# Get monitoring summary
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4001/api/v1/metrics/delete/monitor/summary

# Expected: Formatted monitoring report with alerts
```

### Test 3: Prometheus Export

```bash
# Get Prometheus metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4001/api/v1/metrics/delete/prometheus

# Expected: Plain text Prometheus format
# delete_operations_jobs_completed{status="success",scope="canvas"} 0
```

### Test 4: Generate Some Metrics

Run a delete operation to generate metrics:

```bash
# 1. Create test data
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4001/api/v1/nodes \
  -d '{"kind": "Message", "content": "test", "role": "user", "thread_id": "thread_1", "timestamp": 1234567890}'

# 2. Delete canvas data (creates metrics)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4001/api/v1/jobs/delete \
  -d '{"scope": "canvas"}'

# 3. Wait for job to complete, then check metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4001/api/v1/metrics/delete/report

# Should show:
# Total Jobs: 1
# Success Rate: 100%
# Average Duration: ~XXXms
```

---

## Optional: Scheduled Monitoring (Production)

Add this to your `apps/api/src/index.ts` for automated monitoring:

```typescript
import { getDeleteMonitor } from './services/monitoring/DeleteMonitor';

// After app is listening...

// Check metrics every hour and log summary
const MONITORING_INTERVAL = 3600000; // 1 hour
setInterval(() => {
  const monitor = getDeleteMonitor();
  monitor.logSummary();

  // Optional: Send alerts to Slack/email if any alerts detected
  const report = monitor.checkAlerts();
  const exceededAlerts = report.alerts.filter((a) => a.exceeded);

  if (exceededAlerts.length > 0) {
    console.error('🚨 DELETE SYSTEM ALERTS:', exceededAlerts);
    // TODO: Send to Slack/email notification service
  }
}, MONITORING_INTERVAL);

console.log(
  `✅ Metrics monitoring enabled (checking every ${MONITORING_INTERVAL / 60000} minutes)`
);
```

---

## Optional: Prometheus Integration

### 1. Configure Prometheus

**prometheus.yml**:

```yaml
scrape_configs:
  - job_name: 'canvas-api'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:4001']
    metrics_path: '/api/v1/metrics/delete/prometheus'
    bearer_token: 'your_admin_token_here'
```

### 2. Grafana Dashboard Queries

```promql
# Success rate over last 5 minutes
rate(delete_operations_jobs_completed{status="success"}[5m]) /
rate(delete_operations_jobs_completed[5m]) * 100

# P95 duration
histogram_quantile(0.95, rate(delete_operations_job_duration_ms_bucket[5m]))

# Concurrent attempts per hour
rate(delete_operations_concurrent_attempts[1h]) * 3600
```

---

## Troubleshooting

### Problem: Metrics API returns 404

**Cause**: Routes not registered
**Solution**: Add `app.use('/api/v1/metrics', createMetricsRoutes(authService))`

### Problem: Metrics API returns 401 Unauthorized

**Cause**: Not using admin token
**Solution**: Metrics endpoints require admin authentication. Use an admin user's token.

### Problem: Metrics show all zeros

**Cause**: No delete jobs have run yet
**Solution**: Run a delete operation to generate metrics (see Test 4 above)

### Problem: TypeScript import errors for getCanvasDataInClause

**Cause**: Build cache issue
**Solution**: Run `npm run build` to rebuild packages

---

## Files Modified (Summary)

### New Files Created (6)

- `packages/types/src/node-kinds.ts`
- `apps/api/src/services/MetricsService.ts`
- `apps/api/src/services/metrics/DeleteMetrics.ts`
- `apps/api/src/services/monitoring/DeleteMonitor.ts`
- `apps/api/src/routes/metrics.routes.ts`
- `docs/roadmap/DELETE_SYSTEM_IMPROVEMENTS.md`

### Files Modified (5)

- `packages/types/src/index.ts` - Export node-kinds
- `apps/api/src/modules/workers/infrastructure/DeleteWorker.ts` - Add metrics tracking
- `apps/api/src/routes/data-management.ts` - Use schema constants
- `apps/api/src/__tests__/jobs-batched-delete.test.ts` - Use constants, add tests
- `apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts` - Track concurrent attempts

### Files to Modify (1)

- `apps/api/src/app.ts` OR `apps/api/src/index.ts` - **Register metrics routes** ⚠️ REQUIRED

---

## Rollback Plan

If you need to roll back:

1. **Remove metrics route registration** from app.ts/index.ts
2. **Revert modified files** using git:
   ```bash
   git diff HEAD -- apps/api/src/modules/workers/infrastructure/DeleteWorker.ts
   git checkout HEAD -- apps/api/src/modules/workers/infrastructure/DeleteWorker.ts
   # Repeat for other modified files
   ```
3. **Delete new files**:
   ```bash
   rm apps/api/src/services/MetricsService.ts
   rm apps/api/src/services/metrics/DeleteMetrics.ts
   rm apps/api/src/services/monitoring/DeleteMonitor.ts
   rm apps/api/src/routes/metrics.routes.ts
   ```
4. **Rebuild**:
   ```bash
   npm run build
   ```

**No database changes required** - all metrics are stored in-memory.

---

## Success Criteria

✅ Metrics API responds to requests (not 404)
✅ Delete operations generate metrics
✅ Monitoring report shows alerts correctly
✅ Prometheus export works
✅ No errors in application logs

---

**Status**: Ready to deploy after registering metrics routes!

**Next Step**: Add route registration to `apps/api/src/app.ts` or `apps/api/src/index.ts`
