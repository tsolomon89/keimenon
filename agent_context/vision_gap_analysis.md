# Keimenon Vision Gap Analysis (AGENTS-canonical Pass)

Last updated: 2026-04-09 (canonical import + objective correction pass).

Scope: current implementation state versus canonical `AGENTS.md` at repository root, with `agent_context/Kiemenon.md` retained as supplementary intent evidence.

## Canonical references for this pass

- `docs/specs/kiemenon-requirement-ledger.md`
- `docs/specs/kiemenon-vision-traceability-matrix.md`
- `docs/specs/kiemenon-data-trust-contract.md`

## Current Status

- Requirement inventory: 42
- Implemented: 42
- Partial: 0
- Conflict (vision drift): 0

## Vision drift resolved in this pass

1. `KV-UX-004` + `KV-FEAT-003`: canvas renderer is Three.js-canonical with explicit `2D`/`3D`/`ND` lens controls and ND slice semantics.
2. `KV-IMPORT-008`: duplicate review now enforces complete per-candidate decisions and provides merge preview assistance.
3. `KV-IMPORT-009`: `agent.bootstrap` is explicit in UI, propagated through upload rails, and entitlement-downgraded to manual when runtime is unavailable.
4. `KV-UX-004` + `KV-FEAT-003`: toolbar/viewport now expose explicit camera + LOD semantics with focus-mode and pinned-subgraph culling survival.
5. `KV-UX-008`: label resolver now drives inspector/selection/navigation paths instead of ID-first titling.
6. `KV-FEAT-002`: objective layer now carries explicit archetype typing with lifecycle/provenance transitions.
7. `KV-DATA-001`: raw-content immutability assertions now validate raw-content hashes remain invariant while derived hashes vary by processing mode.
8. `KV-OPS-001`: deterministic account-switch isolation utility and tests now cover store reset, cache/session cleanup, and post-switch graph isolation.
9. `KV-TIER-002` + `KV-TIER-003`: local-custody egress policy and business account/user permission boundaries now have explicit route/runtime test coverage.
10. `KV-UX-009`: edge-inspection hover now provides deterministic tooltip metadata from edge payloads.
11. `KV-UX-010`: marquee selection now supports replace/add/toggle modifier semantics.
12. `KV-UX-011`: node drag behavior now supports lens-consistent 2D/3D/ND semantics.
13. `KV-UX-012`: toolbar now follows desktop-full canvas controls with compact reduced controls for smaller breakpoints.
14. `KV-FEAT-005`: graph surfaces now share renderer interaction contracts and responsive sizing behavior.
15. `KV-UX-013`: structural filtering and hierarchy materialization now preserve Account/Principal visibility in primary graph views.
16. `KV-FEAT-006`: auth, account/user, principal, and import flows now materialize account/principal hierarchy links idempotently.
17. `KV-AGENT-004`: conversation routes now enforce principal-scoped context validation and return explicit context indicators.
18. Contract correction applied: import success now requires auto-materialized `Account -> Principal -> Source/Group`; objective/archetype creation remains user-driven post-import.
19. Import worker now enforces golden-path graph materialization invariants and fails terminally with `GRAPH_MATERIALIZATION_FAILED` when hierarchy counts/links are missing.
20. Duplicate review apply now uses deterministic state machine (`pending -> ready -> applying -> completed|failed`) with idempotent completion and explicit failure reason codes (`REVIEW_APPLY_TIMEOUT`, `REVIEW_APPLY_CONFLICT`).
21. PR/nightly SLO gate infrastructure now emits/evaluates golden-path runtime artifacts via `tests/e2e/golden-path-slo.spec.ts` and `scripts/ops/evaluate-golden-path-slo.js`.
22. Import entry points are now chunked-upload canonical (`/api/v1/uploads/*`), and multipart `/api/v1/jobs/import` is compatibility-only (`410 Gone`) with migration guidance.
23. Import completion no longer auto-creates objective claims/archetypes and no longer auto-queues objective verification; objective activation is explicit user-triggered post-import behavior.
24. Primary runtime now uses a single canonical center graph surface, with import processing shown as a temporary blocking center-state gate that auto-dismisses at terminal job status.
25. Traceability and contract artifacts were re-aligned so chunked-only import, user-driven objective activation, and single-surface runtime behavior no longer conflict across matrices/specs.

## Notes

- Root `AGENTS.md` is canonical for this analysis pass.
- Supplementary source `agent_context/Kiemenon.md` remained immutable in this pass (SHA256: `681EB475138BB034C93E5C585F9E96050D9C0A1DC45C88D5746C669FFDE14BE2`).
- Derived artifacts must not present contradictory status/evidence claims relative to the active traceability matrix.
