---
name: chat-import-pipeline
description: 'Validates chunked ingestions, entity resolution, and similarity edge generation'
---

# chat-import-pipeline

## Purpose

Validates chunked ingestions, entity resolution, and similarity edge generation

## Operational Details

- **Owning Persona**: chat-import-pipeline-engineer
- **When to Use**: Modifying the import parsing or chunking logic
- **When NOT to Use**: UI-only changes
- **Required Inputs**: Chat export text file chunks
- **Commands / Checks**: `npm run test:data:split`
- **Evidence Output**: Output graph node integrity report
- **Stop Conditions / Acceptance Criteria**: Import chunks result in correctly linked graph nodes.

## Step-by-Step Procedure

1. Slice the test chat data.
2. Parse chunks via `apps/api/src/import`.
3. Note: Full import pipeline tests are not currently scripted, run specific data split unit tests.
