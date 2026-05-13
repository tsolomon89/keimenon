---
name: dependency-runtime-maintenance
description: 'Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.'
---

# dependency-runtime-maintenance

## Purpose

Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.

## Operational Details

- **Owning Persona**: ops-hygiene-engineer
- **Supporting Personas**: desktop-runtime-engineer
- **Skills Used**: code-execution-orchestrator
- **When to Use**: Dependency updates
- **When NOT to Use**: When out of scope of Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness..
- **Required Inputs**: npm outdated
- **Commands / Checks**: npm install
- **Evidence Output**: Build success
- **Stop Conditions / Acceptance Criteria**: All tests pass

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
