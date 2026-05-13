---
name: golden-path-verification
description: Coordinates E2E tests, builds, and runtime doctors for full-stack release gates
---

# golden-path-verification

This workflow runs the full-stack release verifications. Trigger this workflow via `/golden-path-verification`.

## Participants

- **Decider:** `pipeline-verifier` (Persona)
- **Capabilities:** `autonomous-test-runner` (Skill), `e2e-test-generator` (Skill)

## Steps

1. **Lint & Types:** Run `npm run lint` and `npm run typecheck` across all workspace packages.
2. **Unit Tests:** Trigger the root test suite.
3. **E2E Smoke Tests:** Use `autonomous-test-runner` to execute the Playwright golden path suite.
4. **Review Results:** The pipeline-verifier ensures no authoritative gates were bypassed.
