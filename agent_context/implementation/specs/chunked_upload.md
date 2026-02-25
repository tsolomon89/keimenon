# Spec: Chunked Upload Protocol

> **Goal**: Reliable upload of large assets (>2GB) over unstable networks.

## Protocol Mechanics
1.  **Initiate (`POST /initiate`)**: Allocates session. Returns `session_id` and `total_chunks`.
2.  **Upload (`POST /chunks/:index`)**: Client sends binary chunks (Default: 10MB).
    - **Concurrency**: Parallel uploads allowed (Client capped at ~6).
    - **Idempotency**: Re-uploading the same chunk is safe (last write wins).
3.  **Assembly**: Automatically triggered when `chunks_received == total_chunks`.

## Progress Tracking (SSE)
- **Endpoint**: `GET /:sessionId/progress`
- **Format**: Server-Sent Events (SSE).
- **Events**: `progress`, `completed`, `failed`, `expired`.

## Lifecycle & Cleanup
- **Expiry**: Unfinished sessions expire after 4 hours.
- **Garbage Collection**: Cron job deletes orphaned chunks and expired sessions.
- **Isolation**: Strictly enforced by `tenant_id` (users cannot append chunks to another tenant's session).
