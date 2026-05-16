# AGENTS Truth: Keimenon Vision Contract

Last updated: 2026-05-13
Status: Active, canonical, and implementation-directive.

This file is the objective source of truth for product behavior and engineering decisions.
If any derived spec, matrix, or analysis conflicts with this file, this file wins.

## 0. Project Posture

Keimenon is **pre-live**. No production users exist.

All existing imported/processed data is dev/test data and is disposable.
Backward compatibility with abandoned pre-live architectures is **not required**
unless a path is currently exercised by canonical flows (import, bootstrap, factory-reset, tests).

Canonical bootstrap state (admin account, admin user, admin principal, schema, migrations)
is **not disposable** and must be preserved and reproducible from reset.

Rules for coding agents:

1. Do not preserve compatibility shims, fallback routes, or legacy data paths unless they serve a current canonical flow.
2. Do not treat old dev/test database contents as migration obligations.
3. Retired code paths should be removed or made fail-loud, not silently maintained.
4. Schema and bootstrap must be reproducible via `npm run factory-reset` from any state.

## 1. Product Identity

Keimenon is a local-first, similarity-first knowledge graph platform.
It converts user-provided sources (chat exports first, then broader documents/code) into a living graph with weighted relationships, multi-scale galactic visualization, and optional autonomous agent runtime.

Core framing: "Obsidian meets Poppy" for private, user-owned data.

## 2. Canonical Principles

1. Similarity-first graph birth is the core engine.
2. Raw source content is preserved exactly and remains immutable after import persistence.
3. Provenance is mandatory from objective nodes down to raw sources.
4. Groups and folders are one unified abstraction with role metadata.
5. Duplicate handling is non-destructive and user-controlled.
6. Local-first data handling is mandatory for raw personal content.

## 3. Graph Model

### 3.1 Hierarchy

Business mode hierarchy:

- Account -> Principal(human | agent | contact) -> Sources / Groups / Objectives

Free/Pro single-user mode:

- Principal semantics still apply.
- Human principal is always present.
- Agent principals are first-class when entitlement permits runtime creation/use.

Hierarchy materialization requirements:

- Every account has a visible `AccountNode` in graph space.
- Every in-account principal is linked under its `AccountNode` in the primary hierarchy.
- Sources, groups, objectives, and derived nodes remain account-scoped and principal-linked.

### 3.2 Graph Identity: UserNode / AgentNode / Principal

`Principal` is the canonical actor node kind for new graph materialization.
All new import, conversation, and hierarchy flows MUST use `Principal`.

`UserNode` and `AgentNode` still exist in the type system (`packages/types/src/node-kinds.ts`,
`SYSTEM_NODE_KINDS`, `ALL_NODE_KINDS`) and in runtime code paths that handle deletion safety,
snapshot rendering, and auth principal resolution (`auth.service.ts`).

Current status:

- `UserNode` and `AgentNode` are **system-protected node kinds** in delete operations (preserved during data wipes).
- `auth.service.ts` still queries for `UserNode` as a fallback when resolving principal capabilities, with a migration path to `Principal`.
- `DeleteWorker.ts` preserves `UserNode` alongside `AccountNode`, `Board`, `Constellation`.
- Graph snapshot rendering assigns `UserNode` a display priority.

Pre-live cleanup guidance:

- New features MUST NOT create `UserNode` or `AgentNode` graph nodes.
- Existing code that reads `UserNode`/`AgentNode` for backward compatibility is acceptable during pre-live development but should be collapsed to `Principal`-only before launch.
- The `isActorNode()` helper covers `Principal`, `UserNode`, and `AgentNode` for transitional queries.

### 3.3 Objective Layer

Objective/archetype nodes are consolidated, machine-trustworthy intermediates between raw sources and user/agent interactions.
They maintain claim-evidence linkage and provenance.

## 4. Tier Semantics

### 4.1 Free

- `auto_graph = true`
- `objective_layer = true`
- `agent_runtime = false`
- `business_hierarchy = false`
- `proof_verification = false`
- `external_research = false`

Free behavior:

- Similarity graph materializes at import completion with `Account -> Principal -> Source/Group` hierarchy.
- Objective capability is available, but objective creation/enrichment is user-driven after import.
- No autonomous agent runtime.
- No agent principal creation via runtime-facing user flows.

### 4.2 Pro

- `auto_graph = true`
- `objective_layer = true`
- `agent_runtime = true`
- `business_hierarchy = false`
- `proof_verification = true`
- `external_research = true`

Pro behavior:

- Same graph/hierarchy baseline as Free.
- Agent runtime is available.
- Agent actions are manual-by-default at import time (no automatic activation).
- Objective creation/enrichment remains user-driven; optional objective verification queueing can be explicitly activated.
- User may explicitly create/activate agent workflows.

### 4.3 Business

- Pro entitlements plus `business_hierarchy = true`.
- Multi-principal, account-level collaboration semantics.

## 5. Import Contract

### 5.0 Canonical Import Rail

The **only** supported import rail is chunked upload:

- `POST /api/v1/uploads/initiate`
- `POST /api/v1/uploads/:sessionId/chunks/:chunkIndex`
- `GET /api/v1/uploads/:sessionId`

Implementation: `apps/api/src/routes/uploads.routes.ts`

The old multipart `POST /api/v1/jobs/import` endpoint is retired and removed.
Chunked upload is the only supported import rail.
`import-jobs.routes.ts` currently serves only valid remaining jobs routes, namely delete jobs.

Do not re-introduce multipart import. Do not add new compatibility shims for retired rails.

### 5.1 Import Inputs

Import must honor normalized options across UI/API/worker:

- `processingMode: automatic | manual | hybrid`
- `branches: merged | separate`
- `extraction.includeUser`
- `extraction.includeAssistant`
- `minMessageLength`
- `groups[]`
- `extractCode`
- `codeSettings.*`
- `duplicateDetection.*`
- `agent.bootstrap: manual | auto` (default: `manual`)

### 5.2 Raw Fidelity

- Raw message and code content is not rewritten at import.
- Raw source payloads remain immutable after persistence.
- Derived structures (similarity edges, objective nodes, summaries) must never overwrite raw content.

### 5.3 Similarity and Grouping

Import builds weighted similarity relationships from language structure/mass and materializes grouped graph structure.

### 5.4 Objective Activation Is User-Triggered

- Import completion does not require objective node materialization.
- Import does not auto-create objective claims/archetypes.
- Import does not auto-queue objective verification.
- Objective creation/enrichment/verification are explicit user-triggered post-import flows, gated by entitlements and runtime readiness.

### 5.5 Duplicate Review

Duplicate review is job-scoped and non-destructive.
Actions may change model-scope inclusion/edges but do not physically delete raw nodes.

### 5.6 Golden Path Materialization Invariant

Import success requires non-empty hierarchy materialization for the target account:

- at least one `AccountNode`
- at least one `Principal`
- at least one `Source`
- at least one `Group`
- account-to-principal hierarchy link(s)
- principal-linked source lineage and source-group linkage

If this invariant is not satisfied, import must terminate as failed with reason code
`GRAPH_MATERIALIZATION_FAILED` and include actionable diagnostics.

Implementation: `evaluateGraphMaterializationInvariant()` in `ImportWorker.ts`.

## 6. Graph Write Path

### 6.1 Canonical Write Path: Bulk Insert via DB Worker

The canonical graph write path for import is:

1. `ImportPipelineRunner` produces `AnyNode` and `AnyEdge` objects.
2. `GraphBatchAccumulator` serializes nodes/edges into `GraphBatchPayload` batches (including normalized payloads for `SourceSpan`, `Phrase`, `Packet`, `AtomicUnit`).
3. `BulkGraphWriteSink` dispatches batches to `DbWorkerClient` for off-main-thread bulk insert.

Non-test import runs must fail loudly with `IMPORT_DB_WORKER_UNAVAILABLE` if the DB worker is unavailable.

### 6.2 Dev/Test Bypass: KEIMENON_BULK_INSERTS=0

If `KEIMENON_BULK_INSERTS='0'` is set, the system bypasses the DB worker and writes nodes/edges synchronously via `DatabaseClient`.
This is strictly a **narrow non-import debug path**. Because `DatabaseClient` does not support inserting the graph identity payloads required by the Migration 040 foreign key constraints (such as `SourceSpan`, `Phrase`, `Packet`, and `AtomicUnit`), this bypass **fails loudly** if used during import. It is not a supported production runtime mode, and is not supported for full graph materialization.

### 6.3 DatabaseWriteQueue

`DatabaseWriteQueue` is the legacy batched write mechanism. It provides:

- Interval and threshold-triggered flushing
- Foreign key requeue with escalation to dead-letter
- Circuit breaker for repeated failures

It remains operational for non-import write paths (e.g., ad-hoc node creation). It is not the preferred import-time write path.

## 7. Agent Behavior Contract

### 7.1 Actor Doctrine

1. AI is a user-like actor.
2. `Principal` is the current graph implementation of actor identity.
3. Gemma is not the actor.
4. Provider/model is infrastructure.
5. `AgentRun` records who acted and how they acted.

### 7.2 Agent Scope and Skill Documentation Doctrine

There are two distinct classes of agents in the Keimenon ecosystem. Do not conflate them:

1. **Repository Coding Agents (You):**
   - Instructed by `AGENTS.md`, `GEMINI.md`, and workflows in `.agent/workflows/*`.
   - Used for developing the Keimenon repository.

2. **Packaged App-Runtime Agents (Product Feature):**
   - These are the local Gemma-backed agents that run _inside_ the Keimenon application.
   - Their behaviors, prompts, schemas, and guardrails are located strictly in `agent_context/runtime-skills/*`.
   - Do not put app-runtime skill definitions in `AGENTS.md` or `GEMINI.md`.

### 7.3 Entitlement and Context

1. Agent runtime is entitlement-gated.
2. Import-time agent participation is manual-by-default.
3. Agent principal creation and execution must be blocked when runtime entitlement is absent.
4. Verification and external research operations require relevant Pro/Business entitlements.
5. Conversation creation must resolve/validate `human_principal_id` and `agent_principal_id` as account-scoped `Principal` nodes.
6. Conversation `context_spec` references must be account-scoped and kind-valid (`source_ids`, `group_ids`, optional `workspace_id`).
7. Conversation context_spec references must be account-scoped and kind-valid for all create/update operations.

### 7.4 Native Runtime Contract

1. **Gemma** is the only supported local model family.
2. Keimenon connects to a Keimenon-managed native local Gemma runtime. An endpoint-compatible developer fallback is supported for local endpoints exposing an exact Gemma-family model ID.
3. The native runtime serves an exact Gemma model ID.
4. If a reachable local endpoint does not serve an exact configured Gemma model ID, the system must refuse synthesis and report `GEMMA_MODEL_NOT_FOUND`. Support for non-Gemma model families is explicitly excluded.

## 8. Canvas Fidelity Contract

1. Backend node-kind fidelity must be preserved to client stores and render layers.
2. Three.js is the required canonical renderer shared across all graph canvas surfaces.
3. Explicit dimensional lens behavior is required with toolbar-accessible controls:
   - `2D` lens: planar graph navigation
   - `3D` lens: depth-enabled graph navigation
   - `ND` lens: deterministic projected N-dimensional lens with slice controls
4. ND projection defaults are canonical unless explicitly changed by user controls:
   - `dims = 8`
   - `axes = [0,1,2]`
   - `sliceDim = 3`
   - `sliceCenter = 0`
   - `sliceWidth = 0.35`
5. Multi-scale LOD is required:
   - L0 galactic supernodes
   - L1 source/objective clusters
   - L2 phrase/topic detail
   - L3 atomic view
6. Edges are ephemeral by depth, focus, and strength thresholds.
7. Focus mode and pinned sub-galaxies are supported interaction patterns and must survive culling across 2D/3D/ND lenses.
8. Rendering must remain usable at large scale through culling and progressive detail.
9. If WebGL initialization fails, the UI must show explicit unsupported-renderer messaging rather than silently falling back to legacy 2D canvas rendering.
10. Edge inspection hover is required in canvas mode with stable tooltip metadata derived from edge-kind and edge-data payloads.
11. Marquee multi-select is required with deterministic modifier semantics:
    - plain drag replaces selection
    - Shift drag adds to selection
    - Ctrl/Cmd drag toggles marquee members in selection
12. Node dragging is required in all lenses:
    - `2D` drag uses XY plane semantics
    - `3D` and `ND` drag use projected view-plane semantics while preserving camera usability
13. Interaction semantics must be shared across all graph canvas surfaces through one renderer interaction contract.
14. Primary runtime uses one canonical center graph surface, with import processing shown as a temporary blocking center-state gate that auto-dismisses at terminal job status.
15. Toolbar policy is desktop-full for canvas controls; smaller breakpoints use compact controls that are intentionally reduced and non-equivalent.

## 9. Bootstrap and Schema Contract

### 9.1 Canonical Bootstrap State

The system must boot into a valid local-first state after reset.
`npm run factory-reset` is the canonical reset path.

Factory reset preserves:

- Admin account (`account_type = 'admin'`)
- Admin user(s) linked to admin accounts
- Admin user-account memberships
- Schema and migration history (`migrations`, `schema_metadata` tables)

If no admin principals remain after wipe, factory reset seeds a default:

- Account: `admin@keimenon.com` (id `00000000-0000-0000-0000-000000000001`, type `admin`, class `business`)
- User: `admin@admin.com` (id `00000000-0000-0000-0000-000000000002`)

This bootstrap data is **canonical** and must not be treated as legacy residue.

### 9.2 Schema and Migrations

The current schema is defined in:

- `packages/db/src/sqlite/schema.sql` — canonical DDL
- `packages/db/src/sqlite/migrations/` — ordered migration files (002 through 040)

Migration posture (pre-live):

- All 32 migration files represent the **cumulative schema truth**.
- Since no production data exists, migrations may be squashed, rewritten, or renumbered before launch if beneficial.
- The invariant is: `npm run factory-reset` followed by `npm run doctor:runtime` and `npm run sqlite:check` must produce a valid, bootable database.
- `npm run migrate:to-local:dry-run` must complete without errors.

Schema validation commands:

- `npm run sqlite:check` — PRAGMA integrity_check
- `npm run migrate:to-local:dry-run` — dry-run migration
- `npm run factory-reset:db-only` — reset database without purging local files
- `npm run ops:factory-reset:contract:check` — verify factory-reset contract

### 9.3 Normalized Payload Tables

Migration 038 (`normalize_high_volume_kinds.sql`) introduced normalized payload tables:

- `source_spans`
- `phrases`
- `packets`
- `atomic_units`

Migration 040 (`payload_graph_identity_fks.sql`) added foreign key constraints from these tables
to their parent `nodes` rows (via `node_id`).

These tables are part of the canonical schema and are written by the bulk insert path.

## 10. Operational and Privacy Guarantees

1. Raw personal content remains local-only in user-controlled storage/runtime.
2. Server-side entitlement enforcement is required for import/job/agent-critical routes.
3. Rollout hardening requires required checks, evidence artifacts, and nightly consistency.
4. Dashboard Access: Client users may access Conversations / Workspaces dashboard surfaces required for normal operations. Admin/account/system surfaces remain strictly backend-gated to admin accounts.

## 11. Acceptance Baseline

The implementation is acceptable only when all are true:

1. Canonical center graph viewport is not blank after import (Free and Pro).
2. Similarity-weighted grouping/edges/mass are visible.
3. Raw content invariance and provenance are verifiable.
4. Duplicate review is job-based, stable-ID, and non-destructive.
5. Entitlement gating is server-enforced and client-aware.
6. Node-kind fidelity is preserved end-to-end.
7. Manual-by-default agent bootstrap is enforced at import/runtime boundaries.
8. Account -> Principal -> Source/Group hierarchy is visible and non-blank after materialization.
9. Conversation threads show principal identity plus scoped context indicators derived from validated context sets.
10. Objective/archetype nodes remain provenance-linked and user-driven after import completion.

## 12. Derived Artifacts

The following are derived from this file and must stay aligned:

- `GEMINI.md` (mirror of this file)
- `docs/specs/vision-contract-v1.md`
- `docs/specs/vision-traceability-matrix.md`
- `agent_context/vision_gap_analysis.md`

Any drift in derived artifacts is a bug and must be corrected back to this contract.

**Current drift status (2026-05-13):** `GEMINI.md` is synced to mirror this file.
`docs/specs/vision-contract-v1.md`, `docs/specs/vision-traceability-matrix.md`, and `agent_context/vision_gap_analysis.md` remain stale relative to this update and should be synced in a follow-up documentation pass.
