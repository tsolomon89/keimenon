---
name: graph-canvas-development
description: 'Coordinates React state synchronization with the Three.js renderer schema'
---

# graph-canvas-development

## Purpose

Coordinates React state synchronization with the Three.js renderer schema

## Operational Details

- **Owning Persona**: graph-rendering-engineer
- **When to Use**: Adjusting the 3D canvas, zoom, or instanced meshes
- **When NOT to Use**: Backend or database-only logic
- **Required Inputs**: React components under `apps/web/src`
- **Commands / Checks**: `npm run lint, npm run type-check`
- **Evidence Output**: Canvas rendering visual checks
- **Stop Conditions / Acceptance Criteria**: No React dependency warnings and 0 type errors in canvas code.

## Step-by-Step Procedure

1. Audit Three.js instance arrays.
2. Ensure WebGL limits are respected.
3. Validate React hook dependency arrays.
