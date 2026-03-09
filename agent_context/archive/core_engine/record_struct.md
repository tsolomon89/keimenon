# Core Engine: Record vs Struct

> Invariant: persisted Records are transformed into read-only Structs for presentation.

## Dual-State Model

| Feature    | Record               | Struct          |
| ---------- | -------------------- | --------------- |
| State      | Persisted            | Ephemeral       |
| Mutability | Mutable via services | Immutable in UI |
| Source     | Database truth       | View projection |
| Shape      | Normalized           | Denormalized    |

## Record Contract

```typescript
interface Record {
  id: string;
  kind: string;
  account_id: string;
  attributes: Record<string, unknown>;
  meta: RecordMeta;
}
```

Acceptance checks:

- `id` is globally unique or deterministically scoped.
- queries must enforce `account_id` isolation.
- `attributes` is JSON-serializable.

## Struct Contract

```typescript
interface Struct<T> {
  readonly id: string;
  readonly type: string;
  readonly data: T;
  readonly _links?: Record<string, string>;
}
```

Acceptance checks:

- immutable in runtime/UI usage.
- traceable back to source record(s).
- shaped for UI needs, not raw table schema.

## Transformation Pipeline

1. Fetch records via `DatabaseClient`.
2. Hydrate linked records where needed.
3. Project into typed Structs.
4. Render in web/desktop clients.
