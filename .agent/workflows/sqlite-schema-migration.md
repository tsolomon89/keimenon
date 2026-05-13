---
name: sqlite-schema-migration
description: 'Orchestrates safe execution and validation of SQLite schema migrations'
---

# sqlite-schema-migration

## Purpose

Orchestrates safe execution and validation of SQLite schema migrations

## Operational Details

- **Owning Persona**: sqlite-storage-specialist
- **Supporting Personas**: architecture-contract-guardian
- **Skills Used**: mcp-integration-expert, graph-schema-validator
- **When to Use**: Manual invocation or migration needed
- **When NOT to Use**: When out of scope of Orchestrates safe execution and validation of SQLite schema migrations.
- **Required Inputs**: Migration script
- **Commands / Checks**: npm run migrate
- **Evidence Output**: SQLite schema dump
- **Stop Conditions / Acceptance Criteria**: Test suite

This workflow orchestrates the safe execution of SQLite schema migrations. Trigger this workflow via `/sqlite-schema-migration`.

## Steps

1. **Analyze Schema:** Review the current `schema.sql` and the proposed migration. Ensure no destructive operations without backup.
2. **Dry-Run:** Use `code-execution-orchestrator` to run the migration against a `.test-dbs` snapshot.
3. **Verify Integrity:** Run `PRAGMA foreign_key_check;` and `PRAGMA integrity_check;`.
4. **Commit:** Only merge or commit if the dry-run passes and the storage specialist persona approves.
