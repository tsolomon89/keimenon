# Kiemenon Data and Trust Contract (AGENTS-canonical)

Status: Active
Last updated: 2026-03-27

## 1) Raw Fidelity Contract
- Imported raw source payloads are immutable after persistence.
- Derived artifacts (groups, summaries, objective claims, dedupe metadata) must not overwrite raw truth.

Requirements: `KV-DATA-001`

## 2) Provenance Contract
- Objective outputs must keep evidence links back to source nodes.
- Claim-evidence lineage must be queryable and auditable.

Requirements: `KV-DATA-002`, `KV-FEAT-002`

## 3) Duplicate Contract
- Duplicate identification is analysis metadata, not a license to delete source truth by default.
- User review and explicit decisions govern duplicate outcomes.
- Non-destructive outcomes are preferred baseline behavior.

Requirements: `KV-IMPORT-008`, `KV-DATA-003`

## 4) Local-First and Egress Contract
- Personal raw content is local-first by default.
- Any outbound content transfer is explicit, bounded, and auditable.
- Egress mode (full vs excerpt) must be observable in logs/results.

Requirements: `KV-TIER-002`, `KV-DATA-004`

## 5) Entitlement and Runtime Contract
- Agent runtime access is tier-gated.
- Verification/research operations are gated by required entitlements.
- Retry paths must preserve the same entitlement checks as create paths.

Requirements: `KV-AGENT-001`, `KV-AGENT-002`, `KV-AGENT-003`

## 6) Drift Discipline (AGENTS-canonical)
- Root `AGENTS.md` is canonical; supplementary documents cannot override it.
- Any disagreement between requirement ledger, traceability matrices, and implementation evidence is treated as a documentation defect.
- Current matrix revision reports no open `vision_drift` conflicts; unresolved items are tracked as `coverage_gap` only.
