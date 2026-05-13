---
name: full-stack-feature-builder
description: 'Implements a feature across the full stack with tests and architectural review.'
---

# full-stack-feature-builder

## Purpose

Safely introduces new features or refactors existing capabilities across the Keimenon stack (database, API, Next.js, Electron) while maintaining local-first contracts.

## Operational Details

- **Owning Persona**: web-app-engineer
- **Supporting Personas**: api-contract-engineer, architecture-contract-guardian
- **Skills Used**: code-review-enforcer, e2e-test-generator
- **When to Use**: When a task spans multiple `apps/` or `packages/` requiring coordinated logic changes.
- **When NOT to Use**: For isolated bug fixes, dependency updates, or documentation.
- **Required Inputs**: A detailed feature specification or approved `implementation_plan.md`.
- **Commands / Checks**: `npm run type-check && npm run test`
- **Evidence Output**: A unified `walkthrough.md` documenting architecture changes, and passing tests.
- **Stop Conditions / Acceptance Criteria**: All related `e2e` tests pass, the type-checker returns 0 errors, and no local-first boundaries are violated.

## Step-by-Step Procedure

1. Define the schema changes within `packages/db` and execute the `sqlite-schema-migration` workflow if needed.
2. Update the API contracts in `apps/api`.
3. Modify the shared types in `packages/types`.
4. Implement the front-end logic in `apps/web`.
5. Check for any required Electron IPC bridging in `apps/desktop`.
6. Write integration tests and E2E tests for the new functionality.
7. Run `npm run type-check` and `npm run test` globally.
8. Run `npm run e2e:smoke` to ensure no critical path is broken.
