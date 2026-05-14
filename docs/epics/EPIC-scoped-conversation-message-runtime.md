# EPIC: Scoped Conversation Message Runtime — Persistence and Mocked Synthesis

## Mission

Build the message runtime slice that allows users to interact with a bounded synthesis context. The application will take the `ConversationContextPack`, serialize it into a synthesis input, and pass it to a mocked adapter boundary. No external LLM calls are made in this slice.

This sprint proves:
ConversationThread
→ user Message
→ context pack
→ synthesis input serialization
→ mocked synthesis adapter
→ assistant Message
→ message history retrieval

## Phase 0 — Context-pack stabilization prerequisite

Before building message runtime, verify and, if needed, complete context-pack stabilization:

1. Ensure `context_pack.source_ids` contains only source IDs validated as account-scoped source-like nodes.
2. Add explicit truncation metadata:
   - sources_truncated
   - groups_truncated
   - evidence_truncated
   - requested_sources
   - returned_sources
   - requested_groups
   - returned_groups
   - returned_evidence_items
3. Add/update tests for group-derived valid sources, unsupported group-linked nodes, and truncation metadata.

_(Note: Phase 0 was successfully completed in the previous sprint, verified by tests)._

## Runtime acceptance rules

1. User message persistence is not dependent on synthesis success.
   - Persist the user `Message` first.
   - If synthesis fails, return the user message plus `synthesis_error`.
   - Do not persist an assistant message unless adapter synthesis succeeds.

2. Message graph edges must be created:
   - `ConversationThread -HAS_MESSAGE-> Message`
   - `Message -AUTHORED_BY-> Principal` where principal is resolvable

## Files

- `apps/api/src/services/conversation-message.service.ts`
- `apps/api/src/services/conversation-synthesis-adapter.ts`
- `apps/api/src/services/conversation-synthesis-input.ts`
- `apps/api/src/routes/conversations.routes.ts`
- `apps/api/src/routes/__tests__/conversations.routes.test.ts`
- `apps/web/src/services/organization-service.ts`
- `apps/web/src/components/conversations/ConversationMessageRuntime.tsx`

## API

### GET `/api/v1/conversations/:id/messages`

Returns ordered messages for the account-scoped conversation.

### POST `/api/v1/conversations/:id/messages`

Request:

```ts
{
  content: string;
  run_synthesis?: boolean;
}
```

Behavior:

1. validate account-scoped conversation
2. persist user Message
3. if `run_synthesis !== false`, build context pack
4. serialize synthesis input
5. call mocked synthesis adapter
6. persist assistant Message if adapter succeeds
7. return user message, optional assistant message, and synthesis metadata
