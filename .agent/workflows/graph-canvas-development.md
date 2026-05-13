---
name: graph-canvas-development
description: 'Coordinates React state synchronization with the Three.js renderer schema'
---

# graph-canvas-development

## Purpose

Coordinates React state synchronization with the Three.js renderer schema

## Operational Details

- **Owning Persona**: graph-rendering-engineer
- **Supporting Personas**: web-app-engineer
- **Skills Used**: e2e-test-generator
- **When to Use**: UI changes
- **When NOT to Use**: When out of scope of Coordinates React state synchronization with the Three.js renderer schema.
- **Required Inputs**: Feature request
- **Commands / Checks**: npm run dev
- **Evidence Output**: Visual regression
- **Stop Conditions / Acceptance Criteria**: Lint

Coordinates React state with the Three.js renderer schema. Trigger via `/graph-canvas-development`.

## Steps

1. **State Audit:** Ensure any React state changes correctly propagate to the InstancedMesh without causing React-Three-Fiber re-renders on the main thread.
2. **LOD Verification:** Confirm L0 to L3 projection rules are maintained for large graphs.
3. **UI Integration:** Ensure toolbar interactions (2D/3D/ND) map correctly to camera properties.
