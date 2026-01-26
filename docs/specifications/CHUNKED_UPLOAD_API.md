# Chunked Upload API Documentation

Complete API reference for the resumable chunked file upload system.

## Overview

The Chunked Upload API enables reliable upload of large files (up to 2GB) by splitting them into smaller chunks. This provides:

- **Resumable uploads** - Continue after network interruptions
- **Progress tracking** - Real-time progress via Server-Sent Events
- **Multi-tenant isolation** - Complete account separation
- **Automatic cleanup** - Expired sessions removed automatically

## Base URL

```
http://localhost:4000/api/v1/uploads
```

## Authentication

All endpoints require JWT authentication via Bearer token:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Initiate Upload Session

Create a new upload session and allocate storage for chunks.

**Endpoint:** `POST /initiate`

**Request Body:**

```json
{
  "fileName": "large-file.json",
  "fileSize": 52428800,
  "mimeType": "application/json",
  "chunkSize": 10485760,
  "jobId": "job_custom_123"
}
```

**Request Fields:**

- `fileName` (string, required) - Name of file being uploaded
- `fileSize` (number, required) - Total file size in bytes (max: 2GB)
- `mimeType` (string, optional) - MIME type (default: "application/json")
- `chunkSize` (number, optional) - Size of each chunk in bytes (default: 10MB)
- `jobId` (string, optional) - Custom job ID for tracking

**Response:** `201 Created`

```json
{
  "success": true,
  "session": {
    "id": "upl_1634567890_abc123",
    "fileName": "large-file.json",
    "fileSize": 52428800,
    "chunkSize": 10485760,
    "totalChunks": 5,
    "expiresAt": 1634582290000,
    "status": "uploading"
  },
  "jobId": "job_1634567890_xyz789"
}
```

**Response Fields:**

- `session.id` - Unique session identifier (use for subsequent requests)
- `session.totalChunks` - Number of chunks to upload (fileSize / chunkSize, rounded up)
- `session.expiresAt` - Unix timestamp (ms) when session expires (4 hours from creation)
- `jobId` - Job ID for tracking import processing

**Errors:**

- `400 Bad Request` - Invalid request body (missing fileName, invalid fileSize, etc.)
- `401 Unauthorized` - Missing or invalid authentication token

---

### 2. Upload Chunk

Upload a single chunk of file data.

**Endpoint:** `POST /:sessionId/chunks/:chunkIndex`

**Path Parameters:**

- `sessionId` - Session ID from initiate response
- `chunkIndex` - Zero-based chunk index (0 to totalChunks-1)

**Request Headers:**

```
Content-Type: application/octet-stream
```

**Request Body:**
Binary chunk data (raw bytes)

**Response:** `200 OK`

```json
{
  "success": true,
  "chunkIndex": 0,
  "chunksReceived": 1,
  "totalChunks": 5,
  "progress": 20,
  "status": "uploading",
  "isComplete": false
}
```

**Response Fields:**

- `chunkIndex` - Index of chunk just uploaded
- `chunksReceived` - Total number of chunks received so far
- `progress` - Upload progress percentage (0-100)
- `status` - Session status ("uploading", "assembling", "completed", "failed", "expired")
- `isComplete` - True when all chunks received

**Notes:**

- Chunks can be uploaded in any order
- Uploading the same chunk multiple times is idempotent (no error)
- When `isComplete` is true, file assembly begins automatically
- Real-time progress updates are broadcast via SSE (if connected)

**Errors:**

- `400 Bad Request` - Invalid chunk index (negative or >= totalChunks)
- `401 Unauthorized` - Missing or invalid authentication token
- `404 Not Found` - Session not found or access denied (multi-tenant isolation)
- `410 Gone` - Session has expired

---

### 3. Get Upload Progress (SSE Stream)

Subscribe to real-time upload progress updates via Server-Sent Events.

**Endpoint:** `GET /:sessionId/progress`

**Path Parameters:**

- `sessionId` - Session ID from initiate response

**Response:** `200 OK` (SSE stream)

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE Event Format:**

```
data: {"type":"progress","sessionId":"upl_123","chunkIndex":0,"chunksReceived":1,"totalChunks":5,"progress":20,"status":"uploading","timestamp":1634567890000}

data: {"type":"progress","sessionId":"upl_123","chunkIndex":1,"chunksReceived":2,"totalChunks":5,"progress":40,"status":"uploading","timestamp":1634567891000}

data: {"type":"completed","sessionId":"upl_123","chunksReceived":5,"totalChunks":5,"progress":100,"status":"completed","timestamp":1634567895000}
```

**Event Fields:**

- `type` - Event type: "progress", "completed", "failed", "expired"
- `sessionId` - Session ID
- `chunkIndex` - Index of chunk just uploaded (for progress events)
- `chunksReceived` - Total chunks received
- `totalChunks` - Total chunks expected
- `progress` - Progress percentage (0-100)
- `status` - Current session status
- `errorMessage` - Error description (for failed/expired events)
- `timestamp` - Unix timestamp (ms) of event

**Notes:**

- Connection stays open until upload completes, fails, or expires
- Heartbeat comments (`: heartbeat\n\n`) sent every 30 seconds
- Connection automatically closes after final event (completed/failed/expired)

**Errors:**

- `401 Unauthorized` - Missing or invalid authentication token
- `404 Not Found` - Session not found or access denied
- `503 Service Unavailable` - SSE broadcaster not initialized

---

### 4. Get Upload Status

Retrieve current status of an upload session (polling alternative to SSE).

**Endpoint:** `GET /:sessionId`

**Path Parameters:**

- `sessionId` - Session ID from initiate response

**Response:** `200 OK`

```json
{
  "success": true,
  "session": {
    "id": "upl_1634567890_abc123",
    "fileName": "large-file.json",
    "fileSize": 52428800,
    "chunkSize": 10485760,
    "totalChunks": 5,
    "chunksReceived": 3,
    "missingChunks": [1, 4],
    "progress": 60,
    "status": "uploading",
    "expiresAt": 1634582290000,
    "errorMessage": null
  }
}
```

**Response Fields:**

- `chunksReceived` - Number of chunks received so far
- `missingChunks` - Array of chunk indexes still needed (for resume)
- `progress` - Progress percentage (0-100)
- `status` - Current status
- `errorMessage` - Error description if status is "failed"

**Use Case:**

- Resume uploads: Get `missingChunks` to know which chunks still need uploading
- Polling: Alternative to SSE for real-time progress (poll every 1-2 seconds)

**Errors:**

- `401 Unauthorized` - Missing or invalid authentication token
- `404 Not Found` - Session not found or access denied

---

### 5. Cancel Upload

Cancel an upload session and clean up chunk files.

**Endpoint:** `DELETE /:sessionId`

**Path Parameters:**

- `sessionId` - Session ID to cancel

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Upload session cancelled"
}
```

**Notes:**

- Deletes session from database
- Removes all uploaded chunk files from disk
- No-op if session already deleted (returns success)
- Multi-tenant isolation enforced (can only delete own sessions)

**Errors:**

- `401 Unauthorized` - Missing or invalid authentication token
- `404 Not Found` - Session not found or access denied

---

## Upload Flow

### Complete Upload Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. INITIATE                                                     │
│    POST /initiate { fileName, fileSize, ... }                  │
│    → Returns: { sessionId, totalChunks, jobId }                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. CONNECT TO SSE (optional)                                    │
│    GET /:sessionId/progress                                     │
│    → Receives real-time progress events                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. UPLOAD CHUNKS (concurrent, out of order allowed)            │
│    POST /:sessionId/chunks/0   (10MB binary data)              │
│    POST /:sessionId/chunks/2   (10MB binary data)              │
│    POST /:sessionId/chunks/1   (10MB binary data)              │
│    ...                                                          │
│    → Each returns: { progress, chunksReceived, isComplete }    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. AUTO-ASSEMBLY (server-side, when isComplete = true)         │
│    - Combines chunks in order                                  │
│    - Validates file size                                       │
│    - Deletes chunk files                                       │
│    - Triggers import job                                       │
│    → Status changes: "uploading" → "assembling" → "completed"  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. PROCESSING                                                   │
│    Import job processes assembled file                         │
│    (tracked via jobId from step 1)                             │
└─────────────────────────────────────────────────────────────────┘
```

### Resume After Interruption

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. GET STATUS                                                   │
│    GET /:sessionId                                              │
│    → Returns: { missingChunks: [1, 3, 4] }                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. UPLOAD MISSING CHUNKS                                        │
│    POST /:sessionId/chunks/1                                    │
│    POST /:sessionId/chunks/3                                    │
│    POST /:sessionId/chunks/4                                    │
│    → Continues where left off                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

```
┌──────────┐
│  CREATE  │  POST /initiate
└────┬─────┘
     │
     ↓
┌──────────┐
│UPLOADING │  POST /chunks/:index (status: "uploading")
└────┬─────┘
     │
     ↓ (all chunks received)
┌──────────┐
│ASSEMBLING│  Auto-triggered (status: "assembling")
└────┬─────┘
     │
     ├─→ SUCCESS ──→ COMPLETED (status: "completed")
     │
     └─→ FAILURE ──→ FAILED (status: "failed", errorMessage set)

EXPIRED: Session not completed within 4 hours (status: "expired")
```

---

## Error Handling

### Common Error Responses

**401 Unauthorized**

```json
{
  "success": false,
  "error": "Authentication required"
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "path": ["fileSize"],
      "message": "File size must be positive"
    }
  ]
}
```

**404 Not Found**

```json
{
  "success": false,
  "error": "Upload session not found or access denied"
}
```

**410 Gone**

```json
{
  "success": false,
  "error": "Upload session has expired"
}
```

**500 Internal Server Error**

```json
{
  "success": false,
  "error": "Failed to upload chunk",
  "message": "Disk write error: ENOSPC"
}
```

---

## Rate Limits

- **Chunk uploads**: 6 concurrent uploads per session (client-side)
- **SSE connections**: 1 connection per session
- **Session expiry**: 4 hours from creation

---

## Best Practices

### Client-Side

1. **Use SSE for real-time progress**
   - Connect to `/progress` endpoint before uploading chunks
   - Display progress bar to user
   - Handle reconnection automatically

2. **Upload chunks concurrently**
   - Use 6 parallel requests (default in `useChunkedUpload` hook)
   - Improves upload speed significantly

3. **Implement retry logic**
   - Retry failed chunks up to 3 times
   - Use exponential backoff (1s, 2s, 4s)

4. **Save session ID to localStorage**
   - Enables resume after browser close
   - Clear localStorage on completion

5. **Handle pause/resume**
   - Pause: Abort ongoing requests, keep session ID
   - Resume: Call GET status to get `missingChunks`, upload them

### Server-Side

1. **Monitor session expiry**
   - Cleanup service runs every hour
   - Deletes expired sessions and chunk files

2. **Ensure disk space**
   - Chunks stored in temp directory (configurable)
   - Cleaned up after successful assembly or expiry

3. **Multi-tenant isolation**
   - All endpoints enforce `account_id` filtering
   - Sessions cannot be accessed across accounts

---

## Example: Complete Upload (cURL)

```bash
# 1. Initiate upload
curl -X POST http://localhost:4000/api/v1/uploads/initiate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "large-file.json",
    "fileSize": 20971520,
    "mimeType": "application/json",
    "chunkSize": 10485760
  }'

# Response: { "session": { "id": "upl_123", "totalChunks": 2 }, "jobId": "job_456" }

# 2. Upload chunk 0
curl -X POST http://localhost:4000/api/v1/uploads/upl_123/chunks/0 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_0.bin

# Response: { "success": true, "chunksReceived": 1, "progress": 50, "isComplete": false }

# 3. Upload chunk 1
curl -X POST http://localhost:4000/api/v1/uploads/upl_123/chunks/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_1.bin

# Response: { "success": true, "chunksReceived": 2, "progress": 100, "isComplete": true }

# 4. Check status
curl -X GET http://localhost:4000/api/v1/uploads/upl_123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response: { "session": { "status": "completed", "progress": 100 } }
```

---

## Support

For issues or questions:

- GitHub Issues: [Report here](https://github.com/your-org/your-repo/issues)
- Documentation: [Full docs](/docs)
