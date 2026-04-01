# Kiemenon Feature Expectation Catalog (AGENTS-canonical)

Status: Active
Last updated: 2026-04-01

## 1) Ingestion and Graph Birth

### Expected behavior

- Import chat/data sources through a configurable modal workflow.
- Materialize similarity-weighted graph structures at import completion.
- Preserve role-aware extraction options and branching mode.

### Key requirements

- `KV-IMPORT-001` to `KV-IMPORT-009`
- `KV-FEAT-001`

## 2) Canvas Investigation Experience

### Expected behavior

- Memory-board graph with linked source structures.
- Three.js-canonical canvas rendering across all graph surfaces.
- Explicit `2D`/`3D`/`ND` lenses with deterministic ND slicing controls.
- Multi-scale LOD and focus-preserving interaction.
- Navigator and inspector remain synchronized with canvas selection.

### Key requirements

- `KV-UX-001` to `KV-UX-008`
- `KV-UX-013`
- `KV-FEAT-003`

## 3) Objective/Archetype Trust Layer

### Expected behavior

- Intermediate objective/archetype constructs connect raw source claims and validated outputs.
- Verification outputs retain citations and provenance links.

### Key requirements

- `KV-FEAT-002`
- `KV-DATA-002`
- `KV-AGENT-002`

## 4) Duplicate Review and Source Control

### Expected behavior

- Duplicate handling is review-first, hierarchical, and user-controlled.
- Duplicate decisions should not silently destroy source truth.

### Key requirements

- `KV-IMPORT-008`
- `KV-DATA-003`

## 5) Tiered Capability Model

### Free

- Core graph workflow, local-first posture, bounded scale.

### Pro

- Adds agent runtime and verification/research capabilities with gating.

### Business

- Adds organization-scale workflows, account/user collaboration semantics.

### Key requirements

- `KV-TIER-001` to `KV-TIER-003`
- `KV-AGENT-001` to `KV-AGENT-004`

## 6) Operational Controls and Tenancy

### Expected behavior

- Account switching prevents cross-account state leakage.
- Data clearing controls are scoped by role and account context.
- Mode and permission boundaries are consistently enforced.

### Key requirements

- `KV-OPS-001` to `KV-OPS-003`
- `KV-FEAT-006`
- `KV-UX-005`
