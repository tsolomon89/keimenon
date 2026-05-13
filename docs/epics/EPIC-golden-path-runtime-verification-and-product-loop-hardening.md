# EPIC: Golden Path Runtime Verification and Product Loop Hardening

## Phase 1: Coverage Inventory

| Product step                  | Current test exists? | File                                                          | Gap                                                                                           | Proposed action                           |
| ----------------------------- | -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| bootstrap/admin account       | Yes                  | `tests/e2e/startup-gate.spec.ts`                              | No E2E verification of clean factory-reset bootstrap.                                         | None for this sprint (outside scope).     |
| auth                          | Yes                  | `tests/auth-suite.js`, `tests/e2e/smoke.spec.ts`              | Basic smoke coverage exists.                                                                  | None.                                     |
| chunked upload/import         | Yes                  | `tests/e2e/chunked-upload-workflow.spec.ts`                   | Robust coverage exists.                                                                       | None.                                     |
| graphBirth diagnostics        | Partial              | `apps/api/src/modules/workers/infrastructure/ImportWorker.ts` | No integration test asserts `graphBirth.passed` payload correctly reaches API terminal state. | Include in new API Golden Path test.      |
| graph read model              | Yes                  | `apps/api/src/__tests__/graph.read-model.test.ts`             | Exists at API boundary.                                                                       | None.                                     |
| frontend read-model load      | No                   | N/A                                                           | No UI test validates data payload matches renderer.                                           | Add Frontend Golden Path test.            |
| renderer LOD survival         | Yes                  | `scripts/perf/lod-burnin.ts`                                  | Hover cache diagnostics log unconditionally.                                                  | Phase 3 cleanup.                          |
| selection stack               | No                   | N/A                                                           | No test for node selection to `SelectionStack`.                                               | Include in new Frontend Golden Path test. |
| conversation context mapping  | No                   | N/A                                                           | No test ensuring supported nodes become `context_spec`.                                       | Include in new Frontend Golden Path test. |
| conversation creation payload | No                   | N/A                                                           | No test verifying backend receives correct `context_spec`.                                    | Include in new Frontend Golden Path test. |

## Phase 2: Add Missing Golden-Path Test

Option B selected: Frontend component golden path.
Test will verify:

- Selected Source + Group + unsupported Phrase
- `SelectionStack` shows Discuss Selection
- `ConversationBrowser` opens modal
- create payload includes only eligible `source_ids` / `group_ids`
- unsupported node count is shown

## Phase 3: Renderer diagnostics cleanup

- Stabilize the hover-cache diagnostics.
- Ensure `evaluateLodPerformanceGate` works without unconditional console logging.
- Add focused tests for `evaluateLodPerformanceGate`.

## Phase 4: Fix integration bugs discovered

- Only address specific integration seams discovered during tests.
