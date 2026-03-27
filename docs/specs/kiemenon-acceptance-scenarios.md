# Kiemenon Acceptance Scenarios (AGENTS-canonical)

Status: Active
Last updated: 2026-03-27

## Scenario A1: First Import Creates Usable Board
- Preconditions: authenticated user, empty graph
- Steps: open import modal, configure options, submit
- Expected: non-empty graph or explicit guided empty state; import status visible
- Requirements: `KV-IMPORT-001`, `KV-FEAT-001`, `KV-UX-001`

## Scenario A2: Import Config Completeness
- Preconditions: import modal open
- Steps: inspect all configuration sections
- Expected: extraction, branches, min length, processing mode, groups, duplicate settings, code settings available
- Requirements: `KV-IMPORT-002` to `KV-IMPORT-007`

## Scenario A3: Duplicate Review Workflow
- Preconditions: import produces duplicate candidates
- Steps: set per-item decisions and apply
- Expected: job-scoped decisions applied; review states tracked; no silent destructive behavior
- Requirements: `KV-IMPORT-008`, `KV-DATA-003`

## Scenario A4: Canvas Shell Control Integrity
- Preconditions: keimenon mode active
- Steps: toggle nav/inspector/console; switch modes
- Expected: independent panel toggles work; center toolbar controls canvas-only
- Requirements: `KV-UX-001`, `KV-UX-003`, `KV-UX-004`

## Scenario A5: Navigator/Inspector Synchronization
- Preconditions: graph loaded with groups/folders
- Steps: select group/folder, then select nodes on canvas
- Expected: bidirectional selection context updates across navigator, canvas, inspector
- Requirements: `KV-UX-006`, `KV-UX-007`

## Scenario A6: Human-readable Labels
- Preconditions: imported chat/source with title metadata
- Steps: inspect node labels in canvas and inspector
- Expected: labels use source-derived names before ID fallbacks
- Requirements: `KV-UX-008`

## Scenario A7: Tier Gating (Free vs Pro)
- Preconditions: free account and pro account test contexts
- Steps: attempt agent runtime + verify/research operations
- Expected: free denied; pro allowed when required features enabled
- Requirements: `KV-TIER-001`, `KV-AGENT-001`, `KV-AGENT-002`

## Scenario A8: Business Workflow Surface
- Preconditions: business-tier account context
- Steps: access account/user workflow screens and org-level controls
- Expected: business-specific workflow surfaces available
- Requirements: `KV-TIER-003`

## Scenario A9: Local-First and Egress Controls
- Preconditions: verification flow run
- Steps: inspect egress metadata in result artifacts
- Expected: egress mode is explicit; bounded/default-safe transfer behavior observed
- Requirements: `KV-TIER-002`, `KV-DATA-004`

## Scenario A10: Account Switch Isolation
- Preconditions: user can switch accounts
- Steps: load account A graph, switch to account B
- Expected: caches/state reset; no A-data in B context
- Requirements: `KV-OPS-001`

## Scenario A11: Scoped Data Reset Controls
- Preconditions: settings/data page
- Steps: user clears own keimenon; admin clears all client data
- Expected: scope boundaries respected and actions role-gated
- Requirements: `KV-OPS-002`

## Scenario A12: Drift Reporting Discipline
- Preconditions: docs update pass
- Steps: compare Kiemenon expectation and implementation
- Expected: conflicts are explicit in matrix with actionable next steps
- Requirements: `KV-OPS-003`

## Scenario A13: Three-Lens Canvas Fidelity
- Preconditions: graph loaded with mixed node kinds
- Steps: switch canvas lens across `2D`, `3D`, and `ND`; toggle focus mode and pin nodes
- Expected: rendering remains Three.js/WebGL-backed in each lens; focus/pinned nodes remain visible through LOD and ND slicing
- Requirements: `KV-UX-004`, `KV-FEAT-003`
