---
name: desktop-runtime
description: 'Electron/local runtime work checking ABI, packaged dist sync, and local paths.'
---

# desktop-runtime

## Purpose

Electron/local runtime work checking ABI, packaged dist sync, and local paths.

## Operational Details

- **Owning Persona**: desktop-runtime-engineer
- **Supporting Personas**: architecture-contract-guardian
- **Skills Used**: mcp-integration-expert
- **When to Use**: Desktop app changes
- **When NOT to Use**: When out of scope of Electron/local runtime work checking ABI, packaged dist sync, and local paths..
- **Required Inputs**: Spec
- **Commands / Checks**: npm run build:desktop
- **Evidence Output**: App launch success
- **Stop Conditions / Acceptance Criteria**: Build success

## Required Steps

1. Review required inputs.
2. Formulate plan based on purpose.
3. Execute necessary commands.
4. Verify evidence against acceptance criteria.
