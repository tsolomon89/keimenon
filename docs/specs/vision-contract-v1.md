# Vision Contract v1 (Derived from AGENTS.md)

Status: Active as of 2026-03-27.

This document is an implementation contract derived from root `AGENTS.md`.
On conflict, `AGENTS.md` is authoritative.

## 1) Canonical Product Decisions

1. Tier model:
   - Free: automatic similarity graph plus objective baseline, manual refinement.
   - Pro: Free features plus agent runtime and verification capability.
   - Business: Pro features plus account-level multi-principal hierarchy.
2. Raw personal content locality:
   - Raw content remains local-only in user-controlled storage/runtime.
   - Raw content is immutable once persisted for an import batch.
3. Import completion semantics:
   - Import completes when weighted graph and provisional objective layer are materialized.
   - Deep verification can continue asynchronously through explicit lifecycle states.

## 2) Tier Entitlements (Server-Enforced)

The entitlement manifest is served by `GET /api/v1/me/features` and enforced server-side.

- `auto_graph`
- `objective_layer`
- `agent_runtime`
- `business_hierarchy`
- `proof_verification`
- `external_research`

Tier expectations:

- Free: `auto_graph=true`, `objective_layer=true`, `agent_runtime=false`, `business_hierarchy=false`, `proof_verification=false`, `external_research=false`.
- Pro: `auto_graph=true`, `objective_layer=true`, `agent_runtime=true`, `business_hierarchy=false`, `proof_verification=true`, `external_research=true`.
- Business: Pro entitlements plus `business_hierarchy=true`.

## 3) Import Config Contract (Single Schema)

Canonical fields:

- `processingMode: automatic | manual | hybrid`
- `branches: merged | separate`
- `extraction.includeUser`
- `extraction.includeAssistant`
- `minMessageLength`
- `groups[]`
- `extractCode`
- `codeSettings.minLength`
- `codeSettings.languages[]`
- `codeSettings.groupBy`
- `codeSettings.deduplicate`
- `codeSettings.sourceHandling: keep_inline | extract_and_remove`
- `duplicateDetection.*`
- `agent.bootstrap: manual | auto` (default: `manual`)

Rules:

1. UI, API routes, chunked upload flow, and workers normalize with the same canonical schema.
2. `branches` is explicit and must not be inferred.
3. `processingMode=hybrid` allows manual groups plus automatic grouping in one run.
4. Agent activation is manual-by-default at import (`agent.bootstrap=manual`).

## 4) Objective Queue Contract

Objective build queueing is allowed only when all are true:

- `objective_layer=true`
- `agent_runtime=true`
- objective enqueue kill switch is disabled
- `agent.bootstrap=auto`

When not queued, skip reason must be explicit (`entitlement_missing`, `kill_switch_enabled`, or `manual_activation_required`).

## 5) Duplicate Review Contract

Candidates are job-scoped, stable, and non-destructive.

APIs:

- `GET /api/v1/jobs/:id/duplicate-review/groups`
- `GET /api/v1/jobs/:id/duplicate-review/status`
- `POST /api/v1/jobs/:id/duplicate-review/apply`

Decision actions:

- `keep-primary`
- `keep-duplicate`
- `keep-both`
- `merge`
- `sequester`

## 6) Objective/Archetype Lifecycle Contract

Lifecycle states:

- `provisional -> verifying -> verified | contested | stale`

Requirements:

1. Provisional objective nodes exist at import completion for major clusters.
2. Verification artifacts preserve provenance and claim-evidence linkage.
3. Verification adapters may degrade gracefully, but status remains explicit.

## 7) Graph Hierarchy Contract

- Business: `Account -> Principal(human|agent|contact) -> Sources/Groups/Objectives`
- Free/Pro single-user mode still uses principal semantics.
- Agent principals are first-class only where entitlement allows runtime creation/use.

## 8) Canvas Fidelity Contract

Minimum rendering behavior:

1. Preserve backend node kind fidelity in client store and viewport mapping.
2. Three.js is the required canonical renderer for all graph canvas surfaces.
3. Explicit dimensional lens behavior is required with toolbar controls:
   - `2D` planar lens
   - `3D` depth lens
   - `ND` deterministic projected lens with slice controls
4. ND defaults unless user-modified:
   - `dims = 8`
   - `axes = [0,1,2]`
   - `sliceDim = 3`
   - `sliceCenter = 0`
   - `sliceWidth = 0.35`
5. Multi-scale LOD:
   - L0 galactic supernodes
   - L1 source/objective clusters
   - L2 phrase/topic detail
   - L3 atomic view
6. Ephemeral edges by depth/strength/focus.
7. Focus mode and pinned sub-galaxies survive culling across 2D/3D/ND lenses.
8. If WebGL is unavailable, show explicit unsupported-renderer messaging; no silent fallback to legacy 2D canvas.
9. Edge inspection hover must produce stable edge metadata tooltips in canvas mode.
10. Marquee multi-select must support replace/add/toggle semantics via plain/Shift/Ctrl(Cmd) drag modifiers.
11. Node dragging must be available in all lenses with 2D XY drag and 3D/ND projected-plane drag.
12. Interaction semantics must be shared across all graph canvas surfaces through a single renderer interaction contract.
13. Toolbar policy is desktop-full for canvas controls with compact reduced controls at smaller breakpoints.

## 9) Acceptance Baseline

Implementation is acceptable only when all are true:

1. Board is not blank after import in Free and Pro.
2. Similarity-weighted grouping/edges/mass are visible.
3. Raw content invariance and provenance are verifiable.
4. Duplicate review is job-based, stable-ID, and non-destructive.
5. Entitlement gating is server-enforced and client-aware.
6. Node kind fidelity is preserved end-to-end in canvas rendering.
7. Manual-by-default agent bootstrap is enforced.
