# EPIC: Graph Read Model, Canvas Fidelity, and Large-Graph Usability

The goal of this epic is to turn the current hydrated graph read model into a reliable, explicit frontend consumption path that supports dense imported graphs without blank canvases, random layout, unusable performance, or loss of canonical hierarchy.

## Pre-Requisites

- Read model `GET /api/v1/graph/read-model` exists and hydrates properties from normalized payload tables.
- UI `loadGraphData` calls `getGraphReadModel` via API client.

## Architectural Constraints

### 1. Two-Stage Payload Hydration

The `/api/v1/graph/read-model` route must use a two-stage hydration to avoid unbounded `LEFT JOIN`s on massive payload tables (e.g., 100k+ `phrases`):

1. **Candidate Selection**: Select candidate node IDs under the requested budget.
   _Limitation Note_: Currently, candidate selection fetches metadata (ID, kind, created_at) for all account nodes and performs in-memory deterministic sorting/slicing. This is not a true SQL-level `ORDER BY ... LIMIT` budget selection. While this eliminates heavy payload-table joins and significantly improves performance, it still loads one metadata row per node into memory and may require further SQL optimization (e.g., indexed priority sorts) for massive accounts.
2. **Hydration**: Hydrate payload tables only for those selected node IDs.

### 2. Structural Anchor Preservation

Structural anchors count against the effective node budget, but are selected first. If structural anchors alone exceed the budget, return all structural anchors up to the hard maximum and mark `truncated=true`.
The backend read model must prioritize these node kinds before applying the final node budget:

- `AccountNode`
- `Principal`
- `Source`
- `Group`

### 3. Deterministic Ordering

Candidate node selection must use deterministic ordering:

1. Structural priority
2. Seed-node inclusion (filtered by active account)
3. `created_at` descending
4. `id` as final tie-breaker

### 4. Edge Selection

Edges should be selected only where both endpoints are in the selected node set, then capped by `edgeBudget` using deterministic ordering (edge priority > edge strength > created_at > id).

## API Contract & Types

If a type is an API contract shared between backend and frontend, it is exported from `packages/types/src/graph-read-model.ts` and `packages/types/src/index.ts`.

- `GraphReadModelResponse`
- `GraphReadModelMetadata`
- `GraphReadModelNode`
- `GraphReadModelEdge`

The response metadata must include detailed bounds tracking:

```ts
export interface GraphReadModelMetadata {
  requestedNodeBudget: number;
  effectiveNodeBudget: number;
  requestedEdgeBudget: number;
  effectiveEdgeBudget: number;
  totalNodes: number;
  returnedNodes: number;
  totalEdges: number;
  returnedEdges: number;
  structuralAnchorsRequested: number;
  structuralAnchorsReturned: number;
  structuralAnchorsPreserved: boolean;
  truncated: boolean;
}
```

_Note: To preserve store compatibility, the response shape must remain compatible with the `GraphSnapshotResponse` structure, while placing read-model specific metadata cleanly._

## Frontend Boundaries

- **Adapter Boundary**: Do not let `SharedThreeGraphRenderer` depend directly on the backend API shape. The `keimenonStore` maps API contracts into the frontend `KeimenonNode/Edge` state model.
- **Fallback Logic**: The frontend must not invent missing structural anchors. It may preserve/display anchors returned by the backend and show explicit degraded/empty/error states when anchors are absent. Network/API failures show error states, not filter fallbacks.

## Verification

- Add a focused `graph.read-model.test.ts` or extend existing routes proving that:
  - `Phrase` payload fields are hydrated.
  - Structural anchors are included under a low node budget.
  - Response remains account-scoped even when `seed_node_ids` include cross-account IDs.
- Execution steps include `npm run type-check`, `npm run lint`, and `npm run build`.
