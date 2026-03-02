# Worker / Agent Architecture

Keimenon runs background work on **two independent execution layers**. Each layer has its own lifecycle, persistence model, and coordination mechanism.

## Invariant

> These layers MUST NOT be conflated. A _Job_ is never an _Agent Task_, and an _Agent_ never processes a _Job_.

---

## Layer 1: Infrastructure — Workers & Jobs

**Purpose**: Heavyweight, user-triggered data operations (import, delete, export).

### Components

| Component                | Path                                            | Role                                                                |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| `WorkerPool`             | `modules/workers/domain/WorkerPool.ts`          | Poll-dispatch-execute loop with concurrency guard                   |
| `IWorker` / `BaseWorker` | `modules/workers/domain/Worker.ts`              | Type-dispatched processor (`import`\|`delete`\|`export`\|`analyze`) |
| `Job`                    | `modules/jobs/domain/Job.ts`                    | Aggregate root — immutable ID, config, state machine                |
| `JobStateMachine`        | `modules/jobs/domain/JobStateMachine.ts`        | Formal 6-state FSM with legal transitions                           |
| `ProgressiveCheckpoint`  | `modules/jobs/domain/ProgressiveCheckpoint.ts`  | Periodic batch saves for crash recovery                             |
| `ChangeTracker`          | `modules/jobs/domain/ChangeTracker.ts`          | Records node/edge mutations for rollback                            |
| `JobRepository`          | `modules/jobs/infrastructure/JobRepository.ts`  | SQLite persistence (`-jobs.db`)                                     |
| `SSEBroadcaster`         | `modules/jobs/infrastructure/SSEBroadcaster.ts` | Real-time progress push to frontend                                 |
| `JOB_CONFIG`             | `modules/jobs/jobs.config.ts`                   | Centralized config (pool, workers, persistence, SSE, concurrency)   |

### Job State Machine

```
queued → running → succeeded
  ↓        ↓
blocked   failed
  ↑
  └─ retry  canceled ← (queued|running|blocked)
```

- **Terminal states**: `succeeded`, `failed`, `canceled` — no further transitions.
- **Blocked**: concurrency conflict; retries re-queue the job.
- MUST: every status transition is validated by `JobStateMachine.transition()`.
- MUST: `running` jobs have `startedAt`; `failed` jobs have `error`; `blocked` jobs have `blockedReason`.

### WorkerPool Lifecycle

1. **Start** → recovers orphaned jobs (jobs left `running` after server restart).
2. **Poll** → finds `queued` jobs via `JobRepository` (multi-db in test mode).
3. **Dispatch** → checks `ConcurrencyGuard`, assigns to registered `IWorker` by `JobType`.
4. **Execute** → runs `worker.process(job, context)` with `AbortController` for cancellation.
5. **Checkpoint** → `ProgressiveCheckpoint.saveIfNeeded()` persists `ChangeTracker` state every N batches.
6. **Broadcast** → `SSEBroadcaster.broadcastJobUpdate(job)` pushes progress to frontend.

### Progressive Checkpointing

- MUST: workers call `checkpoint.saveIfNeeded(changeTracker, batchNumber)` each batch.
- Checkpoint serializes `ChangeTracker` + batch number into `job._state`.
- On resume: `loadCheckpoint(job)` restores tracker and batch offset.
- Checkpoint failure is **non-fatal** — logged but does not stop the job.

### Concurrency Groups

| Group             | Limit | Scope       |
| ----------------- | ----- | ----------- |
| `delete-keimenon` | 1     | per account |
| `import`          | 3     | per account |
| `analysis`        | 5     | global      |

---

## Layer 2: Application — Agents & Tasks

**Purpose**: AI-driven analytical operations (summarization, deduplication, verification).

### Components

| Component        | Package                                              | Role                                         |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| `AgentService`   | `apps/api/src/services/agent-service.ts`             | Singleton orchestrator                       |
| `TaskRunner`     | `packages/agent-core/src/runner/task-runner.ts`      | Execute tasks with retry/timeout             |
| `TaskHandler`    | `packages/agent-core/src/interfaces/task-handler.ts` | Handler contract per task type               |
| `SimpleStorage`  | (inline in `AgentService`)                           | Content-addressable in-memory artifact store |
| `SimpleEventBus` | (inline in `AgentService`)                           | Progress broadcasting                        |

### Available Task Handlers

| Handler               | Package Path                                        | Description                          |
| --------------------- | --------------------------------------------------- | ------------------------------------ |
| `GROUP_SUMMARY_BUILD` | `packages/task-handlers/src/group-summary-build.ts` | Generate summaries for node groups   |
| `DUPLICATE_SUGGEST`   | `packages/task-handlers/src/duplicate-suggest.ts`   | Identify potential duplicate records |
| `VERIFY_SOURCE_CHAIN` | `packages/task-handlers/src/verify-source-chain.ts` | Validate source attribution chains   |

### Task Lifecycle

```
pending → running → completed
              ↓
           failed → (retry via config.retry_policy)
              ↓
         cancelled
```

- `Task`: created with `type`, `account_id`, `agent_id`, `input`, `config`.
- `Run`: execution attempt — each retry creates a new `Run`.
- `TaskResult`: `{ success, output?, error?, artifacts[], metrics? }`.
- `TaskConfig.retry_policy`: `{ max_attempts, backoff_ms }`.

### Agent Interfaces

| Interface       | Description                                        |
| --------------- | -------------------------------------------------- |
| `IGraphRepo`    | Read/write graph data (nodes, edges)               |
| `IStorage`      | Content-addressable artifact persistence           |
| `IEventBus`     | Subscribe/emit progress events                     |
| `IToolRegistry` | Access external tools (LLM, Web, Exec, Proof, Git) |

---

## Key Differences

| Aspect             | Job (Layer 1)                         | Task (Layer 2)                                       |
| ------------------ | ------------------------------------- | ---------------------------------------------------- |
| **Trigger**        | User action (import file, clear data) | Agent decision or API call                           |
| **Persistence**    | SQLite (`-jobs.db`)                   | In-memory (SimpleStorage)                            |
| **Progress**       | SSE → frontend                        | EventBus → subscribers                               |
| **Crash Recovery** | ProgressiveCheckpoint + ChangeTracker | Retry policy (max_attempts)                          |
| **Concurrency**    | ConcurrencyGuard (group limits)       | No formal guard                                      |
| **State Machine**  | Formal 6-state FSM                    | 5-state (pending→running→completed/failed/cancelled) |
| **Data Scope**     | Bulk operations (nodes, edges)        | Analytical outputs (summaries, suggestions)          |

## Acceptance Checks

- [ ] A Job MUST NOT reference or invoke a TaskHandler.
- [ ] A Task MUST NOT reference or invoke a Worker.
- [ ] WorkerPool MUST recover orphaned jobs on startup.
- [ ] All Job state transitions MUST go through `JobStateMachine.transition()`.
- [ ] ProgressiveCheckpoint failure MUST be non-fatal.
      `, "Description": "Architecture documentation for the dual-layer Worker/Job and Agent/Task execution model", "EmptyFile": false, "IsArtifact": false, "Overwrite": false, "Complexity": 6
