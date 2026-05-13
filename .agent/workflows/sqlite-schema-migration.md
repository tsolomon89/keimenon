---
name: sqlite-schema-migration
description: 'Orchestrates safe execution and validation of SQLite schema migrations'
---

# sqlite-schema-migration

## Purpose

Orchestrates safe execution and validation of SQLite schema migrations

## Operational Details

- **Owning Persona**: sqlite-storage-specialist
- **When to Use**: Database schema updates required
- **When NOT to Use**: Minor non-schema query changes
- **Required Inputs**: Migration scripts or DDL statements
- **Commands / Checks**: `npm run sqlite:check, npm run migrate:to-local:dry-run`
- **Evidence Output**: Database dump and dry-run log
- **Stop Conditions / Acceptance Criteria**: Migration dry-run completes without error.

## Step-by-Step Procedure

1. Read `packages/db` for existing migrations.
2. Apply the requested SQL delta.
3. Run schema validation script to ensure integrity.
