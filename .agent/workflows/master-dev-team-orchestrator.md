---
name: master-dev-team-orchestrator
description: 'Coordinates all other workflows and routes to specialized workflows based on task classification.'
---

# master-dev-team-orchestrator

## Purpose

Acts as the supreme router and orchestrator for all Agent OS activities. It classifies incoming tasks, enforces security reviews, and delegates execution to specialized workflows.

## Operational Details

- **Owning Persona**: repo-cartographer
- **Supporting Personas**: architecture-contract-guardian, security-auth-reviewer
- **Skills Used**: code-execution-orchestrator
- **When to Use**: When a new user request is received that has not yet been routed.
- **When NOT to Use**: For executing actual code changes directly.
- **Required Inputs**: The raw user request.
- **Commands / Checks**: `manual/none`
- **Evidence Output**: A delegated workflow invocation log.
- **Stop Conditions / Acceptance Criteria**: The task is successfully handed off to a specific, appropriate workflow and explicitly acknowledged.

## Task Classification & Routing

Analyze the user request and map it to exactly one of the following buckets. Delegate to the corresponding workflow:

1. **Orientation**: Request for architecture or setup understanding -> `project-orientation.md`
2. **Feature Build**: Request to build or modify cross-stack functionality -> `full-stack-feature-builder.md`
3. **Dead-Code Cleanup**: Request to remove unused code safely -> `dead-code-cleanup.md`
4. **Test Stabilization**: Request to fix flaky or failing tests -> `test-stabilization.md`
5. **Backend/API**: Request to modify server logic or database endpoints -> `api-backend-contract.md`
6. **Web UI**: Request to modify React/Next.js frontend -> `web-ui-development.md`
7. **Desktop Runtime**: Request to modify Electron packaging or IPC -> `desktop-runtime.md`
8. **Graph/Data Model**: Request to modify similarity edges, nodes, or database schema -> `graph-data-model.md`
9. **Security/Privacy**: Request to audit auth, local-first contracts, or data handling -> `security-privacy-review.md`
10. **Docs Sync**: Request to update documentation to match code -> `documentation-sync.md`
11. **Dependency/Runtime**: Request to update npm packages or Node versions -> `dependency-runtime-maintenance.md`
12. **Release Verification**: Request to run the full quality gate suite -> `golden-path-verification.md`

## Mandatory Security Review

Any task touching the following domains **MUST** trigger an explicit `security-privacy-review.md` pass before proceeding with the primary workflow:

- Authentication or Authorization rules
- Storage mechanisms (SQLite, local files)
- `account_id` isolation logic
- MCP exposures or tool configurations
- Graph schema representing private user data
- Raw source imports
- Local file system access

## Delegation Procedure

1. Identify the task bucket.
2. Determine if the Mandatory Security Review applies.
3. Read the target workflow file from `.agent/workflows/`.
4. Assume the persona required by the target workflow.
5. Execute the target workflow.
