# EPIC: Canvas Selection → Scoped Conversation Context

**Status:** Active
**Priority:** High
**Owner:** UI/Frontend

## Mission

Transition the Keimenon Canvas from a "view-only" dense rendering plane to an "active selection" workspace by enabling multi-node marquee selections to hook smoothly into the broader synthesis and prompt-engineering workflows.

With graph data hydrated and properly rendering under massive dense conditions without lag, the next boundary is utilizing graph exploration to drive intelligent conversation.

## Requirements

### 1. Canvas to Dashboard Routing

- When multiple nodes are selected via the marquee tool, the `SelectionStack` (right sidebar) presents a summary.
- The `SelectionStack` MUST expose a "Discuss Selection" action to trigger context retrieval.
- Clicking this action MUST route the user out of the Keimenon Graph view to the Dashboard view (`dashboardView === 'conversations'`), preserving the selection context across the transition.

### 2. Node Kind Strictness

The UI MUST NOT blindly pass arbitrary selected nodes to the backend conversation endpoint. The backend contract `context_spec` supports `source_ids` and `group_ids`.

The frontend MUST classify selected nodes using their canonical `node.kind` rather than the loose visual `node.type`.

**Eligible Mapping:**

- `Source`, `SourceDoc`, `VerifiedSource` → `source_ids`
- `Group`, `Folder` → `group_ids`

**Ineligible (Unsupported) Node Kinds:**

- `Phrase`, `Topic`, `SourceSpan`, `Packet`, `AtomicUnit`, `Message`, `ConversationThread`, `CodeBlock`, `AccountNode`, `Principal`
- Unsupported nodes MUST be ignored in the initial context payload and counted so the user is informed of the truncation.

### 3. Consumption Semantics

Pending `context_spec` routing is ephemeral. Once the user is routed to the `ConversationBrowser` and the `CreateConversationModal` is automatically opened, the context MUST be consumed.

- The modal MUST display a summary: `Context attached: X sources, Y groups. Unsupported selected nodes ignored: N`.
- If the modal is closed, the context is cleared and will not reappear unexpectedly on re-renders.

### 4. API Completeness

The `CreateConversationModal` MUST include the generated `context_spec` payload when invoking `organizationService.createConversation`, finalizing the loop from visual canvas selection to an active backend session.
