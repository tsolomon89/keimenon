---
name: chat-import-pipeline
description: Validates chunked ingestions, entity resolution, and similarity edge generation
---

# chat-import-pipeline

Workflow for validating chunked ingestions and similarity edge generation. Trigger via `/chat-import-pipeline`.

## Participants

- **Decider:** `chat-import-pipeline-engineer` (Persona), `entity-resolution-specialist` (Persona)
- **Capabilities:** `vector-similarity-ops` (Skill)

## Steps

1. **Validate Chunks:** Ensure incoming JSON chunks are parsed safely without altering raw source data.
2. **Extract Entities:** Apply the entity extraction logic.
3. **Resolve Duplicates:** Use `vector-similarity-ops` to compute cosine similarity and assign `DUP_OF` edges.
4. **Graph Materialization:** Verify that the `AccountNode` -> `Principal` -> `Source`/`Group` hierarchy is correctly instantiated.
