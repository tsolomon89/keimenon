---
name: dead-code-cleanup
description: 'Safe, reversible code deletion with required multi-evidence checking and post-deletion test runs.'
---

# dead-code-cleanup

## Purpose

Safe, reversible code deletion with required multi-evidence checking and post-deletion test runs.

## Operational Details

- **Owning Persona**: ops-hygiene-engineer
- **Supporting Personas**: repo-cartographer
- **Skills Used**: code-review-enforcer
- **When to Use**: Cleanup request
- **When NOT to Use**: When out of scope of Safe, reversible code deletion with required multi-evidence checking and post-deletion test runs..
- **Required Inputs**: Target paths
- **Commands / Checks**: npm run test
- **Evidence Output**: Reversible evidence, tests passed
- **Stop Conditions / Acceptance Criteria**: Requires 2 forms of evidence

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
