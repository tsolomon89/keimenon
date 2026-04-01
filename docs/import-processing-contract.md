# Import Processing Contract (v2)

## Version

- Contract version: `v2`
- Effective date: March 5, 2026

## Scope

This contract applies to both import upload rails:

- `POST /api/v1/jobs/import` (multipart job-based import)
- Chunked upload flow (`/api/v1/uploads/*`) that assembles a file and then creates an import job

## Processing Mode Semantics

- `processingMode=automatic`: similarity-first import pipeline with provenance-first graph output.
  - Canonical conversation reconstruction
  - Source span extraction
  - Mandatory atomic substrate (`char` + `trigram`)
  - Packet derivation + deterministic mass scoring
  - Layer linking (`Source -> SourceSpan -> Packet -> AtomicUnit`)
- `processingMode=manual`: manual groups are applied first, then unmatched messages are auto-grouped.
- `processingMode=hybrid`: manual grouping and automatic grouping run in the same job with explicit coexistence.

## Compatibility and Backward Behavior

- For this release, manual mode remains manual-priority with auto fallback.
- No REST breaking changes are required.
- Import jobs include contract metadata for traceability:
  - `config.metadata.importContractVersion = "v2"`
  - `config.metadata.processingRail = "multipart" | "chunked"`

## Runtime Expectations

- Import jobs must not start unless DB schema is compatible with current import node/edge kinds.
- Job terminal states are sticky (`succeeded`, `failed`, `canceled`) and must not regress to non-terminal states.
- Import progress/status mapping must never treat backend `running` as frontend `queued`.
- Any write-queue dead-letter/circuit-breaker failure during import is terminal (`failed`).

## Observability Expectations

- Import lifecycle events should include `jobId`, `accountId`, `processingMode`, `processingRail`, status/stage, percent, and stats.
- Metrics should support detecting:
  - failure ratio spikes,
  - stalled running imports,
  - repeated schema mismatch failures,
  - write-queue integrity failures.

## Operational Annex

### Temp Artifacts and Cleanup

- Import temp artifacts are managed under `%TEMP%/chat-imports`.
- Chunk upload temp directories are managed under `%TEMP%/keimenon-uploads`.
- Terminal artifact policy:
  - `succeeded` and `canceled`: delete input artifacts immediately after terminal persistence.
  - `failed`: retain artifacts for diagnostics (`IMPORT_FAILED_ARTIFACT_RETENTION_MS`, default 24h).
- Janitor policy:
  - `ImportArtifactJanitorService` scans temp roots on `IMPORT_ARTIFACT_JANITOR_INTERVAL_MS` (default hourly).
  - Deletes orphaned artifacts after `IMPORT_ORPHAN_ARTIFACT_GRACE_MS` (default 1h).
  - Exposes last-run and deletion stats for diagnostics.

### Retention and Growth Control

- Operational retention service runs on `IMPORT_RETENTION_INTERVAL_MS` (default hourly).
- Default retention window is `IMPORT_RETENTION_MS` (30 days).
- Retention actions:
  - delete expired `job_events`,
  - compact stale terminal import `state_data` snapshots (checkpoint/change-tracker heavy fields).
- Compaction is incremental and bounded by `IMPORT_RETENTION_MAX_ROWS_PER_RUN`.

### Troubleshooting Sequence

1. Check schema compatibility first (`SCHEMA_MISMATCH` must fail fast before deep parsing).
2. Inspect parse gates (`PARSE_FAILED`, `PARSE_ERROR_RATE_EXCEEDED`) and parse error details.
3. Inspect write-queue health (`WRITE_QUEUE_FAILURE`, dead-letter/circuit-open counters).
4. Check stall/timeouts (`IMPORT_STALLED`, wall-clock timeout envelope).
5. Check artifact janitor and retention lag via metrics and diagnostics:

- `GET /api/v1/metrics/import/storage-report`
- `npm run diagnostics:import`
