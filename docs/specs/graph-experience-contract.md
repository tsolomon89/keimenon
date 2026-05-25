# Graph Experience Contract

Status: Active (derived from `AGENTS.md` §7 Canvas Fidelity Contract)
Last updated: 2026-05-11

This document defines the canonical graph-experience contract for Keimenon.
It distinguishes **structural implementation** (code that exists and compiles) from
**product-complete graph UX** (a user can trust, navigate, and reason about their knowledge graph).

On conflict with any other derived artifact, `AGENTS.md` wins.

---

## 1. Spatial Grammar by Node Kind

Every node kind occupies a deterministic position in graph space. Positions are
derived from the node's identity (ID), kind, and hierarchy role — never from
`Math.random()`.

### 1.1 Radial Shell Model

The canonical layout uses concentric radial shells centered on the Account origin:

| Shell    | Radius | Node Kinds                                                                                               | Visual Role                                           |
| -------- | ------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0 (core) | 0      | `AccountNode`                                                                                            | Fixed origin anchor for the entire account graph      |
| 1        | 80     | `Principal` (human / agent / contact), `UserNode`, `AgentNode`                                           | Identity ring — actors who own and create content     |
| 2        | 180    | `Group`, `Folder`                                                                                        | Organizational ring — containers and collections      |
| 3        | 300    | `Source`, `SourceDoc`, `ChatThread`, `ConversationThread`                                                | Content ring — imported and created content           |
| 4        | 420    | `ObjectiveClaim`, `VerifiedSource`, `VerifiedClaim`, `Evidence`                                          | Objective ring — machine-verified claims and evidence |
| 5        | 550+   | `Topic`, `Phrase`, `Lexeme`, `Constellation`, `CodeBlock`, `SourceSpan`, `Packet`, `Board`, `UnifiedDoc` | Detail ring — spine and derived content               |

### 1.2 Angular Placement

Within each shell, angular position is computed from a deterministic hash of the
node's ID. This ensures:

- Same node always occupies the same angle
- Nearby IDs are not necessarily nearby in angle (hash distribution)
- No collisions for reasonable node counts per shell

### 1.3 Hierarchy Attachment

When hierarchy edges exist (OWNED_BY, CREATED_BY, IN_GROUP, CONTAINS, HAS_MESSAGE),
child nodes are positioned relative to their parent:

- A Source in a Group orbits near that Group's angular position
- A Principal under an AccountNode orbits near the Account's origin
- Orphan nodes (no hierarchy edges) use the shell default

### 1.4 Explicit Position Preservation

If a node has user-dragged or API-supplied finite `x`/`y` coordinates, those
positions MUST be preserved. The deterministic layout only applies to nodes
without explicit positions.

---

## 2. Hierarchy Behavior

### 2.1 Required Hierarchy

Per AGENTS.md §3.1, the visible hierarchy is:

```
Account → Principal(human | agent | contact) → Sources / Groups / Objectives
```

### 2.2 Materialization Invariant

After import, the graph MUST contain at minimum:

- At least one `AccountNode` (visible at graph center)
- At least one `Principal` (visible in shell 1)
- At least one `Source` (visible in shell 3)
- At least one `Group` (visible in shell 2)
- Hierarchy edges linking Account → Principal and Principal → Source/Group

If this invariant is not satisfied, the import MUST fail with
`GRAPH_MATERIALIZATION_FAILED`.

### 2.3 Hierarchy Visibility

`AccountNode` and `Principal` nodes MUST survive all LOD levels (L0 through L3).
They are never culled by LOD filtering.

---

## 3. LOD Visual Meaning

### 3.1 Level Definitions

| Level  | Zoom Range      | What Is Visible                                                                       | Visual Purpose                                      |
| ------ | --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **L0** | z < 0.22        | AccountNode, Principal, Group, Folder, Constellation, ObjectiveClaim, UnifiedDoc      | Galactic overview — supernodes and major clusters   |
| **L1** | 0.22 ≤ z < 0.55 | L0 + Source, SourceDoc, ChatThread, ConversationThread, VerifiedSource, VerifiedClaim | Source-level navigation — individual content items  |
| **L2** | 0.55 ≤ z < 1.2  | L1 + Topic, Phrase, Packet, CodeBlock, Lexeme, SourceSpan                             | Detail exploration — topic and phrase nodes visible |
| **L3** | z ≥ 1.2         | All node kinds                                                                        | Atomic view — every node visible within budget      |

### 3.2 L0 Supernode Aggregation (Implemented)

> **Design Note**: The L0 implementation aggregates structural node kinds into
> visual supernodes representing clusters of underlying content.
>
> 1. Cluster detection (by group membership) is implemented in `cluster-supernodes.ts`.
> 2. Supernode rendering uses a single visual element per cluster with a count badge.
> 3. Drill-down on click expands the supernode to child nodes via focus operations.

### 3.3 Performance Budgets

| Level | Max Visible Nodes | Max Visible Edges |
| ----- | ----------------- | ----------------- |
| L0    | 240               | 1,600             |
| L1    | 3,200             | 14,000            |
| L2    | 14,000            | 60,000            |
| L3    | 60,000            | 180,000           |

For datasets > 10k nodes, budgets scale by 1.15× (nodes) / 1.2× (edges).
For datasets > 50k nodes, budgets scale by 1.35× (nodes) / 1.4× (edges).

---

## 4. Lens Behavior

### 4.1 2D Lens

- Planar graph navigation (XY plane, Z = 0)
- Camera rotation locked to top-down view (polar angle = π/2)
- Node positions use `(x, -y, 0)` from deterministic layout
- Drag uses XY plane semantics

### 4.2 3D Lens

- Depth-enabled graph navigation
- Free camera rotation (polar angle 0.2 to π−0.2)
- Node positions use `(x, -y, z)` where Z is derived from node vector component
- Drag uses projected view-plane semantics

### 4.3 ND Lens

- Deterministic projected N-dimensional lens with slice controls
- Canonical defaults (per AGENTS.md §8.4):
  - `dims = 8`
  - `axes = [0, 1, 2]`
  - `sliceDim = 3`
  - `sliceCenter = 0`
  - `sliceWidth = 0.35`
- **ND Node Vector Derivation**: Semantic + Structural Hybrid. Content nodes derive 8D vectors from high-dimensional text embeddings (e.g. via Gemma/embeddings endpoint), while structural nodes fallback to graph-structural embeddings (like Node2Vec or Laplacians).
- Positions are `projectNodeVector(vector, config)` — projected to chosen axes
- **Slicing Treatment (Holographic Ghosting)**: Nodes outside the slice hyperplane are rendered as semi-transparent and slightly smaller, creating a spatial 'fog' or depth effect, rather than being strictly clipped/hidden. Focused/pinned nodes remain fully bright.
- Drag uses projected view-plane semantics

---

## 5. Focus Mode and Pinned Sub-Galaxy Behavior

### 5.1 Focus Mode

When a single node is selected and focus mode is enabled:

- Only the 2-hop neighborhood of the focused node is visible
- The focused node is always visible regardless of LOD
- Hierarchy ancestors of the focused node are always visible
- Camera centers on the focused node

### 5.2 Pinned Nodes

Pinned nodes (toggled via Alt+click):

- MUST survive all LOD culling across all lenses (2D/3D/ND)
- MUST survive lens switching
- MUST survive focus mode (pinned nodes are always visible even outside
  the focus neighborhood)
- Edges connecting pinned nodes always survive

### 5.3 Sub-Galaxy

A pinned set of nodes forms a "sub-galaxy" — a user-curated subset of the
full graph that persists across navigation. The sub-galaxy is ephemeral
(session-scoped) and not persisted to the server.

---

## 6. Edge Survival Rules

Edges are filtered by:

1. **Endpoint visibility**: Both source and target nodes must be visible
2. **Hierarchy priority**: OWNED_BY, CREATED_BY, IN_GROUP, FOLDS_INTO_FOLDER,
   CONTAINS, HAS_MESSAGE edges always survive if both endpoints are visible
3. **Strength threshold**: Non-hierarchy edges must meet the minimum strength
   for the current LOD level:
   - L0: ≥ 0.7
   - L1: ≥ 0.5
   - L2: ≥ 0.25
   - L3: ≥ 0 (all edges)
4. **Budget cap**: Edges exceeding the level budget are sorted by strength
   and truncated
5. **Focus/pin immunity**: Edges touching the focus node or pinned nodes
   always survive
6. **Survival floor**: If LOD produces visible nodes but zero edges, at least
   24 hierarchy-priority edges are recovered

---

## 7. Large-Scale Performance Budgets

### 7.1 LOD Planning

| Metric                        | 10k dataset | 50k dataset |
| ----------------------------- | ----------- | ----------- |
| Average `buildLodPlan()` time | ≤ 2,200 ms  | ≤ 4,400 ms  |
| P95 `buildLodPlan()` time     | ≤ 3,600 ms  | ≤ 7,000 ms  |
| Gate failures                 | 0           | 0           |

### 7.2 Rendering (Budgets Validated)

| Metric              | Target       |
| ------------------- | ------------ |
| Frame time (60fps)  | ≤ 16.6 ms    |
| Draw calls at L0    | ≤ 100        |
| Draw calls at L1    | ≤ 500        |
| Hover latency       | ≤ 50 ms      |
| Lens switch latency | ≤ 200 ms     |
| Memory (10k nodes)  | ≤ 200 MB GPU |

> **Design Note**: Rendering uses `InstancedMesh` components (`InstancedNodeSpheres`)
> to batch node rendering into a single draw call per node-kind/radius group, dramatically
> reducing draw call count and enabling the application to meet these targets at scale.

---

## 8. InstancedMesh Architecture (Completed)

> **Architecture Note**: The `InstancedNodeSpheres` component in `render-primitives.tsx`
> replaces the legacy `NodeSpheres` component. It uses `THREE.InstancedMesh` to batch
> all nodes of similar geometry into a single draw call.
>
> ### Implementation Details
>
> 1. Replaced individual `<mesh>` nodes with `InstancedNodeSpheres` using `THREE.InstancedMesh`.
> 2. Per-instance color is applied via `InstancedBufferAttribute` and emissive boosts are baked into the base color.
> 3. Per-instance transform matrices provide position and scaling.
> 4. Interaction uses instanced raycasting with instance ID resolution to node IDs.
> 5. Total draw calls for nodes are $\le 8$ regardless of total node count.
> 6. **Selection & Hover Highlighting**: Selection/hover modifies the instance matrix to scale the node up by 1.25x and doubles its instance color brightness (emissive boost). To minimize visual noise in dense layouts, connected edges are not animated with particle flows.
>
> ### Impact
>
> - Draw calls: Reduced from $N$ to $\le 8$.
> - Frame time: Reduced to $O(1)$ scaling relative to geometry count.
> - Interaction overhead: Minimal, with accurate hit detection.

---

## 9. Product-Complete Graph UX Definition

The graph experience is product-complete when ALL of the following are true:

1. **Spatial stability**: Reloading the same graph produces the same visual layout.
   Nodes do not jump to random positions between sessions.

2. **Hierarchy legibility**: A user can visually distinguish AccountNode (center),
   Principal (inner ring), Group/Source (middle rings), and detail nodes (outer
   ring) without reading labels.

3. **LOD coherence**: Zooming out progressively hides detail while preserving
   structural anchors. Zooming in reveals detail within budget.

4. **Focus mode**: Selecting a node and enabling focus mode shows only the
   relevant neighborhood with clear visual boundary.

5. **Pinned sub-galaxy**: Alt-clicking nodes creates a persistent subset that
   survives all navigation, filtering, and lens switching.

6. **Edge readability**: Hierarchy edges are always visible when both endpoints
   are visible. Similarity edges appear proportional to strength and zoom.

7. **Interaction consistency**: Click, double-click, marquee, drag, and
   modifier behaviors are identical across 2D/3D/ND lenses.

8. **Performance**: Frame rate stays above 30fps for up to 3,200 visible
   nodes (L1 budget). LOD planning completes within budget for up to 50k
   total nodes.

9. **Provenance**: Every node's position can be traced back to its identity
   and hierarchy role — no randomness in the layout pipeline.

10. **Non-blank canvas**: After import, the graph viewport is never blank.
    The materialization invariant (§2.2) guarantees at least the hierarchy
    skeleton is visible.
