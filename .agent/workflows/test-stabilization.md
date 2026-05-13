---
name: test-stabilization
description: 'Fix broken/flaky tests and improve test structure while preserving assertion strength.'
---

# test-stabilization

## Purpose

Fix broken/flaky tests and improve test structure while preserving assertion strength.

## Operational Details

- **Owning Persona**: test-strategy-engineer
- **Supporting Personas**: pipeline-verifier
- **Skills Used**: autonomous-test-healer, autonomous-test-runner
- **When to Use**: Flaky test reports
- **When NOT to Use**: When out of scope of Fix broken/flaky tests and improve test structure while preserving assertion strength..
- **Required Inputs**: Test logs
- **Commands / Checks**: npx playwright test
- **Evidence Output**: Consistent test passes
- **Stop Conditions / Acceptance Criteria**: Coverage preserved

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
