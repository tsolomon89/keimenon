# Chunked Upload System Architecture

Technical architecture and design decisions for the resumable chunked upload system.

## System Overview

The chunked upload system enables reliable uploads of large files (up to 2GB) by splitting them into manageable chunks (default: 10MB). It's built with domain-driven design principles and designed for local-first operation.

```
┌────────────────────────────────────────────────────────────────────┐
│                      APPLICATION FLOW                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  User selects file (50MB)                                         │
│         ↓                                                          │
│  Frontend splits into 5 chunks (10MB each)                        │
│         ↓                                                          │
│  Creates upload session via API                                    │
│         ↓                                                          │
│  Uploads 6 chunks concurrently (with retry)                       │
│         ↓                                                          │
│  Server assembles chunks when complete                            │
│         ↓                                                          │
│  Triggers import job processing                                   │
│         ↓                                                          │
│  User sees imported data in keimenon                                │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Architecture Layers

### 1. Presentation Layer (Frontend)

**Technology:** React + TypeScript

**Components:**

- `useChunkedUpload` - React hook for file upload
- `useUploadProgress` - React hook for SSE progress
- `useUploadProgressPolling` - Fallback polling hook

**Responsibilities:**

- File chunking (browser-side, using `File.slice()`)
- Concurrent chunk uploads (6 parallel, with AbortController)
- Progress tracking and UI updates
- Pause/resume/cancel controls
- LocalStorage persistence for resume after browser close

**Key Design Decisions:**

- **Client-side chunking** - Reduces server CPU, better for local-first
- **Concurrent uploads** - 6 parallel requests, optimal for most networks
- **AbortController** - Proper cancellation of in-flight requests
- **LocalStorage** - Enables resume after refresh/close

### 2. API Layer (Routes)

**Technology:** Express.js

**Endpoints:**

1. `POST /initiate` - Create upload session
2. `POST /:sessionId/chunks/:chunkIndex` - Upload chunk
3. `GET /:sessionId/progress` - SSE stream for real-time progress
4. `GET /:sessionId` - Get upload status (polling fallback)
5. `DELETE /:sessionId` - Cancel upload

**Responsibilities:**

- Request validation (Zod schemas)
- Authentication/authorization (JWT)
- Multi-tenant isolation (account_id filtering)
- Binary data handling (raw body for chunks)
- SSE connection management

**Key Design Decisions:**

- **SSE for progress** - Better than polling, lower server load
- **Separate SSE endpoint** - Keeps chunk upload simple
- **Raw binary chunks** - No JSON encoding overhead
- **Multi-tenant isolation** - Every query filters by account_id

### 3. Application Layer (Services)

**Services:**

#### UploadProgressBroadcaster

- Manages SSE connections for real-time progress
- Broadcasts progress events to connected clients
- Heartbeat mechanism (30s) to keep connections alive
- Automatic cleanup on completion/failure

#### ChunkAssemblyService

- Assembles uploaded chunks into complete file
- Sequential assembly (order matters)
- File size validation
- Cleanup of chunk files after success

#### UploadCleanupService

- Background job (runs hourly)
- Finds and deletes expired sessions (4h expiry)
- Cleans up orphaned chunk files
- Statistics tracking (disk space freed, etc.)

**Key Design Decisions:**

- **Separation of concerns** - Each service has single responsibility
- **Event-driven** - Assembly triggered automatically when complete
- **Background cleanup** - Prevents disk space accumulation
- **Graceful shutdown** - Services clean up on SIGTERM

### 4. Domain Layer (Business Logic)

**Aggregate Root:** `UploadSession`

**Properties:**

- `id` - Unique identifier (upl_timestamp_random)
- `accountId` - Multi-tenant isolation
- `userId` - User who initiated upload
- `jobId` - Associated import job
- `fileName` - Original filename
- `fileSize` - Total file size in bytes
- `chunkSize` - Size of each chunk
- `totalChunks` - Number of chunks (calculated)
- `chunksReceived` - Map of received chunks (chunk index → true)
- `status` - Current status (uploading, assembling, completed, failed, expired)
- `expiresAt` - Expiry timestamp (4 hours from creation)

**Methods:**

- `create()` - Factory method for new sessions
- `recordChunk()` - Mark chunk as received
- `isComplete()` - Check if all chunks received
- `getMissingChunks()` - Get indexes of chunks still needed
- `getProgress()` - Calculate percentage complete (0-100)
- `markCompleted()` - Transition to completed state
- `markFailed()` - Transition to failed state
- `expire()` - Transition to expired state
- `toJSON() / fromJSON()` - Serialization

**Business Rules (Invariants):**

1. ❌ Cannot record chunk with invalid index (< 0 or >= totalChunks)
2. ❌ Cannot mark completed unless all chunks received
3. ❌ Cannot record chunk if session expired or failed
4. ✅ Can record same chunk multiple times (idempotent)
5. ✅ Chunks can be received in any order
6. ✅ Status transitions: uploading → assembling → completed/failed
7. ✅ Session expires 4 hours after creation

**Key Design Decisions:**

- **Domain-driven design** - Business logic lives in domain model
- **Aggregate root** - UploadSession enforces invariants
- **Value objects** - UploadSessionSpec for creation
- **State machine** - Explicit status transitions
- **Idempotency** - Recording same chunk multiple times is safe

### 5. Infrastructure Layer (Persistence)

**Repository:** `SQLiteUploadSessionRepository`

**Database Schema:**

```sql
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,     -- Multi-tenant isolation
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  chunk_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  chunks_received TEXT NOT NULL, -- JSON string (Map serialized)
  chunks_path TEXT NOT NULL,     -- Disk path for chunks
  status TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL,   -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  is_local INTEGER NOT NULL DEFAULT 1,
  data_tag TEXT NOT NULL DEFAULT 'real'
);

CREATE INDEX idx_upload_sessions_account_id ON upload_sessions(account_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_expires_at ON upload_sessions(expires_at);
```

**Repository Methods:**

- `create(spec)` - Create new session in DB
- `save(session)` - Upsert session (insert or update)
- `findById(id, accountId)` - Find by ID with multi-tenant isolation
- `find(filters)` - Query with filters (accountId, userId, status, pagination)
- `findExpired()` - Find sessions that expired (for cleanup)
- `delete(id, accountId)` - Delete session with multi-tenant isolation
- `cancelAll()` - Cancel all in-progress uploads (for graceful shutdown)

**File System:**

- **Chunks directory:** `/tmp/uploads/chunks/<sessionId>/`
- **Chunk files:** `chunk_0`, `chunk_1`, ..., `chunk_N`
- **Assembled files:** `/tmp/uploads/assembled/<sessionId>-<filename>`
- **Cleanup:** Chunks deleted after successful assembly or expiry

**Key Design Decisions:**

- **SQLite** - Simple, embedded, no external dependencies
- **JSON serialization** - chunksReceived stored as JSON string
- **Upsert pattern** - Single method for create/update (ON CONFLICT)
- **Indexes** - On account_id, status, expires_at for fast queries
- **Multi-tenant isolation** - Every query filters by account_id

---

## Data Flow

### Upload Initiation

```
┌──────────┐     POST /initiate      ┌────────────┐
│          │  ───────────────────>   │            │
│  Client  │  { fileName, fileSize } │    API     │
│          │                          │            │
└──────────┘                          └─────┬──────┘
                                            │
                                            ↓
                                      ┌─────────────┐
                                      │ UploadRoutes│
                                      └─────┬───────┘
                                            │
                                            ↓
                                      UploadSession.create()
                                            │
                                            ↓
                                      UploadRepo.save()
                                            │
                                            ↓
                                      ┌─────────────┐
                                      │  Database   │
                                      └─────────────┘
```

### Chunk Upload

```
┌──────────┐  POST /chunks/0         ┌────────────┐
│          │  [binary chunk data]    │            │
│  Client  │  ───────────────────>   │    API     │
│          │                          │            │
└──────────┘                          └─────┬──────┘
                                            │
                                            ↓
                                      Write to disk
                                      /tmp/uploads/chunks/<sessionId>/chunk_0
                                            │
                                            ↓
                                      session.recordChunk(0)
                                            │
                                            ↓
                                      UploadRepo.save(session)
                                            │
                                            ↓
                                      Broadcast progress (SSE)
```

### Progress Streaming (SSE)

```
┌──────────┐  GET /progress (SSE)    ┌────────────┐
│          │  ───────────────────>   │            │
│  Client  │  EventSource connection │    API     │
│          │                          │            │
│          │  <───────────────────   │            │
│          │  data: { progress: 20 } │            │
└──────────┘                          └─────┬──────┘
     ↑                                      │
     │                                      ↓
     │                              UploadProgressBroadcaster
     │                                      │
     │                                      ↓
     │                              Manages SSE connections
     │                              Sends events on chunk upload
     │                              Heartbeat every 30s
     └──────────────────────────────────────┘
```

### Chunk Assembly

```
All chunks received
      ↓
ChunkAssemblyService.triggerAssembly()
      ↓
Read chunk files sequentially: chunk_0, chunk_1, ..., chunk_N
      ↓
Write to output file: /tmp/uploads/assembled/<sessionId>-<filename>
      ↓
Validate file size matches expected
      ↓
Delete chunk files
      ↓
session.markCompleted()
      ↓
UploadRepo.save(session)
      ↓
Broadcast completion event (SSE)
      ↓
Return file path to caller
      ↓
Trigger import job processing (future: Phase 8)
```

---

## Concurrency & Parallelism

### Client-Side (Frontend)

```
File (50MB, 5 chunks)
      ↓
Upload queue: [0, 1, 2, 3, 4]
      ↓
Concurrent uploads (max 6 parallel)
      ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Chunk 0 │ │Chunk 1 │ │Chunk 2 │ │Chunk 3 │ │Chunk 4 │ │ (idle) │
│ 10MB   │ │ 10MB   │ │ 10MB   │ │ 10MB   │ │ 10MB   │ │        │
└────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────────┘
     │          │          │          │          │
     ↓          ↓          ↓          ↓          ↓
     POST /chunks/0  POST /chunks/1  POST /chunks/2  ...
```

**Concurrency control:**

- Max 6 concurrent uploads (optimal for most networks)
- `Promise.race()` pattern for filling slots
- AbortController for cancellation

### Server-Side (Backend)

**No server-side concurrency limits:**

- Each chunk upload is independent
- No locking required (chunks written to separate files)
- Session updates use SQLite transaction (ACID)
- SSE broadcasting is non-blocking

**Potential bottlenecks:**

- Disk I/O (mitigated by using SSD, separate mount point)
- Database writes (minimal, only session state updates)
- Memory (chunks are streamed to disk, not buffered in RAM)

---

## Error Handling

### Network Errors (Client)

```
Upload chunk
      ↓
Network error (timeout, disconnect, etc.)
      ↓
Retry #1 (delay: 1s)
      ↓
Network error
      ↓
Retry #2 (delay: 2s)
      ↓
Network error
      ↓
Retry #3 (delay: 4s)
      ↓
If success: Continue
If failure: Mark upload as failed, show error to user
```

**Retry policy:**

- Max 3 attempts per chunk
- Exponential backoff: 1s, 2s, 4s
- User can manually retry failed uploads

### Server Errors

**Chunk write failure:**

```
Error: ENOSPC (no space left on device)
      ↓
session.markFailed("Disk space full")
      ↓
Broadcast failure event (SSE)
      ↓
Client shows error to user
```

**Assembly failure:**

```
Error: Chunk file missing or corrupted
      ↓
session.markFailed("Assembly failed: chunk_2 missing")
      ↓
Keep chunk files (for debugging)
      ↓
Broadcast failure event (SSE)
      ↓
Admin investigates and retries manually
```

---

## Security

### Multi-Tenant Isolation

**Every operation enforces account isolation:**

```typescript
// ❌ BAD: No account_id filtering
const session = db.prepare('SELECT * FROM upload_sessions WHERE id = ?').get(sessionId);

// ✅ GOOD: Multi-tenant isolation
const session = db
  .prepare('SELECT * FROM upload_sessions WHERE id = ? AND account_id = ?')
  .get(sessionId, accountId);
```

**Account ID derived from JWT:**

- User logs in, receives JWT with `accountId` claim
- Every request extracts `accountId` from JWT
- Never trust client-provided `accountId`

### Authentication

All endpoints require authentication:

```typescript
router.post('/initiate', requireAuth(authService), async (req, res) => {
  const accountId = (req as any).user?.accountId; // From JWT
  const userId = (req as any).user?.userId; // From JWT

  if (!accountId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // ... proceed
});
```

### File Upload Limits

- **Max file size:** 2GB (configurable)
- **Max chunk size:** 50MB (enforced client-side)
- **Session expiry:** 4 hours (prevents abuse)

### Data Validation

**Input validation (Zod):**

```typescript
const InitiateUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(2 * 1024 * 1024 * 1024), // Max 2GB
  mimeType: z.string().optional(),
  chunkSize: z.number().int().positive().optional(),
});
```

**Business rule enforcement:**

```typescript
// Domain model validates chunk indexes
recordChunk(chunkIndex: number): void {
  if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  if (this.status === 'expired' || this.status === 'failed') {
    throw new Error(`Cannot record chunk: session has ${this.status}`);
  }

  // ... proceed
}
```

---

## Scalability

### Current Limits (Single Server)

- **Concurrent uploads:** Unlimited (client-limited to 6/session)
- **Active sessions:** 10,000+ (limited by disk space)
- **Disk I/O:** ~500 MB/s (SSD dependent)
- **Database:** 100,000+ sessions (SQLite scales well for reads)

### Horizontal Scaling (Future)

To scale beyond a single server:

1. **Sticky sessions** - Route upload requests for same session to same server
2. **Shared storage** - Use S3/GCS for chunk storage instead of local disk
3. **Database replication** - Read replicas for status queries
4. **Redis for SSE** - Centralized pub/sub for progress events

**Example architecture:**

```
         Load Balancer (sticky sessions)
                  ↓
      ┌───────────┼───────────┐
      ↓           ↓           ↓
  Server 1    Server 2    Server 3
      │           │           │
      └───────────┼───────────┘
                  ↓
          Shared Storage (S3)
                  │
                  ↓
          PostgreSQL (RDS)
                  │
                  ↓
         Redis (SSE pub/sub)
```

---

## Performance Optimizations

### Current Optimizations

1. **Concurrent chunk uploads** - 6 parallel, reduces total upload time
2. **Local disk storage** - Fast writes, no network latency
3. **Streaming assembly** - No buffering in RAM
4. **Indexed queries** - Fast lookups by account_id, status, expires_at
5. **SSE instead of polling** - Lower server load
6. **Background cleanup** - Runs off-peak hours

### Future Optimizations

- [ ] **Compression** - Gzip chunks before upload (if network slow)
- [ ] **Checksum validation** - MD5/SHA256 for chunk integrity
- [ ] **Delta uploads** - Only upload changed chunks (for file updates)
- [ ] **HTTP/2 multiplexing** - Single connection for all chunks
- [ ] **Web Workers** - Offload chunking to background thread

---

## Testing Strategy

### Unit Tests (180+ tests)

- UploadSession domain model (40+ tests)
- UploadSessionRepository (60+ tests)
- ChunkAssemblyService (40+ tests)
- UploadCleanupService (40+ tests)

### Integration Tests (40+ tests)

- All 5 API endpoints
- Authentication/authorization
- Multi-tenant isolation
- Error handling

### E2E Tests (30+ tests)

- Complete upload flow (frontend + backend)
- Pause/resume functionality
- Cancel operations
- SSE progress streaming

### Coverage Target

- **Unit tests:** >95% line coverage
- **Integration tests:** 100% endpoint coverage
- **E2E tests:** All critical flows covered

---

## Deployment Architecture

### Development

```
┌──────────────┐
│   Frontend   │  :3000
│  (Vite dev)  │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│   Backend    │  :4000
│  (ts-node)   │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│   SQLite     │  :memory: or ./dev.db
│  (file-based)│
└──────────────┘
```

### Production

```
┌──────────────┐
│   Frontend   │  :443 (HTTPS)
│   (Nginx)    │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│   Backend    │  :4000
│   (PM2)      │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│   SQLite     │  /var/lib/app/db/production.db
│  (file-based)│
└──────────────┘
```

---

## Monitoring & Observability

### Metrics to Track

1. **Upload success rate** - % of uploads that complete successfully
2. **Average upload time** - Time from initiate to completion
3. **Disk space usage** - Total space used by chunks
4. **Active sessions** - Number of sessions in progress
5. **SSE connections** - Number of active SSE clients
6. **Cleanup statistics** - Sessions cleaned, disk space freed

### Logging

**Structured logging:**

```typescript
console.log(
  JSON.stringify({
    level: 'info',
    module: 'chunked-upload',
    operation: 'chunk-upload',
    sessionId: session.id,
    accountId: session.accountId,
    chunkIndex: 0,
    progress: 20,
    timestamp: Date.now(),
  })
);
```

**Log levels:**

- **DEBUG:** Detailed state transitions
- **INFO:** Significant events (session created, chunk uploaded, assembly complete)
- **WARN:** Recoverable errors (retry, missing chunk file)
- **ERROR:** Failures (disk full, assembly failure)

---

## Conclusion

The chunked upload system is built with:

- ✅ **Domain-driven design** - Clear separation of concerns
- ✅ **Local-first architecture** - Optimized for on-device processing
- ✅ **Multi-tenant isolation** - Complete account separation
- ✅ **Comprehensive testing** - 250+ tests covering all scenarios
- ✅ **Production-ready** - Error handling, monitoring, graceful shutdown

It provides a robust foundation for reliable large file uploads in a local-first application.
