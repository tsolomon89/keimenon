# AGENTS Truth: Keimenon Vision Contract

Last updated: 2026-04-01
Status: Active, canonical, and implementation-directive.

This file is the objective source of truth for product behavior and engineering decisions.
If any derived spec, matrix, or analysis conflicts with this file, this file wins.

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
- Legacy `UserNode`/`AgentNode` artifacts are compatibility-only and not primary hierarchy surfaces.

### 3.2 Objective Layer

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

- Similarity graph materializes at import completion.
- Objective layer exists in baseline/provisional form.
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

- Same graph/objective baseline as Free.
- Agent runtime is available.
- Agent actions are manual-by-default at import time (no automatic activation).
- User may explicitly create/activate agent workflows.

### 4.3 Business

- Pro entitlements plus `business_hierarchy = true`.
- Multi-principal, account-level collaboration semantics.

## 5. Import Contract

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

### 5.4 Objective Queueing and Activation

Objective verification queueing requires all of:

- objective entitlement enabled
- agent runtime entitlement enabled
- kill switch disabled
- `agent.bootstrap == auto`

If `agent.bootstrap == manual`, objective queueing is skipped with explicit reason.

### 5.5 Duplicate Review

Duplicate review is job-scoped and non-destructive.
Actions may change model-scope inclusion/edges but do not physically delete raw nodes.

## 6. Agent Behavior Contract

1. Agent runtime is entitlement-gated.
2. Import-time agent participation is manual-by-default.
3. Agent principal creation and execution must be blocked when runtime entitlement is absent.
4. Verification and external research operations require relevant Pro/Business entitlements.
5. Conversation creation must resolve/validate `human_principal_id` and `agent_principal_id` as account-scoped `Principal` nodes.
6. Conversation `context_spec` references must be account-scoped and kind-valid (`source_ids`, `group_ids`, optional `workspace_id`).
7. Conversation context_spec references must be account-scoped and kind-valid for all create/update operations.

## 7. Canvas Fidelity Contract

1. Backend node-kind fidelity must be preserved to client stores and render layers.
2. Three.js is the required canonical renderer for all keimenon graph canvas surfaces (main viewport, legacy preview, board galaxy, processing mini-graph, and progress overlays).
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
13. Interaction semantics must be shared across all graph canvas surfaces (main viewport, legacy preview, board galaxy, processing mini-graph, and progress overlays) through one renderer interaction contract.
14. Toolbar policy is desktop-full for canvas controls; smaller breakpoints use compact controls that are intentionally reduced and non-equivalent.

## 8. Operational and Privacy Guarantees

1. Raw personal content remains local-only in user-controlled storage/runtime.
2. Server-side entitlement enforcement is required for import/job/agent-critical routes.
3. Rollout hardening requires required checks, evidence artifacts, and nightly consistency.

## 9. Acceptance Baseline

The implementation is acceptable only when all are true:

1. Board is not blank after import (Free and Pro).
2. Similarity-weighted grouping/edges/mass are visible.
3. Raw content invariance and provenance are verifiable.
4. Duplicate review is job-based, stable-ID, and non-destructive.
5. Entitlement gating is server-enforced and client-aware.
6. Node-kind fidelity is preserved end-to-end.
7. Manual-by-default agent bootstrap is enforced at import/runtime boundaries.
8. Account -> Principal -> Source/Group/Objective hierarchy is visible and non-blank after materialization.
9. Conversation threads show principal identity plus scoped context indicators derived from validated context sets.

## 10. Derived Artifacts

The following are derived from this file and must stay aligned:

- `GEMINI.md` (mirror of this file)
- `docs/specs/vision-contract-v1.md`
- `docs/specs/vision-traceability-matrix.md`
- `agent_context/vision_gap_analysis.md`

Any drift in derived artifacts is a bug and must be corrected back to this contract.
