---
name: dependency-runtime-maintenance
description: 'Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.'
---

# dependency-runtime-maintenance

## Purpose

Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.

## Operational Details

- **Owning Persona**: ops-hygiene-engineer
- **When to Use**: Updating `package.json` dependencies
- **When NOT to Use**: Writing business logic
- **Required Inputs**: `npm outdated` output
- **Commands / Checks**: `npm install, npm run doctor:runtime`
- **Evidence Output**: Updated lockfile and success log
- **Stop Conditions / Acceptance Criteria**: `doctor:runtime` reports clean environment.

## Step-by-Step Procedure

1. Update `package.json` versions.
2. Run install.
3. Verify runtime health.
