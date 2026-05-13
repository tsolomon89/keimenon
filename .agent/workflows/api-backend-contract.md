---
name: api-backend-contract
description: 'API/database/service-layer work while checking auth and account_id scope.'
---

# api-backend-contract

## Purpose

API/database/service-layer work while checking auth and account_id scope.

## Operational Details

- **Owning Persona**: api-contract-engineer
- **When to Use**: Adding or mutating Express/Fastify routes
- **When NOT to Use**: Frontend-only changes
- **Required Inputs**: Route specifications
- **Commands / Checks**: `npm run test:auth`
- **Evidence Output**: API endpoint logic passing auth guards
- **Stop Conditions / Acceptance Criteria**: 0 bypassed account_id constraints in queries.

## Step-by-Step Procedure

1. Ensure all queries filter by `account_id`.
2. Update route controllers in `apps/api`.
3. Run authentication test suite.
