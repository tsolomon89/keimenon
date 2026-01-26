# Chunked Upload Developer Guide

Complete guide for developers integrating the chunked upload system into their applications.

## Table of Contents

1. [Overview](#overview)
2. [Frontend Integration](#frontend-integration)
3. [Backend Integration](#backend-integration)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The chunked upload system provides reliable, resumable file uploads for large files (up to 2GB). It's designed for:

- **Chat import files** - Large JSON exports from ChatGPT/Claude
- **Bulk data imports** - Any large JSON dataset
- **Media uploads** - Images, videos, audio (future)

###Key Features

- ✅ **Resumable** - Continue after network interruption or browser close
- ✅ **Real-time progress** - Server-Sent Events (SSE) for live updates
- ✅ **Multi-tenant** - Complete account isolation
- ✅ **Efficient** - 6 concurrent chunk uploads, local disk storage
- ✅ **Automatic cleanup** - Expired sessions cleaned hourly
- ✅ **Battle-tested** - 250+ tests covering all scenarios

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│                                                                 │
│  useChunkedUpload()           useUploadProgress()              │
│  ├─ File chunking             ├─ SSE connection                │
│  ├─ Concurrent uploads        ├─ Real-time events              │
│  ├─ Progress tracking         └─ Auto-reconnect                │
│  ├─ Pause/Resume                                               │
│  ├─ Cancel                                                     │
│  └─ LocalStorage persist                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express)                       │
│                                                                 │
│  Upload Routes                  UploadProgressBroadcaster      │
│  ├─ POST /initiate              ├─ SSE connections             │
│  ├─ POST /chunks/:index         ├─ Real-time events            │
│  ├─ GET /progress (SSE)         └─ Heartbeat (30s)             │
│  ├─ GET /status                                                │
│  └─ DELETE /cancel                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                               │
│                                                                 │
│  UploadSession                  ChunkAssemblyService           │
│  ├─ Domain model                ├─ Combine chunks              │
│  ├─ Business rules              ├─ File validation             │
│  ├─ State transitions           └─ Cleanup                     │
│  └─ Progress calc                                              │
│                                                                 │
│  UploadCleanupService                                          │
│  ├─ Expire sessions (4h)                                       │
│  ├─ Delete chunk files                                         │
│  └─ Runs hourly                                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                               │
│                                                                 │
│  SQLiteUploadSessionRepository  File System                    │
│  ├─ CRUD operations             ├─ Temp chunks dir             │
│  ├─ Multi-tenant isolation      ├─ Assembled files dir         │
│  └─ Query/filters               └─ Auto cleanup                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Integration

### Basic Upload with React Hook

```tsx
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { useUploadProgress } from '@/hooks/useUploadProgress';

function FileUploader() {
  const { upload, progress, pause, resume, cancel, sessionId } = useChunkedUpload();
  const { progress: sseProgress, isConnected } = useUploadProgress(sessionId);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await upload(file);

    if (result.success) {
      console.log('Upload complete! Job ID:', result.jobId);
      // Navigate to job status page or show success message
    } else {
      console.error('Upload failed:', result.error);
      // Show error message to user
    }
  };

  return (
    <div>
      <input type="file" accept=".json" onChange={handleFileSelect} />

      {progress.status === 'uploading' && (
        <div>
          <ProgressBar percentage={sseProgress?.progress || progress.percentage} />
          <p>
            {sseProgress?.chunksReceived || progress.chunksUploaded} / {progress.totalChunks} chunks
          </p>
          <p>Speed: {formatSpeed(progress.uploadSpeed)}</p>
          <p>ETA: {formatDuration(progress.estimatedTimeRemaining)}</p>

          <button onClick={pause}>Pause</button>
          <button onClick={cancel}>Cancel</button>
        </div>
      )}

      {progress.status === 'paused' && (
        <div>
          <p>Upload paused at {progress.percentage}%</p>
          <button onClick={resume}>Resume</button>
          <button onClick={cancel}>Cancel</button>
        </div>
      )}

      {progress.status === 'completed' && (
        <div>
          <p>✅ Upload complete!</p>
        </div>
      )}

      {progress.status === 'failed' && (
        <div>
          <p>❌ Upload failed: {progress.error}</p>
          <button onClick={() => upload(file)}>Retry</button>
        </div>
      )}
    </div>
  );
}
```

### Advanced: Resume After Browser Close

```tsx
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { useEffect } from 'react';

function ResumeUploader() {
  const { upload, resume, progress, sessionId } = useChunkedUpload();

  // Check for paused uploads on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('chunked_upload_session');
    if (savedSessionId) {
      // Ask user if they want to resume
      if (confirm('Resume previous upload?')) {
        resume();
      } else {
        localStorage.removeItem(`chunked_upload_${savedSessionId}`);
      }
    }
  }, []);

  return (
    // ... upload UI
  );
}
```

### Progress Bar Component

```tsx
interface ProgressBarProps {
  percentage: number;
  status?: string;
}

function ProgressBar({ percentage, status }: ProgressBarProps) {
  return (
    <div className="progress-container">
      <div
        className="progress-bar"
        style={{
          width: `${percentage}%`,
          backgroundColor: status === 'failed' ? '#ef4444' : '#3b82f6',
        }}
      />
      <span className="progress-text">{percentage}%</span>
    </div>
  );
}
```

### Handling SSE Fallback

```tsx
import { useUploadProgress, useUploadProgressPolling } from '@/hooks/useUploadProgress';

function SmartProgressTracker({ sessionId }: { sessionId: string }) {
  // Try SSE first
  const { progress: sseProgress, error: sseError } = useUploadProgress(sessionId);

  // Fallback to polling if SSE fails
  const { progress: pollingProgress } = useUploadProgressPolling(
    sseError ? sessionId : null, // Only poll if SSE failed
    2000 // Poll every 2 seconds
  );

  const progress = sseError ? pollingProgress : sseProgress;

  return (
    <div>
      <p>Progress: {progress.progress}%</p>
      <p>Method: {sseError ? 'Polling' : 'SSE'}</p>
    </div>
  );
}
```

---

## Backend Integration

### Initialize Services on Server Start

```typescript
// apps/api/src/server.ts

import { initializeCleanupService } from './modules/uploads/application/UploadCleanupService';
import { initializeProgressBroadcaster } from './modules/uploads/application/UploadProgressBroadcaster';
import { SQLiteUploadSessionRepository } from './modules/uploads/infrastructure/UploadSessionRepository';

// Initialize upload services
const uploadRepo = new SQLiteUploadSessionRepository(db);
const cleanupService = initializeCleanupService(uploadRepo, 60 * 60 * 1000); // 1 hour interval
const progressBroadcaster = initializeProgressBroadcaster();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down upload services...');
  cleanupService.stop();
  progressBroadcaster.shutdown();
  process.exit(0);
});
```

### Mount Upload Routes

```typescript
// apps/api/src/server.ts

import { createUploadRoutes } from './routes/uploads.routes';

const app = express();

// ... other middleware

// Mount upload routes
const uploadRoutes = createUploadRoutes(authService);
app.use('/api/v1/uploads', uploadRoutes);
```

### Database Migration

```typescript
// apps/api/migrations/add_upload_sessions_table.ts

import Database from 'better-sqlite3';

export function up(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      chunk_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      chunks_received TEXT NOT NULL, -- JSON string
      chunks_path TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER,
      is_local INTEGER NOT NULL DEFAULT 1,
      data_tag TEXT NOT NULL DEFAULT 'real'
    );

    CREATE INDEX IF NOT EXISTS idx_upload_sessions_account_id
      ON upload_sessions(account_id);

    CREATE INDEX IF NOT EXISTS idx_upload_sessions_status
      ON upload_sessions(status);

    CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at
      ON upload_sessions(expires_at);
  `);
}

export function down(db: Database.Database) {
  db.exec('DROP TABLE IF EXISTS upload_sessions;');
}
```

### Environment Configuration

```bash
# .env

# Upload settings
UPLOAD_CHUNK_SIZE=10485760           # 10MB default chunk size
UPLOAD_SESSION_EXPIRY=14400000       # 4 hours (in milliseconds)
UPLOAD_CLEANUP_INTERVAL=3600000      # 1 hour (in milliseconds)
UPLOAD_TEMP_DIR=/tmp/uploads         # Temp directory for chunks
```

---

## Testing

### Run All Tests

```bash
# Unit tests
npm test apps/api/src/modules/uploads/__tests__

# Integration tests
npm test apps/api/src/routes/__tests__/uploads.routes.test.ts

# E2E tests
npm test apps/web/src/hooks/__tests__/useChunkedUpload.test.ts

# Run all upload tests
npm test -- --testPathPattern=upload
```

### Test Coverage

```bash
npm test -- --coverage --testPathPattern=upload
```

Expected coverage:

- Unit tests: >95% coverage
- Integration tests: All endpoints covered
- E2E tests: Complete upload flows covered

### Manual Testing

```bash
# 1. Start API server
cd apps/api
npm run dev

# 2. Start web app
cd apps/web
npm run dev

# 3. Test upload
# - Open http://localhost:3000
# - Select a large JSON file (>50MB recommended)
# - Watch progress bar and SSE events in Network tab
# - Try pause/resume
# - Try browser refresh during upload
```

---

## Deployment

### Pre-Deployment Checklist

- [ ] Database migration applied (`upload_sessions` table exists)
- [ ] Environment variables configured
- [ ] Temp directory created and writable
- [ ] Disk space available (estimate: 2x largest expected file)
- [ ] Cleanup service starts automatically
- [ ] SSE broadcaster initializes on startup

### Production Configuration

```typescript
// apps/api/src/config/uploads.ts

export const uploadsConfig = {
  // Use larger chunks in production (faster uploads)
  chunkSize: process.env.UPLOAD_CHUNK_SIZE || 10 * 1024 * 1024, // 10MB

  // Extend session expiry if users have slow connections
  sessionExpiryMs: process.env.UPLOAD_SESSION_EXPIRY || 4 * 60 * 60 * 1000, // 4 hours

  // Cleanup less frequently in production (reduce CPU usage)
  cleanupIntervalMs: process.env.UPLOAD_CLEANUP_INTERVAL || 60 * 60 * 1000, // 1 hour

  // Use dedicated mount point for chunks
  tempDir: process.env.UPLOAD_TEMP_DIR || '/var/lib/app/uploads/chunks',

  // Use dedicated mount point for assembled files
  assemblyDir: process.env.UPLOAD_ASSEMBLY_DIR || '/var/lib/app/uploads/assembled',
};
```

### Monitoring

```typescript
// Monitor upload system health

app.get('/health/uploads', async (req, res) => {
  const cleanupService = getCleanupService();
  const broadcaster = getProgressBroadcaster();

  const health = {
    cleanup: cleanupService?.getStatus() || { isRunning: false, intervalMs: 0 },
    broadcaster: broadcaster?.getStats() || { totalClients: 0, activeSessions: 0 },
    diskSpace: await checkDiskSpace(),
  };

  res.json(health);
});
```

### Error Tracking (Sentry)

```typescript
import * as Sentry from '@sentry/node';

// Capture upload errors
try {
  await uploadRepo.save(session);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      module: 'chunked-upload',
      operation: 'save-session',
    },
    extra: {
      sessionId: session.id,
      accountId: session.accountId,
      status: session.status,
    },
  });
  throw error;
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Session has expired"

**Cause:** Upload took longer than 4 hours

**Solution:**

- Increase `UPLOAD_SESSION_EXPIRY` env var
- Or: Resume upload within 4 hours
- Or: Use faster internet connection

#### 2. SSE connection keeps disconnecting

**Cause:** Proxy/load balancer timeout or buffering

**Solution:**

```nginx
# nginx.conf
location /api/v1/uploads {
    proxy_pass http://backend;

    # Disable buffering for SSE
    proxy_buffering off;

    # Increase timeout for long-lived connections
    proxy_read_timeout 300s;

    # Set headers for SSE
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
}
```

#### 3. "Failed to upload chunk" errors

**Cause:** Disk space full or permission issues

**Solution:**

- Check disk space: `df -h /tmp/uploads`
- Check permissions: `ls -la /tmp/uploads`
- Increase disk quota if needed

#### 4. Progress bar not updating

**Cause:** SSE connection failed, not falling back to polling

**Solution:**

- Check browser console for SSE errors
- Ensure `useUploadProgress` hook is being used
- Implement polling fallback (see examples above)

#### 5. Chunks uploaded but assembly fails

**Cause:** File size mismatch or corrupted chunks

**Solution:**

- Check server logs for assembly errors
- Verify chunk files exist: `ls /tmp/uploads/chunks/<sessionId>/`
- Verify chunk sizes match: `du -b /tmp/uploads/chunks/<sessionId>/*`

### Debugging

#### Enable verbose logging

```typescript
// apps/api/src/modules/uploads/domain/UploadSession.ts

// Add debug logging
recordChunk(chunkIndex: number): void {
  console.log(`[UploadSession] Recording chunk ${chunkIndex} for session ${this.id}`);
  console.log(`  Before: ${this.getProgress()}%`);

  // ... business logic

  console.log(`  After: ${this.getProgress()}%`);
  console.log(`  Missing: ${this.getMissingChunks()}`);
}
```

#### Inspect database

```sql
-- Check active sessions
SELECT id, file_name, status, progress, created_at, expires_at
FROM upload_sessions
WHERE status IN ('uploading', 'assembling')
ORDER BY created_at DESC;

-- Check chunks received
SELECT id, file_name, chunks_received
FROM upload_sessions
WHERE id = 'upl_123';

-- Check expired sessions
SELECT COUNT(*) FROM upload_sessions
WHERE expires_at < unixepoch() * 1000
  AND status IN ('uploading', 'assembling');
```

#### Test SSE connection

```bash
# Connect to SSE stream with curl
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/v1/uploads/upl_123/progress

# Should output events like:
# data: {"type":"progress","sessionId":"upl_123",...}
```

---

## Performance Optimization

### Frontend

- **Use Web Workers** for file chunking (large files)
- **Implement connection pooling** (reuse HTTP/2 connections)
- **Compress chunks** before upload (if network is slow)

### Backend

- **Use SSD** for chunk storage (faster writes)
- **Increase file descriptors** limit (`ulimit -n 65536`)
- **Use separate disk** for chunks (avoid contention)
- **Tune cleanup interval** based on disk space

---

## Security Considerations

1. **Multi-tenant isolation**
   - All queries filter by `account_id`
   - Cannot access other accounts' sessions

2. **File size limits**
   - Max 2GB per file (configurable)
   - Enforced at initiation

3. **Session expiry**
   - 4-hour maximum (prevents abuse)
   - Auto-cleanup of expired sessions

4. **Authentication**
   - All endpoints require JWT
   - Account ID derived from JWT, not request

5. **Disk space**
   - Monitor available space
   - Cleanup expired sessions hourly

---

## Future Enhancements

- [ ] **Resumable uploads from URL** - Provide file URL, server downloads and chunks
- [ ] **Multi-file uploads** - Upload multiple files in one session
- [ ] **Compression** - Automatic gzip compression of chunks
- [ ] **Checksums** - MD5/SHA256 verification of chunks
- [ ] **Cloud storage** - Support S3/GCS for chunk storage
- [ ] **Progress persistence** - Save progress to database (not just memory)
- [ ] **Upload analytics** - Track success rates, average speeds

---

## Support

- **Documentation**: [Full docs](/docs)
- **API Reference**: [API docs](/docs/api/CHUNKED_UPLOAD_API.md)
- **GitHub Issues**: [Report bugs](https://github.com/your-org/your-repo/issues)
- **Architecture**: [System design](/docs/architecture/CHUNKED_UPLOAD_ARCHITECTURE.md)
