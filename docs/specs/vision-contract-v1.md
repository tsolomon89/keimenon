# Vision Contract v1 (Derived from AGENTS.md)

Status: Active as of 2026-04-09.

This document is an implementation contract derived from root `AGENTS.md`.
On conflict, `AGENTS.md` is authoritative.

## 1) Canonical Product Decisions

1. Tier model:
   - Free: automatic similarity graph with `Account -> Principal -> Source/Group` materialization.
   - Pro: Free features plus agent runtime and verification capability.
   - Business: Pro features plus account-level multi-principal hierarchy.
2. Raw personal content locality:
   - Raw content remains local-only in user-controlled storage/runtime.
   - Raw content is immutable once persisted for an import batch.
3. Import completion semantics:
   - Import completes when weighted similarity graph plus `Account -> Principal -> Source/Group` hierarchy are materialized.
   - Objective creation/enrichment is user-driven after import; deep verification can continue asynchronously through explicit lifecycle states.

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

Canonical import rail is chunked upload:

- `POST /api/v1/uploads/initiate`
- `POST /api/v1/uploads/:sessionId/chunks/:chunkIndex`
- `GET /api/v1/uploads/:sessionId`

Compatibility note: `POST /api/v1/jobs/import` is retained only as a `410 Gone` shim.

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

## 4) Objective Activation Contract

Import completion does not require objective node materialization.
Import does not auto-create objective claims/archetypes and does not auto-queue objective verification.
Objective creation/enrichment/verification are explicit user-triggered post-import actions with entitlement and runtime gating.

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

1. Objective/archetype nodes are user-driven and may be created/activated after import completion.
2. Verification artifacts preserve provenance and claim-evidence linkage.
3. Verification adapters may degrade gracefully, but status remains explicit.

## 7) Graph Hierarchy Contract

- Business: `Account -> Principal(human|agent|contact) -> Sources/Groups/Objectives`
- Free/Pro single-user mode still uses principal semantics.
- Agent principals are first-class only where entitlement allows runtime creation/use.
- Hierarchy materialization is mandatory in graph space:
  - every account has a visible `AccountNode`
  - every in-account principal is linked under that account node
  - source/group/objective nodes remain principal-linked and account-scoped
- Legacy `UserNode`/`AgentNode` artifacts are compatibility-only and not primary hierarchy surfaces.

## 7.1) Conversation Context Contract (Aligned)

- Conversation creation must resolve/validate principal references as account-scoped `Principal` nodes.
- `human_principal_id` and `agent_principal_id` must resolve to account-scoped `Principal` nodes.
- Agent participation in conversations is entitlement-gated by `agent_runtime`.
- Conversation context_spec references must be account-scoped and kind-valid for all create/update operations.
- `context_spec` references must be validated by account scope and expected kind:
  - `source_ids`: `Source|SourceDoc|UnifiedDoc|VerifiedSource`
  - `group_ids`: `Group|Folder`
  - `workspace_id` (optional): `Source`
- **Canvas Selection Mapping (Structural Translation)**: Detail selections (such as Topics, Phrases, or SourceSpans) are automatically mapped to their corresponding parent `Source` or `Group` nodes in the `context_spec` payload to ensure Gemma receives robust, full-text context.
- **Large Context Assembly (Hierarchical Map-Reduce)**: For large selected context sets (e.g. thousands of messages in a Group), the system builds consolidated background summaries of the sources. These compressed summaries are fed into Gemma's active context window instead of raw concatenated text.
- **Fidelity & Provenance (Fact-Grounding + Lineage Citation)**: Gemma's system prompts enforce a strict fact-grounding policy (only using provided facts, refusing to invent detail) and require explicit citations (referencing original message or document IDs) in the final response.
- **External Research Integration (Entitlement-Gated Research Loop)**: Under Pro/Business tiers, when Gemma identifies a context gap or is asked to verify, it halts synthesis and triggers an autonomous background web-research tool call to fetch high domain authority sources, appending them to the active context before resuming.
- Conversation responses must include principal identity and scoped context indicators.

## 8) Canvas Fidelity Contract

Minimum rendering behavior:

1. Preserve backend node kind fidelity in client store and viewport mapping.
2. Three.js is the required canonical renderer shared across all graph canvas surfaces.
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
13. Primary runtime uses one canonical center graph surface, with import processing shown as a temporary blocking center-state gate that auto-dismisses at terminal job status.
14. Toolbar policy is desktop-full for canvas controls with compact reduced controls at smaller breakpoints.

## 9) Acceptance Baseline

Implementation is acceptable only when all are true:

1. Canonical center graph viewport is not blank after import in Free and Pro.
2. Similarity-weighted grouping/edges/mass are visible.
3. Raw content invariance and provenance are verifiable.
4. Duplicate review is job-based, stable-ID, and non-destructive.
5. Entitlement gating is server-enforced and client-aware.
6. Node kind fidelity is preserved end-to-end in canvas rendering.
7. Manual-by-default agent bootstrap is enforced.
8. Account/principal hierarchy is visible in graph rendering after materialization.
9. Conversation threads expose validated principal and context scope metadata.
