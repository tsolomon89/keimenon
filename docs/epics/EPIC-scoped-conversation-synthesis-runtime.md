# EPIC: Scoped Conversation Synthesis Runtime

**Status:** Planned
**Priority:** High
**Owner:** Backend / Full-stack

## Mission

Make a conversation created from canvas-selected Source/Group context actually use that `context_spec` to retrieve bounded evidence and produce a synthesis-ready context pack.

## 1. Current Conversation Creation State

Presently, users can select nodes on the graph canvas (Sources, Groups), which triggers the `SelectionStack` and populates a `context_spec` payload upon navigating to the `CreateConversationModal`. The backend endpoint `POST /api/v1/conversations` persists this thread with its `context_spec` while rejecting cross-account or unsupported node kinds.

## 2. Current `context_spec` Contract

The `context_spec` payload holds:

- `source_ids`: Array of authorized Source/SourceDoc/UnifiedDoc/VerifiedSource IDs.
- `group_ids`: Array of authorized Group/Folder IDs.
- Additional fields: `workspace_id`, `include_pinned`, `expansion_rule`.

## 3. Retrieval Sources Available

We have SQLite tables holding `nodes` and edge relationships. We also have normalized payload tables (`source_spans`, `phrases`, `packets`, `atomic_units`) for granular evidence linked to parent `node_id` constraints. Existing services like `graph-spine-builder` provide foundational approaches for walking these datasets.

## 4. Proposed Bounded Runtime Slice

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

## 5. Non-Goals

- Do not build a generic or streaming chat product.
- Do not call external AI services (no LLM generation).
- Do not invent new agent runtime execution beyond data packaging.
- Do not modify the import pipeline or graph materialization flow.

## 6. Files Touched

- `apps/api/src/services/conversation-context.service.ts` (new)
- `apps/api/src/routes/conversations.routes.ts` (modified)
- `apps/api/src/routes/__tests__/conversations.routes.test.ts` (modified)
- `docs/epics/EPIC-scoped-conversation-synthesis-runtime.md` (this file)

## 7. Test Plan

Add focused backend API tests to ensure:

- Conversations with valid `context_spec` correctly return bounded context packs.
- Source and Group evidence remains strictly account-scoped.
- Unsupported node requests inherently omit those items.
- Empty specs return an empty, valid response.
- Missing or cross-account conversation requests are firmly rejected with an error.

## 8. Risks

- Database query overhead if context pack extraction joins thousands of nested `source_spans` or phrases. Strict `max_evidence_items` thresholds must mitigate this.
- Account-scoping loopholes if `context_spec` retrieval doesn't rigorously enforce the parent `account_id` check during inner DB joins.
