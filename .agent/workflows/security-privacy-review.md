---
name: security-privacy-review
description: 'Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.'
---

# security-privacy-review

## Purpose

Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.

## Operational Details

- **Owning Persona**: security-auth-reviewer
- **When to Use**: A Mandatory Security Review is triggered by Orchestrator
- **When NOT to Use**: Harmless cosmetic updates
- **Required Inputs**: Code diffs
- **Commands / Checks**: `npm run ci:hygiene:check`
- **Evidence Output**: Security pass/fail verdict
- **Stop Conditions / Acceptance Criteria**: No data exfiltration vectors identified.

## Step-by-Step Procedure

1. Audit PR for any external HTTP requests bypassing local-first rules.
2. Verify `account_id` is passed securely.
3. Check repository hygiene scripts.
