---
name: sqlite-schema-migration
description: Orchestrates safe execution and validation of SQLite schema migrations
---

# sqlite-schema-migration

This workflow orchestrates the safe execution of SQLite schema migrations. Trigger this workflow via `/sqlite-schema-migration`.

## Participants

- **Decider:** `sqlite-storage-specialist` (Persona)
- **Capability:** `code-execution-orchestrator` (Skill)

## Steps

1. **Analyze Schema:** Review the current `schema.sql` and the proposed migration. Ensure no destructive operations without backup.
2. **Dry-Run:** Use `code-execution-orchestrator` to run the migration against a `.test-dbs` snapshot.
3. **Verify Integrity:** Run `PRAGMA foreign_key_check;` and `PRAGMA integrity_check;`.
4. **Commit:** Only merge or commit if the dry-run passes and the storage specialist persona approves.
