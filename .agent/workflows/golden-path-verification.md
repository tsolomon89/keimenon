---
name: golden-path-verification
description: 'Coordinates E2E tests, builds, and runtime doctors for full-stack release gates'
---

# golden-path-verification

## Purpose

Coordinates E2E tests, builds, and runtime doctors for full-stack release gates

## Operational Details

- **Owning Persona**: pipeline-verifier
- **When to Use**: Final validation before pushing PR or release
- **When NOT to Use**: In-progress feature development
- **Required Inputs**: Source code branch
- **Commands / Checks**: `npm run doctor:runtime, npm run lint, npm run type-check, npm run test, npm run build, npm run test:auth, npm run migrate:to-local:dry-run, npm run sqlite:check, npm run e2e:smoke`
- **Evidence Output**: Complete CI/CD pass report
- **Stop Conditions / Acceptance Criteria**: Zero failures across all 9 quality gate scripts.

## Step-by-Step Procedure

1. Audit system health using doctor scripts.
2. Ensure all types and linters pass.
3. Run integration tests for auth and sqlite.
4. Run full UI/E2E smoke test suite.
