# Core Engine: Record vs Struct

> **Invariant**: The system's data flow is defined by the transformation of strictly typed **Records** (persistence) into flexible **Structs** (presentation).

## The Dual-State Model

| Feature | Record | Struct |
| :--- | :--- | :--- |
| **State** | Persisted (Database) | Ephemeral (Memory/UI) |
| **Mutability** | Mutable | Immutable |
| **Source** | "Truth" | "View" |
| **Shape** | Normalized, Relational | Denormalized, Tree-like |
| **Consumer** | Backend Services | React Components |

## The Record Contract
A `Record` is the atomic unit of the database.
```typescript
interface Record {
  id: string;          // UUID or Deterministic Hash
  kind: string;        // The "Type" discriminator
  tenant_id: string;   // Isolation Key
  attributes: Record<string, unknown>; // Raw data
  meta: RecordMeta;    // System metadata (created_at, etc.)
}
```

### Record Acceptance Checks
- [ ] **Uniqueness**: `id` MUST be unique within the global namespace (or tenant if scoped).
- **Isolation**: Every query for a Record MUST include `WHERE tenant_id = ?`.
- **Serializability**: `attributes` MUST be fully JSON-serializable (no functions, no circular refs).

## The Struct Contract
A `Struct` is a read-only projection, often aggregating related data.
```typescript
interface Struct<T> {
  readonly id: string;
  readonly type: string; // Matches Record.kind usually
  readonly data: T;      // Typed for the specific Component
  readonly _links?: Record<string, string>; // HATEOAS-style links
}
```

### Struct Acceptance Checks
- [ ] **Immutability**: `Object.freeze()` SHOULD be applied in dev mode.
- **Traceability**: `id` MUST match the source Record `id` (if 1:1) or a deterministic composition (if aggregate).
- **Decoupling**: Struct shape MUST NOT be coupled to database schema; it SHOULD be coupled to UI needs.

## The Transformation Pipeline
1.  **Fetch**: `DatabaseClient` retrieves raw `Record(s)`.
2.  **Hydrate**: Resolves linked records (e.g., fetching an Author for an Article).
3.  **Project**: Maps the graph subgraph into a tree-shaped `Struct`.
4.  **Render**: React component consumes the `Struct`.

## Agents Note
- **Writing**: ALWAYS write to `Record`. Never try to "save" a Struct.
- **Reading**: Query for `Record`, but expect to work with `Struct` in the UI layer.
