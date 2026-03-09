# Canonical Glossary

## Record

Persisted unit of state in the database.

## Struct

Read-only projection of one or more records for UI consumption.

## Schema-as-Data

Architecture where schema contracts are treated as data/runtime contracts, not only static code.

## Tenancy

Conceptual architecture term for isolated customer data domains.

## Account

Canonical tenancy unit in maintained implementation. Data isolation key is `account_id`.

## Entitlement

Feature/capacity allowance attached to an account.

## Metering

Usage tracking against entitlement limits.

## DatabaseClient

Abstraction used by services/routes for persistence operations.

## Homoiconic Fact Store

`agent_context/` corpus used as the retrieval-oriented source of architecture and spec truth.

## WorkerPool

Singleton that polls for queued Jobs, checks concurrency, and dispatches to registered Workers. Recovers orphaned jobs on startup.

## Job

Aggregate root for a background data operation. Immutable ID, typed config, formal 6-state machine (queued→running→succeeded/failed/canceled/blocked). Persisted in SQLite.

## Worker

Type-dispatched processor for a Job. Types: `import`, `delete`, `export`, `analyze`. Implements `IWorker` via `BaseWorker`.

## ProgressiveCheckpoint

Saves Job state every N batches for crash recovery. Serializes `ChangeTracker` + batch offset into Job state. Failure is non-fatal.

## Task

Agent-level analytical work (summarization, deduplication, verification). NOT the same as a Job.

## TaskRunner

Runs Tasks with retry/timeout. Package: `@keimenon/agent-core`.

## TaskHandler

Stateless function for one Task type. Package: `@keimenon/task-handlers`. Known: `GROUP_SUMMARY_BUILD`, `DUPLICATE_SUGGEST`, `VERIFY_SOURCE_CHAIN`.

## Contact

Alias for a `Person` entity representing a business or personal relationship. Contacts are stored as Person nodes in the graph with typed edges (e.g., `KNOWS`, `WORKS_WITH`, `CONTACTED_BY`) linking them to other entities or assets.
