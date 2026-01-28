# Data Deletion System - Improvements Roadmap

**Created**: 2025-11-16
**Status**: Living Document
**Owner**: Platform Team

---

## Executive Summary

This document tracks improvements to the data deletion system following the critical bug fixes implemented on 2025-11-16. The roadmap is organized into completed work, near-term priorities (Q1 2025), and long-term enhancements (Q2-Q3 2025).

### Related Documentation

- [BUG_FIX_DATA_DELETION_2025-11-16.md](../BUG_FIX_DATA_DELETION_2025-11-16.md) - Original bug fix details
- [apps/api/src/modules/workers/infrastructure/DeleteWorker.ts](../../apps/api/src/modules/workers/infrastructure/DeleteWorker.ts) - Delete worker implementation
- [packages/types/src/node-kinds.ts](../../packages/types/src/node-kinds.ts) - Schema constants

---

## ✅ COMPLETED (2025-11-16)

### Phase 1: Critical Bug Fixes

**Problem**: Data deletion system had three critical bugs causing data persistence and UI freezing.

#### 1.1 DeleteWorker Scope Error (CRITICAL)

- **Issue**: Deleted ALL nodes including system nodes (UserNode, AccountNode, Board, Constellation)
- **Fix**: Added explicit node kind filtering using schema constants
- **Files**: `DeleteWorker.ts:151-185, 276-313`
- **Test**: `jobs-batched-delete.test.ts:291-353` - Delete Scope Verification
- **Impact**: System nodes now preserved, preventing data corruption

#### 1.2 Stuck Button State (UI/UX)

- **Issue**: "Clear Keimenon Data" button could become permanently disabled
- **Fix**: Added 5-second timeout for missing operations, 5-minute timeout for stuck jobs
- **Files**: `DataManagementCard.tsx:38-101, 117-128, 345`
- **Test**: `data-management-ui-updates.spec.ts:293-360`
- **Impact**: UI recovers from network failures and orphaned jobs

#### 1.3 Scope Mismatch Between Endpoints

- **Issue**: Two delete endpoints with different node kind filters
- **Fix**: Aligned both to use same schema constants
- **Files**: `data-management.ts`, `import-jobs.routes.ts`
- **Impact**: Consistent deletion behavior across all endpoints

### Phase 1: Infrastructure Improvements

#### 1.4 Schema Constants

- **Implementation**: Created single source of truth for node kinds
- **File**: `packages/types/src/node-kinds.ts`
- **Features**:
  - `CANVAS_DATA_NODE_KINDS` constant
  - `SYSTEM_NODE_KINDS` constant
  - SQL helper functions
  - TypeScript type safety
- **Impact**: Eliminates copy-paste errors, improves maintainability

#### 1.5 Concurrent Deletion Prevention

- **Implementation**: Check for active delete jobs before creating new one
- **File**: `import-jobs.routes.ts:381-399`
- **Behavior**: Returns 409 Conflict if delete already in progress
- **Test**: `jobs-batched-delete.test.ts:750-821`
- **Impact**: Prevents race conditions and data corruption

#### 1.6 Multi-Tenant Isolation Tests

- **Implementation**: Comprehensive security tests for account boundaries
- **File**: `jobs-batched-delete.test.ts:647-742`
- **Coverage**:
  - Account A deletion doesn't affect Account B
  - Concurrent deletion prevention verified
- **Impact**: Catches cross-account data leakage vulnerabilities

### Phase 1: Cleanup & Garbage Collection

#### 1.7 Orphaned Job Recovery (Verified Working)

- **File**: `apps/api/src/modules/jobs/infrastructure/OrphanedJobRecovery.ts`
- **Behavior**: Runs on server startup, marks interrupted jobs as canceled
- **Impact**: Prevents stuck "running" jobs from blocking UI

#### 1.8 Upload Cleanup Service (Verified Working)

- **File**: `apps/api/src/modules/uploads/application/UploadCleanupService.ts`
- **Behavior**: Runs hourly to remove orphaned upload sessions
- **Impact**: Prevents storage bloat from incomplete uploads

---

## Q1 2025 Priorities (Near-Term)

### 2.1 Job Cleanup Service 🎯 HIGH PRIORITY

**Problem**: Completed jobs accumulate indefinitely in database

**Proposed Solution**:

```typescript
// apps/api/src/modules/jobs/application/JobCleanupService.ts
export class JobCleanupService {
  // Remove completed jobs older than 30 days
  // Remove failed jobs older than 90 days
  // Keep jobs with data_tag='test' for debugging
}
```

**Configuration**:

- Retention: Completed (30 days), Failed (90 days)
- Frequency: Daily at 2 AM
- Dry-run mode for testing

**Files to Create**:

- `apps/api/src/modules/jobs/application/JobCleanupService.ts`
- `apps/api/src/modules/jobs/application/JobCleanupService.test.ts`
- `apps/api/src/__tests__/job-cleanup-integration.test.ts`

**Success Criteria**:

- Jobs auto-removed after retention period
- Audit log entry for each cleanup run
- Admin dashboard shows cleanup statistics

**Effort**: 1-2 days
**Risk**: Low (soft delete option available)

---

### 2.2 Deletion Metrics & Observability 🎯 HIGH PRIORITY

**Problem**: No visibility into deletion performance or failures

**Proposed Solution**: Add comprehensive metrics tracking

**Metrics to Track**:

- Delete job duration (p50, p95, p99)
- Nodes deleted per job (histogram)
- Delete failure rate
- Concurrent deletion attempts (409 responses)
- Average batch processing time

**Implementation**:

```typescript
// apps/api/src/services/metrics/DeleteMetrics.ts
export class DeleteMetrics {
  recordJobDuration(jobId: string, durationMs: number): void;
  recordNodesDeleted(jobId: string, count: number): void;
  recordFailure(jobId: string, error: string): void;
  recordConcurrentAttempt(accountId: string): void;
}
```

**Visualization**:

- Grafana dashboard for delete metrics
- Alerts for:
  - Delete failure rate > 5%
  - Average duration > 5 minutes
  - Concurrent attempts > 10/hour

**Files to Create**:

- `apps/api/src/services/metrics/DeleteMetrics.ts`
- `apps/api/src/services/monitoring/DeleteMonitor.ts`
- `apps/api/src/services/alerts/DeleteAlerts.ts`

**Success Criteria**:

- Metrics exported to Prometheus/Grafana
- Alert notifications to Slack/email
- Monthly metrics report generated

**Effort**: 2-3 days
**Risk**: Low (non-breaking addition)

---

### 2.3 Cascading Delete Verification 🎯 MEDIUM PRIORITY

**Problem**: No explicit verification that foreign key cascades work correctly

**Proposed Solution**: Add integration tests for cascade behavior

**Test Scenarios**:

- Delete node → edges auto-deleted (FOREIGN KEY CASCADE)
- Delete ChatThread → Message nodes orphaned (verify cleanup)
- Delete Group → IN_GROUP edges removed
- Delete Folder → FOLDS_INTO_FOLDER edges removed

**Files to Create**:

- `apps/api/src/__tests__/cascade-delete-verification.test.ts`

**Success Criteria**:

- Test verifies no orphaned edges after node deletion
- Test catches foreign key constraint violations
- Run as part of CI/CD pipeline

**Effort**: 1 day
**Risk**: Low (testing only)

---

## Q2 2025 Enhancements (Medium-Term)

### 3.1 Soft Delete with Retention Period 🔮 FUTURE

**Problem**: Accidental deletions cannot be recovered

**Proposed Solution**:

- Mark nodes as `deleted_at` timestamp instead of hard delete
- Purge soft-deleted nodes after 30 days
- Add "Restore Deleted Data" UI feature

**Database Schema Change**:

```sql
ALTER TABLE nodes ADD COLUMN deleted_at INTEGER DEFAULT NULL;
CREATE INDEX idx_nodes_deleted_at ON nodes(deleted_at);
```

**API Changes**:

- `DELETE /data/keimenon` → soft delete
- `POST /data/restore` → restore soft-deleted data
- `DELETE /data/purge` → hard delete after retention

**Files to Modify**:

- Database migration: `019_add_soft_delete.sql`
- DeleteWorker: Update queries to SET deleted_at
- Data queries: Add `WHERE deleted_at IS NULL`

**Success Criteria**:

- Users can restore deleted data within 30 days
- Purge job runs automatically
- Minimal performance impact (<10ms query overhead)

**Effort**: 5-7 days
**Risk**: Medium (schema migration required)

---

### 3.2 Deletion Preview 🔮 FUTURE

**Problem**: Users don't know exactly what will be deleted

**Proposed Solution**: Add preview endpoint before deletion

**API**:

```typescript
GET /api/v1/data/preview-delete?scope=keimenon

Response:
{
  nodes: [
    { kind: 'ChatThread', count: 42, examples: [...] },
    { kind: 'Message', count: 1337, examples: [...] },
  ],
  edges: { kind: 'CONTAINS', count: 500 },
  estimatedDuration: 12000, // ms
}
```

**UI**: Show modal with:

- Breakdown by node kind
- Sample nodes to be deleted
- Estimated deletion time
- "Confirm" button

**Files to Create**:

- `apps/api/src/routes/data-management.ts` - GET `/preview-delete`
- `apps/web/src/components/settings/DeletionPreviewModal.tsx`

**Success Criteria**:

- Preview shows accurate counts
- Preview loads in <500ms
- User can inspect sample nodes

**Effort**: 2-3 days
**Risk**: Low

---

### 3.3 Deletion Notifications 🔮 FUTURE

**Problem**: Users don't receive confirmation when deletion completes

**Proposed Solution**: Add notification system

**Notifications**:

- Email: "Keimenon data deletion completed"
- In-app toast: "Deleted 1,234 nodes successfully"
- SSE event: Real-time progress updates

**Files to Create**:

- `apps/api/src/services/notifications/DeletionNotificationService.ts`
- `apps/web/src/hooks/useDeletionNotifications.ts`

**Success Criteria**:

- Email sent within 1 minute of completion
- Toast shows immediately after deletion
- SSE streams progress updates every 5 seconds

**Effort**: 2-3 days
**Risk**: Low

---

## Q3 2025 Enhancements (Long-Term)

### 4.1 Feature Flags for Deletion 🔮 FUTURE

**Problem**: Cannot gradually roll out deletion features

**Proposed Solution**: Add feature flags

**Flags**:

- `enable_soft_delete`: Enable soft delete instead of hard delete
- `enable_deletion_preview`: Show preview before deletion
- `enable_concurrent_prevention`: Block concurrent deletions
- `enable_deletion_notifications`: Send email notifications

**Implementation**:

```typescript
// apps/api/src/utils/feature-flags.ts
export function isFlagEnabled(flag: string, accountId: string): boolean;
```

**Success Criteria**:

- Flags configurable per account
- Flags changeable without deployment
- Admin UI for managing flags

**Effort**: 3-4 days
**Risk**: Medium

---

### 4.2 Rate Limiting for Deletions 🔮 FUTURE

**Problem**: No protection against deletion abuse

**Proposed Solution**: Add rate limits

**Limits**:

- 5 deletions per account per hour
- 100 deletions per account per day
- Admin accounts exempt

**Implementation**:

```typescript
// apps/api/src/middleware/deletion-rate-limiter.ts
export function checkDeletionRateLimit(accountId: string): boolean;
```

**Success Criteria**:

- Rate limit enforced with 429 status
- Error message explains limit
- Rate limit resets correctly

**Effort**: 1-2 days
**Risk**: Low

---

### 4.3 Backup Verification Before Deletion 🔮 FUTURE

**Problem**: No guarantee that data is backed up before deletion

**Proposed Solution**: Verify backup exists before allowing deletion

**Workflow**:

1. User requests deletion
2. System checks last backup timestamp
3. If backup < 24 hours old → allow deletion
4. If backup > 24 hours old → show warning
5. If no backup → require manual confirmation

**API**:

```typescript
GET /api/v1/backups/verify?accountId=acc_123

Response:
{
  lastBackup: 1700000000000, // timestamp
  isRecent: true, // <24 hours
  canDelete: true,
}
```

**Success Criteria**:

- Deletion blocked if no recent backup
- Admin can override for emergency deletions
- Backup status shown in UI

**Effort**: 3-5 days
**Risk**: Medium (depends on backup infrastructure)

---

## Future Considerations (Beyond Q3 2025)

### 5.1 Undo Mechanism

**Concept**: Allow users to undo deletion within 5 minutes

**Implementation**:

- Hold deletion in "pending" state for 5 minutes
- Show "Undo" button in UI
- Execute deletion after timeout

**Complexity**: High (state machine, timing, UX)

---

### 5.2 Multi-Region Deletion Sync

**Concept**: Sync deletion across multiple database regions

**Implementation**:

- Broadcast deletion event to all regions
- Use distributed locks (Redis)
- Handle network partitions gracefully

**Complexity**: Very High (distributed systems)

---

## Testing Strategy

### Unit Tests (>90% coverage)

- DeleteWorker batch processing
- Node kind filtering logic
- Timeout recovery mechanisms

### Integration Tests

- ✅ Delete scope verification
- ✅ Multi-tenant isolation
- ✅ Concurrent deletion prevention
- ❌ Cascading delete verification (Q1 2025)
- ❌ Soft delete workflow (Q2 2025)

### E2E Tests (Playwright)

- ✅ UI button state recovery
- ✅ Background operations tracking
- ❌ Deletion preview modal (Q2 2025)
- ❌ Notification delivery (Q2 2025)

### Performance Tests

- ✅ 25,000 nodes deletion benchmark
- ✅ Event loop responsiveness
- ❌ Metrics accuracy (Q1 2025)

### Security Tests

- ✅ Account boundary enforcement
- ❌ Rate limiting enforcement (Q3 2025)
- ❌ Backup verification (Q3 2025)

---

## Rollout Strategy

### Phase 1 (COMPLETED)

- ✅ Deploy critical bug fixes
- ✅ Enable schema constants
- ✅ Enable concurrent prevention
- ✅ Monitor for regressions

### Phase 2 (Q1 2025)

- Deploy job cleanup service
- Enable deletion metrics
- Add cascade verification tests
- Monitor performance impact

### Phase 3 (Q2 2025)

- Enable soft delete (gradual rollout via feature flag)
- Deploy deletion preview
- Add notification system
- A/B test with 10% of users

### Phase 4 (Q3 2025)

- Enable feature flags
- Deploy rate limiting
- Add backup verification
- Full rollout to 100% of users

---

## Success Metrics

### Reliability

- **Target**: 99.9% delete job success rate
- **Current**: 95% (estimated)
- **Measure**: Job completion status

### Performance

- **Target**: <5 minutes for 10,000 nodes
- **Current**: ~3 minutes (measured)
- **Measure**: Job duration metrics

### User Experience

- **Target**: <1% of users report stuck button
- **Current**: ~5% (pre-fix)
- **Measure**: Support tickets

### Security

- **Target**: 0 cross-account data leakage incidents
- **Current**: 0 (verified by tests)
- **Measure**: Security audit logs

---

## Risk Assessment

### High Risk Items

1. **Soft Delete Migration** - Database schema change affecting all queries
2. **Backup Verification** - Dependency on backup infrastructure reliability

### Medium Risk Items

1. **Feature Flags** - Adds configuration complexity
2. **Multi-Region Sync** - Distributed system complexity

### Low Risk Items

1. **Metrics & Monitoring** - Non-breaking addition
2. **Rate Limiting** - Well-understood pattern
3. **Deletion Preview** - Read-only operation

---

## Rollback Plan

### Phase 1 (Current)

- **Rollback**: Revert to previous DeleteWorker version
- **Data Loss**: None (system nodes preserved)
- **Downtime**: <5 minutes

### Phase 2 (Q1 2025)

- **Rollback**: Disable job cleanup service
- **Data Loss**: None (soft delete available)
- **Downtime**: None

### Phase 3 (Q2 2025)

- **Rollback**: Disable soft delete via feature flag
- **Data Loss**: Potential (hard deletes during rollback window)
- **Downtime**: None

---

## Appendix A: Node Kind Reference

### Keimenon Data Nodes (Deleted by "Clear Keimenon Data")

- `ChatThread` - Conversation threads
- `Message` - Individual messages in threads
- `Source` - Uploaded documents
- `CodeBlock` - Extracted code snippets
- `Group` - User-created groups
- `Folder` - Organization folders

### System Nodes (Preserved)

- `UserNode` - User account records
- `AccountNode` - Account metadata
- `Board` - Keimenon boards/workspaces
- `Constellation` - Aggregated views

**Reference**: [packages/types/src/node-kinds.ts](../../packages/types/src/node-kinds.ts)

---

## Appendix B: Related Issues & PRs

### Completed

- ✅ BUG-2025-11-16: Data deletion doesn't work (3 bugs fixed)
- ✅ FEAT-2025-11-16: Add schema constants for node kinds
- ✅ FEAT-2025-11-16: Concurrent deletion prevention
- ✅ TEST-2025-11-16: Multi-tenant isolation tests

### Planned

- ❌ FEAT-Q1-2025: Job cleanup service
- ❌ FEAT-Q1-2025: Deletion metrics & monitoring
- ❌ FEAT-Q2-2025: Soft delete with retention
- ❌ FEAT-Q2-2025: Deletion preview UI
- ❌ FEAT-Q3-2025: Feature flags infrastructure

---

## Changelog

### [2025-11-16] - Phase 1 Complete

- Created schema constants (node-kinds.ts)
- Updated DeleteWorker to use constants
- Updated data-management routes to use constants
- Updated tests to use constants
- Added concurrent deletion prevention
- Added multi-tenant isolation tests
- Created this roadmap document

---

**Status**: ✅ Phase 1 Complete | 🎯 Phase 2 Starting Q1 2025

**Next Review**: 2025-12-15 (Monthly cadence)
