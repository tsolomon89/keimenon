# Spec: Chunked Upload Protocol

> Goal: reliable upload of large assets over unstable networks.

## Protocol

1. `POST /initiate`: allocate session and return `session_id` + `total_chunks`.
2. `POST /chunks/:index`: upload binary chunk (default chunk size: 10MB).
3. Assembly triggers when `chunks_received == total_chunks`.

## Behavior

- Parallel chunk uploads are allowed.
- Re-uploading a chunk is idempotent (last write wins).
- Server emits status events (`progress`, `completed`, `failed`, `expired`).

## Lifecycle

- Unfinished sessions expire after 4 hours.
- Cleanup worker removes orphaned/expired chunks.
- Isolation is enforced by `account_id`.
