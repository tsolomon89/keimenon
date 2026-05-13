---
name: architecture-contract-guard
description: 'Guards the canonical architecture and AGENTS.md rules against drift, including API and import rails.'
---

# architecture-contract-guard

## Purpose

Guards the canonical architecture defined in `AGENTS.md` to prevent implementation drift, undocumented legacy workarounds, and zombie APIs.

## Operational Details

- **Owning Persona**: architect
- **When to Use**: During legacy cleanup, repo hygiene, or when validating new architectural decisions against `AGENTS.md`.
- **When NOT to Use**: Routine bug fixes that do not affect the data model or API surface.
- **Required Inputs**: Architecture changes, cleanup target files.
- **Commands / Checks**: `npm run test` (specifically regression and contract tests).
- **Evidence Output**: A validated architecture matching `AGENTS.md` without deprecated shims.
- **Stop Conditions / Acceptance Criteria**: Code aligns perfectly with `AGENTS.md`. No deprecated shims remain active.

## Step-by-Step Procedure

1. Cross-reference proposed changes with `AGENTS.md`.
2. Ensure chunked upload rails (`/api/v1/uploads/initiate`, `/chunks`) are strictly used as the canonical import ingestion method.
3. Validate that the deprecated multipart import API (`POST /api/v1/jobs/import`) is fully retired and returns `404 Not Found`. Do not allow `410 Gone` shims to linger indefinitely as they expand the zombie surface area.
4. Ensure the Principal-based Node hierarchy is strictly enforced (though legacy UserNode and AgentNode may be retained for compatibility).
5. Verify test suites (`jobs-cutover-contract.test.ts` etc.) reflect any retired APIs as `404 Not Found`.
