# EPIC: Graph Renderer LOD and Dense Graph Performance

The goal of this epic is to improve `SharedThreeGraphRenderer` so dense graph datasets (10k-50k+ nodes/edges) remain usable without blank canvases, excessive frame drops, unreadable labels, or loss of canonical hierarchy, focus, and pinned-node behavior.

## 1. Current Renderer Architecture

The frontend renderer consumes `GraphReadModelResponse` which is mapped by `keimenonStore` and laid out via `computeDeterministicPositions`.
The core rendering is handled by `SharedThreeGraphRenderer`, which relies on:

- `SceneRoot` inside React Three Fiber (`<Canvas>`) to manage cameras, controls, and pointer interactions.
- `NodeSpheres` / `InstancedNodeSpheres`: An optimized primitive that batches nodes by radius (≤8 draw calls total) using `THREE.InstancedMesh`.
- `EdgeSegments`: A single `THREE.LineSegments` draw call rendering a raw `Float32Array` of positions.
- **Interactions**: Pointer events inside the Canvas drive marquee selection, dragging, and an explicit hover-picking loop for edges (`emitEdgeHoverPick`) in `SceneRoot`.

## 2. Current LOD Flow

The `buildLodPlan` algorithm in `apps/web/src/lib/graph-lod.ts` filters nodes/edges dynamically based on camera distance:

1. `resolveLodLevel` translates the zoom distance to a level (L0 to L3).
2. The dataset is filtered through `kindAllowedAtLevel`, maintaining `AccountNode`, `Principal`, `Source`, `Group`, etc. at higher levels (L0/L1), and introducing finer details (e.g. `Phrase`, `Packet`) at L2/L3.
3. Nodes are strictly budgeted based on a base limit modified by an `optimizeLevel`.
4. Hierarchy Anchors, focused nodes, and pinned nodes bypass these cuts where possible.
5. Edges are filtered strictly to those connecting preserved nodes, and sorted by strength to fit within the `edgeBudget`.

## 3. Known Bottlenecks

- **Edge Hover Geometry Overload**: In `emitEdgeHoverPick`, `worldToScreen` (which calls `THREE.Vector3.project(camera)`) is executed dynamically for every endpoint of every rendered edge, every 24ms during pointer movement. For 10,000 edges, this forces 20,000 matrix multiplications per frame.
- **Unbounded Detail Visibility**: Dense datasets might pass the `nodeBudget` cap but still overwhelm the screen. The renderer lacks a hard visual limit for line overdraw at dense scales.
- **Node Culling vs Survival**: While the LOD system tries to maintain priority nodes, the fallback anchors are forced to the top but might squeeze out contextual edges if the density is extremely high without strict LOD capping.

## 4. Non-Goals

- Do NOT rewrite `SharedThreeGraphRenderer`.
- Do NOT replace Three.js.
- Do NOT start a generic UI redesign.
- Do NOT add a heavy label system in this sprint (labels are currently not rendered directly by the 3D primitives; they will remain skipped).
- Do NOT weaken account isolation or alter the backend data models.
- Do NOT replace `InstancedMesh` with something else (it is already correctly implemented).

## 5. Measurable Success Criteria

- **Hover Optimization**: Edge hovering does not cause noticeable frame drops on graphs with 10k+ edges.
- **Hierarchy Fidelity**: `AccountNode`, `Principal`, `Source`, and `Group` nodes remain visible even when fully zoomed out on dense graphs.
- **Pinned/Focus Survival**: Pinned nodes and focused neighborhoods are strictly protected from LOD culling at all zoom levels.

## 6. Implementation Phases

### Phase 1: Baseline and Diagnostics

- Ensure `buildLodPlan` is effectively capping extremely dense datasets (10k/50k node tiers). Use the `benchmark-harness` to track frame times.

### Phase 2: LOD Policy Hardening

- Reinforce `buildLodPlan` to guarantee `HIERARCHY_ANCHOR_KINDS` and pinned nodes are always included within limits.
- The existing code currently pushes `pinnedNodeIds` and `focusNodeId` to the `mustKeepNodeIds` set, which correctly bypasses standard mass checks. Verify this logic does not crash if the hard node budget is exceeded.

### Phase 3: Labels and Visual Overload

- **Skipped by Design:** Text labels are not currently rendered by the 3D graph primitive (no `Html` or `Text` nodes were found). Adding a massive label system is out of scope for this sprint.

### Phase 4: Edge Performance

- Modify `emitEdgeHoverPick` in `SharedThreeGraphRenderer` to memoize the `ScreenEdgeGeometry[]` array.
- Invalidate the memoized array only when `camera` updates or the rendered edge collection changes, preventing repeated `worldToScreen` matrix multiplications during rapid mouse movement.

### Phase 5: Primitive Rendering Optimization

- Verify `InstancedNodeSpheres` behaves correctly without per-frame allocations. (This is mostly complete as it already implements an efficient ≤8 draw call system).

### Phase 6: Tests

- Write focused unit tests for `buildLodPlan` inside the test suite to prove structural anchors and pinned nodes survive dense conditions.

## 7. Files Touched

- `apps/web/src/components/keimenon/SharedThreeGraphRenderer.tsx`
- `apps/web/src/lib/graph-lod.ts`
- Tests related to `graph-lod.ts`

## 8. Remaining Risks

- Memoizing screen-edge geometry for the camera might require careful cache invalidation hook dependencies so that dragging the camera immediately invalidates the cache, otherwise the hover targets will drift.
