---
name: test-stabilization
description: 'Fix broken/flaky tests and improve test structure while preserving assertion strength.'
---

# test-stabilization

## Purpose

Fix broken/flaky tests and improve test structure while preserving assertion strength.

## Operational Details

- **Owning Persona**: test-strategy-engineer
- **When to Use**: Tests are flaking or failing in CI
- **When NOT to Use**: Writing brand new feature tests
- **Required Inputs**: The failing test log
- **Commands / Checks**: `npm run e2e:smoke`
- **Evidence Output**: Consistent test passes
- **Stop Conditions / Acceptance Criteria**: Test passes consecutively without flaking.

## Step-by-Step Procedure

1. Identify the flaky assertion.
2. Refactor the locator or await mechanism.
3. Run the specific E2E smoke suite to validate.
