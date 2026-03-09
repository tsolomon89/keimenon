# Core Engine: Query Model

> Invariant: application code uses `DatabaseClient`, not raw driver calls in route/controller code.

## DatabaseClient Interface

```typescript
interface DatabaseClient {
  execute(query: string, params: any): Promise<{ records: any[] }>;
  createNode(node: Node): Promise<void>;
  createEdge(edge: Edge): Promise<void>;
  getNodeEdges(id: string, direction?: 'IN' | 'OUT' | 'BOTH'): Promise<Edge[]>;
}
```

## Storage Model

Maintained runtime storage is local-only:

- SQLite for graph/metadata persistence
- local document store for full content bodies

## Query Rules

1. Always parameterize inputs.
2. Always enforce account scope (`account_id`).
3. Prefer typed write helpers (`createNode`, `createEdge`) for integrity hooks.

## Full-Text Search

Search uses SQLite FTS5 (`nodes_fts`) through service-level abstractions.
