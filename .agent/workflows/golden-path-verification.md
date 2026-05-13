---
name: golden-path-verification
description: 'Coordinates E2E tests, builds, and runtime doctors for full-stack release gates'
---

# golden-path-verification

## Purpose

Coordinates E2E tests, builds, and runtime doctors for full-stack release gates

## Operational Details

- **Owning Persona**: pipeline-verifier
- **Supporting Personas**: e2e-test-generator
- **Skills Used**: autonomous-test-runner
- **When to Use**: Pre-release or major PR
- **When NOT to Use**: When out of scope of Coordinates E2E tests, builds, and runtime doctors for full-stack release gates.
- **Required Inputs**: None
- **Commands / Checks**: npm run test
- **Evidence Output**: Test results
- **Stop Conditions / Acceptance Criteria**: None

This workflow runs the full-stack release verifications. Trigger this workflow via `/golden-path-verification`.

## Steps

1. **Lint & Types:** Run `npm run lint` and `npm run type-check` across all workspace packages.
2. **Unit Tests:** Trigger the root test suite.
3. **E2E Smoke Tests:** Use `autonomous-test-runner` to execute the Playwright golden path suite.
4. **Review Results:** The pipeline-verifier ensures no authoritative gates were bypassed.
