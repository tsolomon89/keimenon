# EPIC: Scoped Conversation Synthesis Runtime

**Status:** Completed (V1 Mocked Runtime Contract)
**Priority:** High
**Owner:** Backend / Full-stack

## Mission

Bring the scoped conversation runtime to a robust v1 mocked runtime contract.

A conversation created from canvas-selected Source/Group context uses that `context_spec` to retrieve bounded evidence and produce a synthesis-ready context pack. This epic finalizes the foundation with strict boundaries and transaction safety, explicitly excluding real LLM integration, streaming, rate limits, prompt-injection controls, and production adapter failure handling.

## 1. Runtime Contract Audit

| Runtime area                  | Current state              | Required v1 state                      | Gap                                | Action                               |
| ----------------------------- | -------------------------- | -------------------------------------- | ---------------------------------- | ------------------------------------ |
| context_spec persistence      | Validated & saved          | Validated against account hierarchy    | Missing deep account scope checks? | Audit & fix                          |
| context-pack retrieval        | `GET /context-pack` exists | Strict account isolation & truncation  | Truncation implicit                | Enforce limits & explicit metadata   |
| context-pack truncation       | Hard limits exist          | Explicit truncation metadata           | Missing explicit metadata          | Return requested/truncated counts    |
| message persistence           | Single transaction block   | Atomic separate transactions           | Bundled transaction                | Separate user/assistant transactions |
| message graph edges           | Missing or partial         | Explicit thread and author edges       | Edges unverified                   | Add strict graph edge tests          |
| message history               | Sorted by timestamp        | `timestamp ASC, id ASC`                | Non-deterministic                  | Update order by                      |
| synthesis input serialization | Mocked input               | Gemma-ready context serialization      | Only mock format                   | Implement Gemma serializer           |
| mock adapter behavior         | Singleton / delay          | Injected interface                     | Hard to test                       | Refactor adapter injection           |
| Gemma provider boundary       | N/A                        | Provider registry pattern              | Missing                            | Implement ProviderRegistry           |
| synthesis failure behavior    | Generic 500                | typed `synthesis_error`, safe user msg | Rollback user msg                  | Fix transaction boundaries           |
| frontend runtime UI           | Separated views            | Compact bounds summary                 | Cluttered context                  | Merge into message runtime           |
| account isolation             | Partial                    | Strict 404 for cross-account           | Might leak 403                     | Ensure 404 for missing/cross-account |
| route error semantics         | Generic 500s/400s          | Mapped 404, 400, 403, 500              | Leaky errors                       | Standardize domain errors            |
| tests                         | Basic coverage             | Comprehensive boundary tests           | Missing edge cases                 | Add targeted API tests               |

## 2. Current Conversation Creation State

Presently, users can select nodes on the graph canvas (Sources, Groups), which triggers the `SelectionStack` and populates a `context_spec` payload upon navigating to the `CreateConversationModal`. The backend endpoint `POST /api/v1/conversations` persists this thread with its `context_spec` while rejecting cross-account or unsupported node kinds.

## 3. Current `context_spec` Contract

The `context_spec` payload holds:

- `source_ids`: Array of authorized Source/SourceDoc/UnifiedDoc/VerifiedSource IDs.
- `group_ids`: Array of authorized Group/Folder IDs.
- Additional fields: `workspace_id`, `include_pinned`, `expansion_rule`.

## 4. Retrieval Sources Available

We have SQLite tables holding `nodes` and edge relationships. We also have normalized payload tables (`source_spans`, `phrases`, `packets`, `atomic_units`) for granular evidence linked to parent `node_id` constraints. Existing services like `graph-spine-builder` provide foundational approaches for walking these datasets.

## 5. Bounded Runtime Slice

Build a backend service and API endpoint to generate a `ConversationContextPack`.

- **Endpoint:** `GET /api/v1/conversations/:id/context-pack`
- **Output:**

```ts
ConversationContextPack {
  conversation_id: string;
  source_ids: string[];
  group_ids: string[];
  evidence: Array<{
    node_id: string;
    kind: string;
    source_id?: string;
    group_id?: string;
    text?: string;
    label?: string;
    provenance?: unknown;
  }>;
  limits: {
    max_sources: number;
    max_groups: number;
    max_evidence_items: number;
  };
}
```

- **Constraints:** Load only allowed nodes mapped in `context_spec`. Provide account-isolation verification at read time. Omit external AI interactions or unverified kinds.

## 6. Non-Goals

- Do not build a generic or streaming chat product.
- Do not call external AI services (no LLM generation).
- Do not invent new agent runtime execution beyond data packaging.
- Do not modify the import pipeline or graph materialization flow.

## 7. Files Touched

- `apps/api/src/services/conversation-context.service.ts`
- `apps/api/src/routes/conversations.routes.ts`
- `apps/api/src/routes/__tests__/conversations.routes.test.ts`
- `docs/epics/EPIC-scoped-conversation-synthesis-runtime.md` (this file)

## 8. Test Plan

Add focused backend API tests to ensure:

- Conversations with valid `context_spec` correctly return bounded context packs.
- Source and Group evidence remains strictly account-scoped.
- Unsupported node requests inherently omit those items.
- Empty specs return an empty, valid response.
- Missing or cross-account conversation requests are firmly rejected with an error.

## 9. Risks

- Database query overhead if context pack extraction joins thousands of nested `source_spans` or phrases. Strict `max_evidence_items` thresholds must mitigate this.
- Account-scoping loopholes if `context_spec` retrieval doesn't rigorously enforce the parent `account_id` check during inner DB joins.
