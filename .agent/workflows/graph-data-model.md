---
name: graph-data-model
description: 'Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.'
---

# graph-data-model

## Purpose

Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.

## Operational Details

- **Owning Persona**: graph-schema-validator
- **Supporting Personas**: source-provenance-auditor, semantic-grouping-architect
- **Skills Used**: graph-schema-validator, vector-similarity-ops
- **When to Use**: Schema changes
- **When NOT to Use**: When out of scope of Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics..
- **Required Inputs**: Schema spec
- **Commands / Checks**: npm run test
- **Evidence Output**: Validation success
- **Stop Conditions / Acceptance Criteria**: Schema review

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
