---
name: dead-code-cleanup
description: 'Safe, reversible code deletion with required multi-evidence checking and post-deletion test runs.'
---

# dead-code-cleanup

## Purpose

Safely removes code from the repository without breaking existing functionality, by ensuring rigorous evidence standards and safe quarantine mechanics.

## Operational Details

- **Owning Persona**: ops-hygiene-engineer
- **Supporting Personas**: repo-cartographer
- **Skills Used**: code-review-enforcer
- **When to Use**: When removing unused code, stale documentation, or abandoned features.
- **When NOT to Use**: For active refactoring or feature building.
- **Required Inputs**: The specific file paths, variables, or functions targeted for deletion.
- **Commands / Checks**: `npm run type-check && npm run test`
- **Evidence Output**: File-by-file rationale, `.tmp/` quarantine manifest, and test success log.
- **Stop Conditions / Acceptance Criteria**: Code is removed from active paths, tests and type-checks pass perfectly, and the quarantine manifest is updated.

## What Counts as Dead Code

- Unreachable logic blocks.
- Exported functions or classes with exactly 0 references anywhere in the repository.

## What Does NOT Count as Dead Code

- Stubbed features explicitly marked for future milestones.
- Abstract base classes designed for inheritance.
- Test scaffolding, mocks, or fixtures.

## Evidence Standard

You MUST acquire TWO distinct forms of evidence before declaring code "dead":

1. A search/grep confirmation yielding exactly 0 references across `apps/`, `packages/`, `scripts/`, `tests/`, `.mcp/`, `.agent/`, `.claude/`, config files, package scripts, dynamic imports, and generated desktop/web-dist paths.
2. A `package.json` script check explicitly confirming the code is not invoked via an NPM script.

Never allow deletion based on a single search result.

## Deletion Procedure

1. Define the target code using the Evidence Standard.
2. Check `.gitignore` for a quarantine target. Use an explicitly ignored temp path (e.g., `.tmp/dead-code-quarantine/`) or create a documented manifest without committing quarantined code.
3. Move the target files to the quarantine location.
4. For partial file deletions (e.g. functions within a file), comment out the code rather than deleting it immediately, or commit the deletion as a reversible, isolated Git commit.
5. Identify generated artifacts or stale documentation referencing the dead code and quarantine them as well.
6. Run `npm run type-check` and `npm run test`.
7. If tests fail, restore the quarantined code and abort the workflow.
