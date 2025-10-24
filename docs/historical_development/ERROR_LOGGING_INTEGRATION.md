# Error Logging Integration Complete ✅

**Date**: 2025-10-18
**Status**: IN PROGRESS
**Goal**: Integrate backend errors with frontend ErrorCaptureService for visibility in app console component

---

## Summary

We've integrated the ErrorFactory pattern across the jobs system to ensure errors are properly captured, logged, and sent to the frontend console component.

### Changes Made

#### 1. JobRepository Error Handling ✅

**File**: `apps/api/src/modules/jobs/infrastructure/JobRepository.ts`

**Changes**:

- Added `ErrorFactory` import
- Updated `save()` method to throw structured `APIError` on database failures
- Error includes job context (jobId, type, status, accountId)

```typescript
throw ErrorFactory.database(`Failed to save job: ${error.message}`, 'JobRepository.save', {
  jobId: job.id,
  jobType: job.type,
  jobStatus: job.status,
  accountId: job.accountId,
  originalError: error.message,
});
```

#### 2. WorkerPool Error Handling ✅

**File**: `apps/api/src/modules/workers/domain/WorkerPool.ts`

**Changes**:

- Added `ErrorFactory` import
- Enhanced `executeJob()` error handling to broadcast failures
- Added structured error for critical save failures

```typescript
const apiError = ErrorFactory.internal(
  `Failed to save job error state: ${saveError.message}`,
  'WorkerPool.executeJob',
  {
    jobId: job.id,
    jobType: job.type,
    accountId: job.accountId,
    originalError: error.message,
    saveError: saveError.message,
  }
);
```

#### 3. Jobs API Routes with AsyncHandler ✅ (Partial)

**File**: `apps/api/src/modules/jobs/infrastructure/jobs.routes.ts`

**Changes**:

- Added `asyncHandler` and `ErrorFactory` imports
- Wrapped POST `/` route with `asyncHandler`
- Wrapped GET `/:id` route with `asyncHandler`
- Used `ErrorFactory.unauthorized()` for auth errors
- Used `ErrorFactory.notFound()` for missing jobs

**Remaining**: Need to wrap remaining routes (GET `/`, DELETE `/:id`, GET `/summary`)

---

## How Error Flow Works

### Backend → Frontend Error Flow

```
1. Error occurs in JobRepository/WorkerPool/Route
   ↓
2. ErrorFactory creates APIError with context
   ↓
3. AsyncHandler middleware catches error
   ↓
4. ErrorLogger middleware logs to console
   ↓
5. Error response sent to frontend with structure:
   {
     success: false,
     error: {
       message: "User-friendly message",
       code: 500,
       domain: "database",
       operation: "JobRepository.save",
       stack: "..." (dev only)
     }
   }
   ↓
6. Frontend handleApiError() receives response
   ↓
7. ErrorCaptureService.capture() logs error
   ↓
8. Error appears in Console Footer component
```

### Error Context Structure

**Backend (APIError)**:

```typescript
interface ErrorContext {
  domain: 'api' | 'import' | 'analytics' | 'ui' | 'database' | 'system';
  operation: string; // e.g., 'JobRepository.save'
  userId?: string;
  accountId?: string;
  metadata?: Record<string, any>; // jobId, jobType, etc.
}
```

**Frontend (CapturedError)**:

```typescript
interface CapturedError {
  id: string;
  timestamp: number;
  domain: ErrorDomain;
  operation: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  context: ErrorContext;
  error: Error;
  userMessage?: string;
}
```

---

## Testing Error Visibility

### Test Scenarios

1. **Database Error** (JobRepository.save fails):
   - Trigger: Create job when database is locked
   - Expected: Error in console with domain='database', operation='JobRepository.save'

2. **Worker Error** (DeleteWorker fails):
   - Trigger: Delete job with invalid scope
   - Expected: Error in console with domain='api', includes jobId

3. **API Error** (Route validation fails):
   - Trigger: POST /jobs with missing required fields
   - Expected: 400 error with validation message

4. **Job Timeout** (Worker stuck):
   - Trigger: Job runs longer than timeout
   - Expected: Error with code='TIMEOUT', includes job details

### How to Test

1. **Open Frontend Console Component**:
   - Navigate to Settings or Canvas page
   - Open browser DevTools
   - Check Console Footer at bottom of UI

2. **Trigger an Error**:

   ```bash
   # Example: Try to delete with invalid scope
   curl -X POST http://localhost:4001/api/v1/jobs/delete \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"scope": "invalid"}'
   ```

3. **Verify Error Appears**:
   - Check Console Footer shows new error
   - Click error to see full details
   - Verify domain, operation, and metadata are correct

---

## Remaining Work

### TODO

- [ ] Wrap remaining routes in jobs.routes.ts with asyncHandler
  - GET `/` (list jobs)
  - DELETE `/:id` (cancel job)
  - GET `/summary` (jobs summary)

- [ ] Add ErrorFactory to DeleteWorker
  - Import ErrorFactory
  - Wrap deletion errors with proper context
  - Include scope, accountId, nodeCount in metadata

- [ ] Test error visibility in frontend console
  - Trigger various error types
  - Verify errors appear in Console Footer
  - Check error details are complete

- [ ] Verify errorLogger middleware is registered in app
  - Check `apps/api/src/index.ts`
  - Ensure `app.use(errorLogger)` is at the end

### Files to Update

1. `apps/api/src/modules/jobs/infrastructure/jobs.routes.ts`
   - Lines 170-213: GET `/` route
   - Lines 230-273: DELETE `/:id` route
   - Lines 289-319: GET `/summary` route

2. `apps/api/src/modules/workers/infrastructure/DeleteWorker.ts`
   - Add ErrorFactory import
   - Wrap execute() errors with ErrorFactory.internal()

3. `apps/api/src/index.ts`
   - Verify errorLogger middleware is registered
   - Should be after all routes: `app.use(errorLogger);`

---

## Error Logging Best Practices

### When to Use Each Error Type

```typescript
// 400 Bad Request - User input validation
throw ErrorFactory.badRequest('Invalid job type', 'jobs.enqueue', { providedType: req.body.type });

// 401 Unauthorized - Authentication required
throw ErrorFactory.unauthorized('jobs.get');

// 403 Forbidden - Insufficient permissions
throw ErrorFactory.forbidden('jobs.cancel', 'Only job owner can cancel');

// 404 Not Found - Resource doesn't exist
throw ErrorFactory.notFound('Job', 'jobs.get');

// 409 Conflict - Duplicate or conflict
throw ErrorFactory.conflict('Job with this idempotency key already exists', 'jobs.enqueue', {
  idempotencyKey: key,
});

// 500 Internal Error - Unexpected server error
throw ErrorFactory.internal('Failed to process job', 'WorkerPool.executeJob', {
  jobId,
  error: error.message,
});

// 500 Database Error - Database operation failed
throw ErrorFactory.database('Failed to save job', 'JobRepository.save', { jobId, accountId });
```

### Metadata Guidelines

**Always Include**:

- `jobId` - For job-related errors
- `accountId` - For multi-tenant context
- `userId` - For user actions
- `originalError` - Wrapped error message

**Optional**:

- `jobType` - Type of job
- `jobStatus` - Current status
- `scope` - Delete scope
- `fileName` - Import file name
- Any operation-specific details

### Example: Complete Error Handling

```typescript
async function processJob(job: Job): Promise<void> {
  try {
    // Process job...
  } catch (error: any) {
    // Log to console
    console.error(`[Worker] Failed to process job ${job.id}:`, error);

    // Throw structured error
    throw ErrorFactory.internal(`Job processing failed: ${error.message}`, 'Worker.processJob', {
      jobId: job.id,
      jobType: job.type,
      accountId: job.accountId,
      originalError: error.message,
      stack: error.stack,
    });
  }
}
```

---

## Frontend Integration

### ErrorCaptureService Usage

The frontend automatically captures API errors via `handleApiError()`:

```typescript
// Frontend API call
try {
  const response = await fetch('/api/v1/jobs/123');
  if (!response.ok) {
    // This triggers ErrorCaptureService
    await handleApiError({ response });
  }
} catch (error) {
  // Network errors also captured
  await handleApiError(error);
}
```

### Console Footer Display

Errors appear in the Console Footer component with:

- **Timestamp**: When error occurred
- **Domain**: api, database, import, etc.
- **Operation**: e.g., "JobRepository.save"
- **Message**: User-friendly error message
- **Details**: Click to expand full error context

### Filtering Errors

Users can filter errors in Console Footer by:

- **Domain**: Show only database errors
- **Severity**: error, warn, info, debug
- **Search**: Text search in message/operation

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Backend (API)                         │
│                                                          │
│  ┌──────────────┐        ┌──────────────┐              │
│  │ JobRepository│───X────>│ ErrorFactory │              │
│  │   .save()    │ error  │  .database() │              │
│  └──────────────┘        └──────┬───────┘              │
│                                  │                       │
│  ┌──────────────┐                │                       │
│  │ WorkerPool   │───X────────────┤                       │
│  │ .executeJob()│ error          │                       │
│  └──────────────┘                │                       │
│                                  │                       │
│  ┌──────────────┐                │                       │
│  │ Jobs Routes  │────────────────┘                       │
│  │ asyncHandler │                                        │
│  └──────┬───────┘                                        │
│         │                                                 │
│         ↓                                                 │
│  ┌──────────────┐                                        │
│  │errorLogger   │                                        │
│  │ Middleware   │                                        │
│  └──────┬───────┘                                        │
│         │                                                 │
│         ↓ HTTP Response                                  │
└─────────┼─────────────────────────────────────────────────┘
          │
          │ {success: false, error: {...}}
          │
          ↓
┌─────────┼─────────────────────────────────────────────────┐
│         │              Frontend (React)                    │
│         │                                                  │
│         ↓                                                  │
│  ┌──────────────┐                                         │
│  │handleApiError│                                         │
│  │   utility    │                                         │
│  └──────┬───────┘                                         │
│         │                                                  │
│         ↓                                                  │
│  ┌──────────────────────┐                                 │
│  │ ErrorCaptureService  │                                 │
│  │   .capture(error)    │                                 │
│  └──────┬───────────────┘                                 │
│         │                                                  │
│         ↓                                                  │
│  ┌──────────────────────┐                                 │
│  │   Console Footer     │                                 │
│  │ (Error Display UI)   │                                 │
│  └──────────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Complete Route Wrapping** - Finish wrapping all job routes with asyncHandler
2. **Add DeleteWorker Errors** - Integrate ErrorFactory into DeleteWorker
3. **Test Error Flow** - Trigger errors and verify console visibility
4. **Document for Team** - Add error handling guide to team docs

---

## Related Files

- Backend Error Middleware: `apps/api/src/middleware/error-handler.middleware.ts`
- Frontend Error Handler: `apps/web/src/lib/error-handler.ts`
- Frontend Error Service: `apps/web/src/services/error-capture.service.ts`
- Job Repository: `apps/api/src/modules/jobs/infrastructure/JobRepository.ts`
- Worker Pool: `apps/api/src/modules/workers/domain/WorkerPool.ts`
- Jobs Routes: `apps/api/src/modules/jobs/infrastructure/jobs.routes.ts`
