# Core Engine: Query Model

> **Invariant**: Application code MUST NEVER interact with the underlying database driver directly. It MUST use the `DatabaseClient` abstraction.

## The DatabaseClient Interface
The system is designed to be storage-agnostic (SQLite vs Neo4j vs Hybrid).

```typescript
interface DatabaseClient {
  /**
   * Universal query method.
   * @param query - The query string (Cypher-like or SQL)
   * @param params - Safe parameter injection
   */
  execute(query: string, params: any): Promise<{ records: any[] }>;

  /**
   * Atomic Node Creation
   */
  createNode(node: Node): Promise<void>;

  /**
   * Atomic Edge Creation
   */
  createEdge(edge: Edge): Promise<void>;

  /**
   * Graph Traversal
   */
  getNodeEdges(id: string, direction?: 'IN' | 'OUT' | 'BOTH'): Promise<Edge[]>;
}
```

## Universal Query Language (UQL)
While we support SQL, we prefer a graph-oriented mental model.
- **SQLite Implementation**: Maps graph operations to `nodes` and `edges` tables using recursive CTEs for traversal.
- **Neo4j Implementation**: Passthrough to Cypher.

## Query Rules
1.  **Always Parameterize**: Never concatenate strings.
2.  **Scope by Tenant**: All queries MUST include `WHERE tenant_id = $tenantId` (automatically handled by the Service layer, but enforced by the Client if possible).
3.  **Read vs Write**: Prefer `execute` for complex reads, but use `createNode/createEdge` for writes to ensure integrity hooks (like Search Indexing) fire.

## Full-Text Search
Search is treated as a specialized query op.
- **SQLite**: Uses FTS5 virtual table `nodes_fts`.
- **Neo4j**: Uses Fulltext Indexes.
The `SearchService` abstracts this.
