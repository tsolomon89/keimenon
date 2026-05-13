---
name: graph-canvas-development
description: Coordinates React state synchronization with the Three.js renderer schema
---

# graph-canvas-development

Coordinates React state with the Three.js renderer schema. Trigger via `/graph-canvas-development`.

## Participants

- **Deciders:** `graph-rendering-engineer` (Persona), `web-app-engineer` (Persona)
- **Capabilities:** `code-review-enforcer` (Skill)

## Steps

1. **State Audit:** Ensure any React state changes correctly propagate to the InstancedMesh without causing React-Three-Fiber re-renders on the main thread.
2. **LOD Verification:** Confirm L0 to L3 projection rules are maintained for large graphs.
3. **UI Integration:** Ensure toolbar interactions (2D/3D/ND) map correctly to camera properties.
