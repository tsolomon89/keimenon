---
name: project-orientation
description: 'Gets a fresh coding agent up to speed on the project architecture.'
---

# project-orientation

## Purpose

Gets a fresh coding agent up to speed on the project architecture.

## Operational Details

- **Owning Persona**: repo-cartographer
- **When to Use**: Initial repository clone or agent boot
- **When NOT to Use**: Subsequent active development
- **Required Inputs**: None
- **Commands / Checks**: `npm run doctor:runtime`
- **Evidence Output**: Summary of system health and constraints
- **Stop Conditions / Acceptance Criteria**: Agent correctly enumerates the local-first constraints.

## Step-by-Step Procedure

1. Read `AGENTS.md`.
2. Produce a repository map covering exactly the following domains:
   - `AGENTS.md`
   - `README.md`
   - `apps/api`
   - `apps/web`
   - `apps/desktop`
   - `packages/*`
   - `scripts`
   - `tests`
   - `.agent`
   - `.mcp`
   - `.claude`
   - `docs`
   - `agent_context`
3. Run runtime diagnostics to verify Node version and workspace health.
