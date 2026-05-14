# EPIC INTEGRATION AUDIT: Scoped Conversation & Local Gemma Runtime

**Date:** 2026-05-14
**Status:** Runtime hardened; audit gaps remain documented.
**Epic:** Scoped Conversation & Local Gemma Runtime Integration

## Executive Summary

This document serves as the integration audit for the Keimenon Scoped Conversation and Local Gemma Runtime epics. Keimenon now has a coherent local-first graph-to-conversation runtime architecture. The backend and frontend schemas have been aligned to support bounded synthesis configuration, semantic evidence boundaries, and actor provenance separation. The scoped conversation and local Gemma provider boundary are implemented enough to begin real local runtime setup and manual testing.

---

## 1. Epic-by-Epic Completion Matrix

| Epic Name                                                                     | Intended Outcome                                    | Actual Implementation                                                                                                                                                                  | Code Evidence                     | Test Evidence                  | Status                          | Remaining Gap                                               |
| :---------------------------------------------------------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------- | :----------------------------- | :------------------------------ | :---------------------------------------------------------- |
| **`EPIC-canvas-selection-scoped-conversation-context.md`**                    | Canvas selection generates context spec.            | Rejects unsupported node kinds and resolves groups.                                                                                                                                    | `conversations.routes.ts`         | `conversations.routes.test.ts` | Covered by focused backend test | Requires browser UI manual/E2E validation.                  |
| **`EPIC-golden-path-runtime-verification-and-product-loop-hardening.md`**     | E2E continuity from import to search to provenance. | Backend semantic spine/search/provenance continuity established.                                                                                                                       | `golden-path-runtime.test.ts`     | `golden-path-runtime.test.ts`  | Covered by focused backend test | Not a full UI E2E test; Playwright evidence is missing.     |
| **`EPIC-graph-read-model-canvas-fidelity-and-large-graph-usability.md`**      | High-fidelity graph reads for renderer.             | Node/edge payloads properly structured for client ingestion.                                                                                                                           | `graph.read-model.test.ts`        | `graph.read-model.test.ts`     | Covered by focused backend test | Client-side hydration scaling requires manual verification. |
| **`EPIC-graph-renderer-lod-and-dense-graph-performance.md`**                  | Smooth canvas rendering at scale.                   | InstancedMesh implementation updated.                                                                                                                                                  | `ui-integration-test.test.ts`     | `ui-integration-test.test.ts`  | Partially covered               | Exact scaling limits require empirical testing.             |
| **`EPIC-import-to-graph-integrity-and-read-model.md`**                        | Import correctly builds schema nodes.               | Normalized payload tables and graph identity FK constraints applied.                                                                                                                   | `import-worker.test.ts`           | `import-worker.test.ts`        | Covered by focused backend test | Requires real large-scale ingestion run.                    |
| **`EPIC-local-gemma-agent-runtime-and-scoped-conversation-v1-completion.md`** | Local Gemma runtime boundaries.                     | Synthesis provider registry created; mock synthesis is now represented as a registered provider rather than a direct singleton adapter dependency.                                     | `synthesis-provider-registry.ts`  | `synthesis-runtime.test.ts`    | Covered by focused backend test | Real local model execution requires manual local setup.     |
| **`EPIC-scoped-conversation-message-runtime.md`**                             | Transactional message bounds.                       | Atomic persistence of user and assistant messages handling failures.                                                                                                                   | `conversation-message.service.ts` | `conversations.routes.test.ts` | Covered by focused backend test | -                                                           |
| **`EPIC-scoped-conversation-synthesis-runtime.md`**                           | Synthesis engine dispatch.                          | Message runtime accepts skill/provider selection, resolves the runtime skill through `RuntimeSkillRegistry`, dispatches via `SynthesisProviderRegistry`, and records provenance edges. | `synthesis-runtime.test.ts`       | `synthesis-runtime.test.ts`    | Covered by focused backend test | Real LLM skill adherence needs empirical testing.           |

---

## 2. End-to-End Product-Loop Verification

| Product Phase               | Expected Behavior                                                                         |                         Verification Status                          |
| :-------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------: |
| **1. Chunked Upload**       | File is received, chunked, and written to SQLite DB.                                      |                       Covered by backend tests                       |
| **2. Graph Canvas**         | Canvas successfully loads nodes and edges.                                                |                          Partially covered                           |
| **3. Multi-Select Context** | Drag selection captures `Source` and `Group` nodes.                                       |                   Documented but not E2E verified                    |
| **4. Conversation Init**    | Thread materializes with assigned `human_principal_id`.                                   |                   Covered by focused backend test                    |
| **5. Message Posting**      | User message is persisted via transactional isolation.                                    |                   Covered by focused backend test                    |
| **6. AI Synthesis**         | `SynthesisProviderRegistry` correctly selects the provider and maps output to `AgentRun`. |                   Covered by focused backend test                    |
| **7. Provenance Identity**  | Valid runs map `RUN_BY` to Agent Principal. Failures capture error status cleanly.        |                   Covered by focused backend test                    |
| **8. UI Feedback**          | `ConversationMessageRuntime` receives `agent_run_id` and evidence bounds.                 | Partially covered (React component updated, browser flow unverified) |

---

## 3. Cross-Epic Contradiction List

- **Contradiction:** `UserNode` / `AgentNode` vs. `Principal`.
  - **Resolution:** The type system preserves `UserNode` for legacy wipedown, but the _active runtime_ strictly uses `Principal` to enforce unified human/agent graph identity.
- **Contradiction:** Legacy batched graph write vs. canonical DbWorker bulk insert.
  - **Resolution:** The legacy `DatabaseWriteQueue` remains for non-import write paths. It is not the canonical import path. Import-time graph persistence must use the BulkGraphWriteSink / DbWorker path, with `KEIMENON_BULK_INSERTS=0` treated only as a narrow debug/test bypass where currently supported.
- **Contradiction:** Frontend `evidenceItems` vs. Backend `evidence`.
  - **Resolution:** React UI properties were updated to match the backend `context_pack` schema (`evidence`, `evidence_truncated`).

---

## 4. Code & Test Evidence by Area

**A. Import Pipeline & Data Integrity**

- `apps/api/src/__tests__/import-worker.test.ts`

**B. Scoped Context Resolution**

- `apps/api/src/routes/__tests__/conversations.routes.test.ts`

**C. Actor Separation & AgentRun**

- `apps/api/src/__tests__/synthesis-runtime.test.ts`

**D. Semantic Spine & Provenance**

- `apps/api/src/__tests__/golden-path-runtime.test.ts` (Validates backend semantic continuity, not full browser E2E).

---

## 5. Known Limits

- **Local Runtime:** The local Gemma runtime is architecturally supported, but real local runtime setup and manual validation remain as the next step.
- **Skill Effectiveness:** Runtime skills exist and schema bounds are tested, but the actual skill quality and LLM adherence still needs empirical testing.
- **UI Provenance:** The provenance UI is currently basic; building a rich evidence traversal modal remains future work.
- **Product Loop E2E:** A full browser E2E product-loop test is missing. Playwright evidence is required to prove actual UI-to-DB interactivity.
- **Audit Dependency:** This audit depends on commands actually run in local CI.

---

## 6. Command Evidence Table

| Command                                        | Run? | Result | Notes                                              |
| ---------------------------------------------- | ---: | ------ | -------------------------------------------------- |
| `npm run type-check`                           |  Yes | Passed | 100% compliant in workspace.                       |
| `npm run lint`                                 |  Yes | Passed | 100% compliant in workspace.                       |
| `npm run build`                                |   No | -      | Requires verification.                             |
| `npm run test -- synthesis-runtime.test.ts`    |  Yes | Passed | Covered by focused backend test.                   |
| `npm run test -- conversations.routes.test.ts` |  Yes | Passed | Covered by focused backend test.                   |
| `npm run test -- graph.read-model.test.ts`     |  Yes | Passed | Covered by focused backend test.                   |
| `npm run sqlite:check`                         |  Yes | Passed | Local DB integrity checks successful.              |
| `npm run e2e:smoke`                            |   No | -      | Playwright suite not run; full UI flow unverified. |

---

## 7. Failed/Missing Command Log

- `expected 500 got 404`: Encountered in `conversations.routes.test.ts` due to stricter error boundaries. Fixed test expectations.
- `Cannot read properties of undefined`: Encountered in `conversations.routes.test.ts` after deleting legacy `mockSynthesisAdapter`. Updated test to use `SynthesisProviderRegistry`.

---

## 8. Structured Cleanup Backlog

- **[Next Sprint]** Gemma Local Runtime Setup / First-Run Configuration.
- **[High]** Build UI Provenance Subgraph Viewer to traverse `USED_EVIDENCE`.
- **[Medium]** Add Playwright E2E browser tests to formally prove the full product loop.
- **[Low]** Collapse all remaining `UserNode` legacy queries outside of `DeleteWorker`.

---

## 9. Status Summary

The scoped conversation and local Gemma runtime architecture is ready for local-runtime setup work.

Code is sufficiently hardened for:

- context-scoped conversations
- transactional message persistence
- actor/principal provenance
- mock-provider synthesis
- Gemma-provider boundary wiring
- runtime skill loading

Not yet proven:

- real local Gemma execution
- full browser E2E product loop
- large-scale renderer performance under empirical load
- user-facing provenance traversal UX
