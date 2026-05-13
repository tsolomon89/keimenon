---
name: api-backend-contract
description: 'API/database/service-layer work while checking auth and account_id scope.'
---

# api-backend-contract

## Purpose

API/database/service-layer work while checking auth and account_id scope.

## Operational Details

- **Owning Persona**: api-contract-engineer
- **Supporting Personas**: security-auth-reviewer, account-isolation-guardian
- **Skills Used**: mcp-integration-expert, security-auditor
- **When to Use**: Backend API changes
- **When NOT to Use**: When out of scope of API/database/service-layer work while checking auth and account_id scope..
- **Required Inputs**: API spec
- **Commands / Checks**: npm run test
- **Evidence Output**: API tests passing
- **Stop Conditions / Acceptance Criteria**: Security review

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
