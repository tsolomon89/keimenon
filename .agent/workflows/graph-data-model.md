---
name: graph-data-model
description: 'Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.'
---

# graph-data-model

## Purpose

Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.

## Operational Details

- **Owning Persona**: graph-schema-validator
- **When to Use**: Modifying similarity logic or database schema nodes
- **When NOT to Use**: CSS styling
- **Required Inputs**: Schema models
- **Commands / Checks**: `npm run sqlite:check`
- **Evidence Output**: Validation log
- **Stop Conditions / Acceptance Criteria**: SQLite check confirms schema integrity.

## Step-by-Step Procedure

1. Update types in `agent_context/schemas` and `packages/db`.
2. Validate against existing SQLite constraints.
