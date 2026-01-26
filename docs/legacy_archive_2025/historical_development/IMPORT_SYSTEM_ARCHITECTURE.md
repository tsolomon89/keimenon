# Import System Architecture

## Overview

The Canvas Memory import system has been consolidated to a **single job-based rail** for all production imports. Legacy import paths have been quarantined (not deleted) and gated behind environment flags for testing purposes only.

**Last Updated**: October 24, 2025
**Status**: Active (v1.0)

## Architecture Principles

1. **Single Rail**: All production imports use `POST /api/v1/jobs/import`
2. **Job-Based**: Async processing with background workers
3. **Multi-Tenant**: Server-side tenancy validation with ULID actor tracking
4. **Non-Destructive**: Legacy code quarantined to `.old.*` files, not deleted
5. **Observable**: Real-time progress via SSE, comprehensive audit logging

## Production Import Flow

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ POST multipart/form-data
       │ Authorization: Bearer <token>
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ POST /api/v1/jobs/import                                │
│ - Extract tenancy from server-side token only          │
│ - Generate stable actorId (ULID)                       │
│ - Create import job with embedded tenancy metadata     │
│ - Return jobId immediately                             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │  Job Queue    │
                │   (SQLite)    │
                └───────┬───────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Worker Pool         │
            │  - ImportWorker       │
            │  - Single Writer      │
            │  - WAL mode enabled   │
            └───────┬───────────────┘
                    │
                    ├─► Parse files
                    ├─► Normalize data
                    ├─► Detect duplicates
                    ├─► Await user decisions (if needed)
                    ├─► Materialize to database
                    └─► Broadcast completion via SSE
                          │
                          ▼
                  ┌───────────────────┐
                  │  SSE Broadcaster  │
                  │  - Account-scoped │
                  │  - 2Hz coalescing │
                  │  - Auto cleanup   │
                  └───────┬───────────┘
                          │
                          ▼
                    ┌───────────┐
                    │  Client   │
                    │  Updates  │
                    └───────────┘
```

## File Structure

### Active Components (Production)

**Frontend:**

- `apps/web/src/components/canvas/ChatImportModal.tsx` - Primary import UI
- `apps/web/src/components/canvas/CanvasSidebar.tsx` - Entry point (line 517)
- `apps/web/src/components/canvas/ImportMethodSelector.tsx` - Debug selector (flag-gated)

**Backend:**

- `apps/api/src/modules/jobs/infrastructure/import-jobs.routes.ts` - Job creation endpoint
- `apps/api/src/modules/workers/infrastructure/ImportWorker.ts` - File processing
- `apps/api/src/modules/jobs/infrastructure/SSEBroadcaster.ts` - Real-time updates
- `apps/api/src/modules/jobs/infrastructure/stream.routes.ts` - SSE endpoint

**Shared:**

- `packages/types/src/import-job-stages.ts` - Shared enum for progress stages
- `apps/api/src/modules/jobs/domain/Job.ts` - Job domain model with tenancy

### Quarantined Components (Legacy)

**Frontend:**

- `apps/web/src/components/canvas/ImportModule.old.tsx` - Browser-only import (broken)
- `apps/web/src/components/canvas/LocalFirstImportModal.old.tsx` - Hybrid approach
- `apps/web/src/components/import/StreamingUploadModal.old.tsx` - Old streaming uploader

**Backend:**

- `apps/api/src/routes/import.old.ts` - Legacy sync endpoints (/chat, /chat/batch)
- `apps/api/src/routes/import-stream.old.ts` - Old streaming approach
- `apps/api/src/routes/import-progress-stream.old.ts` - Per-upload SSE (orphaned)
- `apps/api/src/routes/import-jobs.old.ts` - Old job tracking

## Environment Flags

### API Flags (plain names)

```env
# Enable legacy import routes (default: disabled)
ENABLE_LEGACY_IMPORTS=0

# Enable hybrid local-first import fallback (default: disabled)
ENABLE_HYBRID_LOCAL_FIRST=0

# Enable import method debug selector UI (default: disabled)
DEBUG_IMPORT_SELECTOR=0
```

### Web Flags (NEXT*PUBLIC* prefix)

```env
# Enable legacy import routes (default: disabled)
NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS=0

# Enable hybrid local-first import fallback (default: disabled)
NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST=0

# Enable import method debug selector UI (default: disabled)
NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR=0
```

## Tenancy Model

All imports are multi-tenant with server-side security enforcement:

```typescript
interface TenancyMetadata {
  actorId: string; // Unique ULID for this operation
  userId: string; // Who initiated the import
  accountId: string; // Which account owns the data
  userType: string; // user | admin | super_admin
  accountMembership: string; // owner | admin | member
  userEmail: string; // For audit logs
}
```

**Security Rules:**

1. ✅ **ALWAYS** extract tenancy from server-side validated JWT token
2. ❌ **NEVER** trust client-sent account_id, user_type, or membership fields
3. ✅ Generate stable `actorId` using ULID (not string concatenation)
4. ✅ Embed tenancy in `job.config.tenancy` for audit trail

**Example (import-jobs.routes.ts):**

```typescript
// Extract from server-validated token only
const userId = (req as any).user?.userId;
const userAccountId = (req as any).user?.accountId;
const userType = (req as any).user?.user_type || 'user';
const accountMembership = (req as any).user?.account_membership || 'member';

// Generate stable actor ID
const actorId = ulid();

// Embed in job config
const jobConfig = {
  files: [...],
  importOptions: {...},
  tenancy: {
    actorId,
    userId,
    accountId: targetAccountId,
    userType,
    accountMembership,
    userEmail,
  },
};
```

## Database Configuration

**SQLite WAL Mode** (enabled in [packages/db/src/sqlite/client.ts:382-389](../packages/db/src/sqlite/client.ts#L382-L389)):

```javascript
// Enable WAL mode for better concurrency
this.db.pragma('journal_mode = WAL');

// Reduce fsync frequency for better performance
this.db.pragma('synchronous = NORMAL');

// Prevent SQLITE_BUSY errors on concurrent access
this.db.pragma('busy_timeout = 5000');
```

**Single Writer Pattern:**

- Only `ImportWorker` writes to database via `DatabaseWriteQueue`
- UI and routes are **read-only** (call API endpoints for reads)
- Prevents lock contention and ensures data consistency

**Runtime Guard** (Defensive Programming):

- `SQLiteClient` has `allowDirectWrites` flag (default: `false`)
- All write methods check this flag and throw if disabled
- `DatabaseWriteQueue` enables writes in constructor (authorized path)
- Migrations and workers must call `db.enableDirectWrites()` explicitly
- Example error:
  ```
  Direct database write denied: createNodes.
  Use DatabaseWriteQueue for writes. Direct writes are only allowed in workers.
  If you are implementing a worker, call db.enableDirectWrites() first.
  ```

## SSE (Server-Sent Events)

**Endpoint:** `GET /api/v1/stream/jobs`

**Features:**

- Account-scoped connections (multi-tenant isolation)
- Event coalescing (~2Hz rate limiting)
- Automatic cleanup on disconnect (`response.on('close')`)
- Heartbeat every 30s to keep connections alive

**Event Types:**

- `connected` - Initial connection confirmation
- `jobs.update` - Batch of job updates (coalesced)
- `heartbeat` - Keep-alive ping

**Example Message:**

```json
{
  "type": "jobs.update",
  "data": {
    "jobs": [
      {
        "jobId": "job_abc123",
        "type": "import",
        "status": "running",
        "progress": {
          "current": 500,
          "total": 1000,
          "percent": 50,
          "message": "Processing conversations..."
        }
      }
    ],
    "timestamp": 1729766400000
  }
}
```

## Testing

**Test Files:**

- `apps/api/src/__tests__/e2e-import-workflow.test.ts` - Full import flow
- `apps/api/src/__tests__/jobs-system.test.ts` - Job system + tenancy validation
- `apps/api/src/__tests__/sse-reconnection.test.ts` - SSE lifecycle + cleanup
- `apps/api/src/__tests__/utils/test-helpers.ts` - Shared test utilities

**Key Test Coverage:**

- ✅ Job creation via `/api/v1/jobs/import`
- ✅ Worker processing and completion
- ✅ SSE progress updates
- ✅ Tenancy metadata validation (actorId, userType, etc.)
- ✅ Connection cleanup on disconnect
- ✅ Multi-tenant isolation

## Debug Mode

When `NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR=1`, ChatImportModal displays:

1. **Debug Selector** - Dropdown to test different import paths
2. **Tenancy Badge** - Shows current rail, account, and permission level

```
┌─────────────────────────────────────────────────────┐
│ Import Rail: job-based · Account: acc_abc123 ·     │
│ Permission: admin                                   │
└─────────────────────────────────────────────────────┘
```

## Migration Guide

### For Developers

**Before (Legacy):**

```typescript
// DON'T USE - Quarantined
<ImportModule variant="panel" onClose={...} />
```

**After (Current):**

```typescript
// Use this instead
<ChatImportModal onDismiss={...} />
```

### For Tests

**Before (Legacy):**

```typescript
// DON'T USE - Wrong endpoint
const response = await fetch(`${API_URL}/api/v1/import/enhanced`, {...});
```

**After (Current):**

```typescript
// Use this instead
const response = await fetch(`${API_URL}/api/v1/jobs/import`, {...});
```

## Known Issues & Future Work

### Completed ✅

- Single rail consolidation
- File quarantine (non-destructive)
- Tenancy threading with ULID actor IDs
- SSE connection cleanup
- TypeScript builds pass
- Test coverage for tenancy validation

### Optional Enhancements

- [ ] Integrate `ImportJobStage` enum in ImportWorker progress messages
- [ ] Add SSE `stage` field using enum values
- [ ] Runtime assertion guard for single writer pattern
- [ ] Migrate import-enhanced.ts to use job-based system

## References

- [Job System Implementation](../apps/api/src/modules/jobs/) - Domain-driven job system
- [Import Worker](../apps/api/src/modules/workers/infrastructure/ImportWorker.ts) - File processing logic
- [SSE Broadcaster](../apps/api/src/modules/jobs/infrastructure/SSEBroadcaster.ts) - Real-time updates
- [SQLite Client](../packages/db/src/sqlite/client.ts) - Database configuration
- [Import Job Stages](../packages/types/src/import-job-stages.ts) - Shared enum definition

## Support

For questions or issues:

1. Check test files for usage examples
2. Review error logs in console (look for "Import Rail:" debug output)
3. Verify environment flags are set correctly
4. Confirm using job-based endpoint (`/api/v1/jobs/import`)

---

**Document Version:** 1.0
**Last Reviewed:** October 24, 2025
**Maintainer:** Development Team
