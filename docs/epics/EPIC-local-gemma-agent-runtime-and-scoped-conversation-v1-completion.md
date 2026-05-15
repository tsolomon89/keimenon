# EPIC: Local Gemma Agent Runtime and Scoped Conversation v1 Completion

## Epic Mission

Take Keimenon out of mock-only territory by completing the scoped conversation runtime and adding a real local Gemma-backed agent architecture.

## Overview

1. **Current mocked runtime state**: Validates `context_spec`, bounded context pack retrieval works natively, but message persistence and synthesis are mocked.
2. **Current scoped conversation state**: Canvas selection creates thread.
3. **Target Gemma-backed runtime state**: `ContextPack` -> `RuntimeSkill` -> `AgentRun` -> `GemmaLocalProvider` -> `ProposedGraphOutputs`
4. **Selected Gemma model**: Gemma 4 (exact model ID must be verified via /models)
5. **Selected local runtime target**: Local HTTP runtime like Ollama or LM Studio.
6. **Provider architecture**: `SynthesisProviderRegistry` with `mock` and `gemma-local`.
7. **Runtime skill file structure**: `agent_context/runtime-skills/<skill-id>/` defining natural language programs.
8. **AgentRun provenance model**: Every synthesis creates an `AgentRun` tracking evidence counts, inputs, and outputs.
9. **Proposed graph output contract**: Assistant outputs `ProposedGraphOutput` objects rather than mutating the graph.
10. **Frontend runtime plan**: Compact, collapsible context summary merged into the message runtime.
11. **Non-goals**: No BYOK cloud providers. No Llama/Qwen/Mistral. No web search. No final ObjectiveClaim nodes directly from model output.
12. **Test plan**: Thorough coverage of API semantics, AgentRun creation, provider boundary, and transaction atomicity.
13. **Risks**: Local Gemma installation complexity. Token limits when formatting context packs.

## Actor and Documentation Doctrine

### Actor/User Doctrine

- AI is a user-like actor.
- `Principal` is the current graph implementation of actor identity.
- Gemma is not the actor.
- Provider/model is infrastructure.
- `AgentRun` records who acted and how they acted.

### Documentation Scope Separation

There are two different documentation layers that must not be conflated:

1. **Repository / coding-agent doctrine**
   - Files: `AGENTS.md`, `GEMINI.md`, `.agent/skills/*`, `.agent/workflows/*`
   - Purpose: Instruct coding agents working on the Keimenon repository.
   - Content: Architecture doctrine, coding standards. No app-runtime skill definitions.

2. **Packaged runtime agent skills**
   - Files: `agent_context/runtime-skills/*`
   - Purpose: Product-runtime skills used by Keimenon's local model-backed agents.
   - Content: Runtime behavior, skill instructions, output schemas, examples, guardrails.

## Audit & Action Plan

Refer to `EPIC-scoped-conversation-synthesis-runtime.md` for the full contract audit table.

## Next Steps

This epic covers:

- Hardening transaction boundaries for message persistence.
- Implementing the `agent_context/runtime-skills` directory and loader.
- Creating the `GemmaLocalProvider` and `SynthesisProviderRegistry`.
- Building a `GemmaSerializer` to correctly format context-bounded prompts.
- Extending `AgentRun` to capture execution provenance.
- Updating `ConversationMessageRuntime` to show the context pack limits and `AgentRun` metadata.
