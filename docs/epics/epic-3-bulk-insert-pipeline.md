# Epic 3: Bulk Insert Pipeline

## Overview

Epic 3 represents the third pillar of the structural performance enhancements for Keimenon, focusing on database ingestion. Historically, the `DatabaseWriteQueue` inserted nodes and edges on the Node.js main thread in small batches (e.g., 400 nodes / 600 edges). While this approach was functional, it incurred high serialization costs, caused event loop blocking during massive imports, and required complex fallback logic for SQLite variable limits.

The Bulk Insert Pipeline solves this by migrating high-volume ingestions into the dedicated SQLite `db-worker`, communicating via strongly-typed IPC messages and relying directly on SQLite's transactional primitives for data integrity and speed.

## Architecture

### GraphWriteSink Abstraction

To facilitate seamless fallback and testability, a new interface `GraphWriteSink` was introduced. This abstraction allows the import pipeline to write to either:

1. **BulkGraphWriteSink**: The new default when `KEIMENON_BULK_INSERTS` is enabled. It routes traffic as `GraphBatchPayload` IPC messages directly to the `db-worker`.
2. **LegacyQueuedGraphWriteSink**: The fallback adapter wrapping the existing `DatabaseWriteQueue`, ensuring no regression when the worker is unavailable.

### GraphBatchAccumulator

To build optimal batches, the `GraphBatchAccumulator` sits between the raw parser/generator layers and the `GraphWriteSink`. It partitions nodes based on their schema requirements:

- **Skinny Nodes**: High-volume, structurally normalized nodes (`SourceSpan`, `Phrase`, `Packet`, `AtomicUnit`).
- **Generic Nodes**: Standard graph nodes using JSON properties (`Message`, `ConversationThread`, etc).
- **Edges**: Relational links.
- **Normalized Payloads**: Extracted properties that match the normalized schema (Epic 2).

### The db-worker Implementation

The `db-worker.ts` handles the `bulkInsertGraphBatch` operation with an ordered execution strategy:

1. `BEGIN IMMEDIATE` transaction to lock the DB for writes.
2. `PRAGMA defer_foreign_keys = ON` to allow out-of-order relational inserts (e.g., edges pointing to nodes created later in the batch).
3. **Stage 1**: Insert Skinny & Generic nodes.
4. **Stage 2**: Insert Normalized Payloads (`source_spans`, `phrases`, `packets`, `atomic_units`).
5. **Stage 3**: Insert Edges.
6. **Integrity Check**: Execute `PRAGMA foreign_key_check`. If failures are detected, the transaction rolls back, and the batch restarts in **Quarantine Mode**.

### Quarantine Logic

A critical requirement of Epic 3 was zero silent data loss. When an integrity error (like a missing foreign key) occurs during a batch, the system restarts the batch with `PRAGMA defer_foreign_keys = OFF`.

The worker attempts to insert rows one-by-one. If a row fails constraint checks, it is serialized and inserted into the `bulk_insert_quarantine` table for later review, while the rest of the batch successfully commits.

## Feature Flags

The Bulk Insert Pipeline is controlled by the `KEIMENON_BULK_INSERTS` environment variable. When set to `0`, the system gracefully falls back to the legacy queue.

## Integration

The system intercepts writes at `ImportWorker.ts`. Depending on the environment flag and worker readiness, it initializes the `GraphBatchAccumulator` and the appropriate `GraphWriteSink`. Progress is communicated back to the UI via throttled (100ms max frequency) Server-Sent Events (SSE) representing the current payload count, preventing UI saturation during high-speed inserts.
