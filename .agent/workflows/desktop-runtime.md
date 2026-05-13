---
name: desktop-runtime
description: 'Electron/local runtime work checking ABI, packaged dist sync, and local paths.'
---

# desktop-runtime

## Purpose

Electron/local runtime work checking ABI, packaged dist sync, and local paths.

## Operational Details

- **Owning Persona**: desktop-runtime-engineer
- **When to Use**: Updating IPC channels or native Node dependencies
- **When NOT to Use**: Web-only cosmetic changes
- **Required Inputs**: Electron `apps/desktop` paths
- **Commands / Checks**: `npm run desktop:web-dist:verify, npm run desktop:rebuild-native`
- **Evidence Output**: Electron packaged binary success
- **Stop Conditions / Acceptance Criteria**: Native build passes and IPC messages resolve.

## Step-by-Step Procedure

1. Audit main/preload IPC channels.
2. Ensure web-dist is synchronized.
3. Rebuild native modules if dependencies changed.
