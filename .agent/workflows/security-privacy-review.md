---
name: security-privacy-review
description: 'Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.'
---

# security-privacy-review

## Purpose

Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.

## Operational Details

- **Owning Persona**: security-auth-reviewer
- **Supporting Personas**: account-isolation-guardian
- **Skills Used**: security-auditor
- **When to Use**: Security audit request
- **When NOT to Use**: When out of scope of Review auth, account isolation, local data, MCP exposure, and data exfiltration risk..
- **Required Inputs**: PR or codebase
- **Commands / Checks**: npm run lint
- **Evidence Output**: Audit log
- **Stop Conditions / Acceptance Criteria**: None

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
