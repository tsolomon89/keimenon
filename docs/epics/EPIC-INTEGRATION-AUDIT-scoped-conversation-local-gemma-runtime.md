# EPIC INTEGRATION AUDIT: Scoped Conversation & Local Gemma Runtime

**Date:** 2026-05-14
**Status:** COMPLETE AND HARDENED
**Epic:** Scoped Conversation & Local Gemma Runtime Integration

## Executive Summary

This document serves as the canonical integration audit and sign-off for the completion of the Scoped Conversation and Local Gemma Runtime epics. Over the course of 8 iterative architectural sprints, the Keimenon backend and frontend have been unified into a coherent, secure, and fully auditable conversation graph runtime. The system now robustly handles single-agent bounded synthesis, granular evidence curation, and bulletproof actor provenance.

## Epic Completion Matrix

| Component                            | Status  | Verification & Evidence                                                                                                                                                                                                                                                                                                                     |
| :----------------------------------- | :-----: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Actor Identity & Provenance**      | ✅ PASS | `AgentRun` nodes correctly separate model infrastructure (`provider`, `model_name`) from agent identity (`actor_principal_id`). The graph maintains distinct `AUTHORED_BY` edges for human vs. agent messages, and `RUN_BY` edges for the execution trace.                                                                                  |
| **Atomic Transaction Resilience**    | ✅ PASS | `ConversationMessageService.postMessage` successfully wraps both success and failure synthesis paths in deterministic transactions. A synthesis failure results in a valid `AgentRun` node with `status: 'error'` to ensure full auditability.                                                                                              |
| **Runtime Skills Sandbox**           | ✅ PASS | App-runtime skills are correctly isolated in `agent_context/runtime-skills/`. The system strictly validates 7 packaged skills (`bounded-answer`, `bounded-synthesis`, `citation-audit`, `claim-extraction`, `gap-analysis`, `objective-claim-proposal`, `source-discovery-plan`), and correctly excludes repository coding agent workflows. |
| **Frontend/Backend Synchronization** | ✅ PASS | `ConversationMessageRuntime` UI properly receives and renders the compact `evidence` and `evidence_truncated` boundaries. The `AgentRunDetails` type includes the newly exposed `agent_run_id` for UI provenance surfacing.                                                                                                                 |
| **Provider Adapter Architecture**    | ✅ PASS | The `SynthesisProviderRegistry` correctly injects both the Local Gemma Provider and the Mock Adapter, eliminating all singleton monkey-patching and ensuring robust test stability.                                                                                                                                                         |

## Provenance Hardening Review

One of the core architectural requirements for Keimenon is the local-first "Trust but Verify" paradigm. This was achieved by formalizing the Actor model:

1. **AI is a user-like actor:** It holds a `Principal` node, just like a human.
2. **Gemma is not the actor:** It is simply the _infrastructure_ (the runtime engine).
3. **Traceability:** Every synthesis attempt materializes an `AgentRun` node.

If a run succeeds:

- User Message -> `AUTHORED_BY` -> Human Principal
- Assistant Message -> `AUTHORED_BY` -> Agent Principal
- AgentRun -> `RUN_BY` -> Agent Principal
- AgentRun -> `RUN_FOR` -> Conversation Thread
- AgentRun -> `INPUT_MESSAGE` -> User Message
- AgentRun -> `PRODUCED_MESSAGE` -> Assistant Message
- AgentRun -> `USED_EVIDENCE` -> [SourceSpan Nodes]

If a run fails (e.g., token limit reached, model crash):

- The User Message is still successfully persisted.
- The Assistant Message is omitted.
- The AgentRun is explicitly created with `status: 'error'` and `error_message`, and all required graph edges (`RUN_BY`, `RUN_FOR`, `INPUT_MESSAGE`) are correctly linked, preventing silent failures.

## Test & Build Stability

- `npm run type-check`: 100% compliant.
- `npm run lint`: 100% compliant.
- `synthesis-runtime.test.ts`: Passes all assertions, including negative boundary checks ensuring repository skills (`.agent/`) do not leak into the product app-runtime skills pool.
- `conversations.routes.test.ts`: Passes all integrations and properly tests failure boundary scenarios utilizing the new `SynthesisProviderRegistry`.
- `npm run sqlite:check`: Pragmas pass, foreign key constraints are honored.

## Agent OS Workflows Used

This integration audit was executed under the strict guidance of the `architecture-contract-guard` and `full-stack-feature-builder` Agent OS workflows. No new feature bloat was added; all efforts were concentrated exclusively on tightening the existing golden path and satisfying the requirements of `AGENTS.md`.

## Open/Next Recommendations

1. **UI Provenance Component Enhancement:** While the backend now successfully serves `agent_run_id`, the next logical step for the frontend team is to build out a rich "View Proof" interactive modal that allows users to traverse the `USED_EVIDENCE` subgraph visually.
2. **Telemetry Implementation:** Consider expanding the `AgentRun` schema with `token_usage` metrics once the V1 release hits the stabilization phase.
