# Duplicate Groups + Blank Canvas Gap Ledger

Date: 2026-04-10  
Scope: single-pass closure for duplicate group labels, blank-canvas visibility drift, and hierarchy reveal consistency.

## Runtime Truth

- Import persistence is succeeding and data exists.
- Duplicate group labels were being materialized across repeated imports.
- Canvas blanks were caused by visibility pipeline gaps (filter/viewport/lens/LOD), not missing database writes.

## Root Causes

1. Group identity drift:

- Import grouping IDs were tied to per-import source membership, so the same label could create new `Group` nodes on later imports.
- Catch-all group creation path produced repeated low-value labels (`Other / Uncategorized` variants).

2. Visibility drift:

- Group selection filtering could hide hierarchy anchors (`AccountNode`, `Principal`, etc.), making graph context disappear.
- LOD/lens slice paths could produce zero visible nodes in edge cases even when data existed.
- Zero-size viewport situations had no explicit recovery state.

## Fixes Applied

1. Group canonicalization:

- Import now canonicalizes groups by account-scoped normalized label key (trim + lowercase + whitespace collapse).
- Catch-all labels are excluded from import materialization.
- Existing canonical group IDs are reused when available.
- Group `member_count` is recomputed from `IN_GROUP` edges after source materialization.

2. One-time repair tooling:

- Added `scripts/ops/repair-duplicate-groups.js`.
- Behavior:
  - merges duplicate-labeled groups per account,
  - rewires edges to canonical group nodes,
  - removes catch-all groups,
  - deduplicates duplicate edges,
  - recomputes `member_count` and normalized label metadata.

3. Canvas visibility hardening:

- Added deterministic lens/LOD fallback to force hierarchy anchors when visible set would be empty.
- Added ND lens fallback when slice filtering removes all nodes.
- Group selection now keeps hierarchy anchors visible while revealing group-connected subgraph IDs.
- Added explicit viewport recovery UI when graph has data but viewport measures zero.

4. Diagnostics/telemetry:

- Added runtime visibility diagnostics payload from renderer to viewport.
- Added explicit events for:
  - `HAS_DATA_BUT_ZERO_VIEWPORT`
  - `HAS_DATA_BUT_RENDERER_NOT_READY`
  - `HAS_DATA_BUT_ZERO_VISIBLE`
- Events include lens, viewport metrics, store counts, filter counts, and API load metrics.

## Validation Evidence

- Unit updates:
  - `apps/api/src/services/autogroup-enhanced.test.ts`
  - `apps/api/src/services/import-enhanced-v2.fidelity.test.ts`
  - `apps/web/src/lib/__tests__/graph-lod.test.ts`
- Operational command added:
  - `npm run groups:repair:canonicalize`
