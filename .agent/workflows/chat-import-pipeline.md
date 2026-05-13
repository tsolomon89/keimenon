---
name: chat-import-pipeline
description: 'Validates chunked ingestions, entity resolution, and similarity edge generation'
---

# chat-import-pipeline

## Purpose

Validates chunked ingestions, entity resolution, and similarity edge generation

## Operational Details

- **Owning Persona**: chat-import-pipeline-engineer
- **Supporting Personas**: entity-resolution-specialist, semantic-grouping-architect
- **Skills Used**: vector-similarity-ops, mcp-integration-expert
- **When to Use**: Import changes
- **When NOT to Use**: When out of scope of Validates chunked ingestions, entity resolution, and similarity edge generation.
- **Required Inputs**: Test data
- **Commands / Checks**: npm run test:import
- **Evidence Output**: Database snapshot
- **Stop Conditions / Acceptance Criteria**: Tests

Workflow for validating chunked ingestions and similarity edge generation. Trigger via `/chat-import-pipeline`.

## Steps

1. **Validate Chunks:** Ensure incoming JSON chunks are parsed safely without altering raw source data.
2. **Extract Entities:** Apply the entity extraction logic.
3. **Resolve Duplicates:** Use `vector-similarity-ops` to compute cosine similarity and assign `DUP_OF` edges.
4. **Graph Materialization:** Verify that the `AccountNode` -> `Principal` -> `Source`/`Group` hierarchy is correctly instantiated.
