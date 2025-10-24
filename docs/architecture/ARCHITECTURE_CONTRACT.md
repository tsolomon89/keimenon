# ARCHITECTURE_CONTRACT.md v2.0

**Status:** Canonical
**Last Updated:** 2025-10-23
**Replaces:** All prior architecture documents
**Authority:** This document defines the immutable contracts for the Canvas Memory OS

---

## Purpose

This contract establishes the foundational principles, invariants, and non-negotiable rules that govern the Canvas Memory OS architecture. All code, documentation, and decisions must conform to these contracts.

---

## Core Principles

### 1. Local-First Architecture

**Contract:** The system MUST function fully offline with zero server dependencies for Free/Pro tiers with BYO keys.

**Invariants:**

- All data processing occurs on-device by default
- Server calls are opt-in and ephemeral only
- No vendor lock-in for core functionality
- User data never leaves device without explicit consent

**Verification:**

```bash
# System must pass offline integration test
npm run test:offline
```

### 2. Graph-Native Data Model

**Contract:** Everything is a node; relationships are first-class citizens.

**Invariants:**

- Every entity has a unique node_id
- All relationships are explicit edges with typed predicates
- No implicit parent-child relationships in data structures
- Graph queries are the primary read pattern

**Anti-patterns (PROHIBITED):**

- ❌ Nested JSON objects as primary storage
- ❌ Foreign key relationships without corresponding edges
- ❌ Implicit hierarchies in table structure

**Verification:**

```typescript
// Every entity must extend BaseNode
interface BaseNode {
  node_id: string;
  node_type: NodeType;
  created_at: number;
  updated_at: number;
}
```

### 3. Content-Addressable Storage (CAS)

**Contract:** All content is addressed by cryptographic hash of its canonical form.

**Invariants:**

- Content hash = SHA-256(canonical(content))
- Identical content produces identical hashes
- Hashes are globally unique identifiers
- Content is immutable once hashed

**Canonicalization Rules:**

```typescript
// See CANONICALIZATION.md for full specification
canonical(obj) =>
  - Sort object keys alphabetically
  - Normalize whitespace (trim, single space)
  - Remove undefined/null values
  - Normalize Unicode (NFC)
  - Deterministic encoding (UTF-8)
```

**Verification:**

```typescript
assert(hash(canonical(a)) === hash(canonical(b)) IFF content_equal(a, b))
```

---

## System Invariants

### I1: Node Identity

**Rule:** Every node has exactly one canonical identifier.

```typescript
type NodeId = `${NodeType}_${ContentHash}_${Timestamp}`;
```

**Properties:**

- Globally unique
- Content-derived (stable for identical content)
- Temporally ordered (timestamp component)
- Type-safe (prefix encodes node type)

### I2: Edge Integrity

**Rule:** Edges reference only existing nodes; orphaned edges are invalid.

```sql
-- Database constraint
FOREIGN KEY (from_node_id) REFERENCES nodes(node_id) ON DELETE CASCADE
FOREIGN KEY (to_node_id) REFERENCES nodes(node_id) ON DELETE CASCADE
```

### I3: Scope Containment

**Rule:** Operations must declare and verify scope before execution.

```typescript
interface Operation {
  scope: ScopeSet; // What nodes are in scope
  requires: Permission[]; // What permissions needed
  effects: Effect[]; // What changes will occur
}
```

### I4: Idempotency

**Rule:** All write operations must be idempotent.

```typescript
// Multiple applications produce same result
apply(op, state) === apply(apply(op, state), state);
```

### I5: Audit Trail

**Rule:** All mutations record provenance.

```typescript
interface Mutation {
  mutation_id: string;
  timestamp: number;
  actor_id: string;
  operation: OperationType;
  scope: ScopeSet;
  changes: Change[];
}
```

---

## Data Architecture

### Storage Layer Hierarchy

```
┌─────────────────────────────────────┐
│  Application Layer                  │
│  (React components, hooks)          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Service Layer                      │
│  (Business logic, orchestration)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Repository Layer                   │
│  (Data access, caching)             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Storage Abstraction                │
│  (CAS, indexing, queries)           │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
┌───────▼──────┐ ┌───▼──────────┐
│ SQLite       │ │ IndexedDB     │
│ (Server/Node)│ │ (Browser)     │
└──────────────┘ └───────────────┘
```

### Content Addressing Flow

```typescript
// 1. Canonicalize content
const canonical = canonicalize(rawContent);

// 2. Generate content hash
const contentHash = sha256(canonical);

// 3. Generate node_id
const nodeId = `${nodeType}_${contentHash}_${timestamp}`;

// 4. Store with bidirectional index
db.set(nodeId, canonical);
db.index(contentHash, nodeId);
```

### Deduplication Strategy

**Contract:** Identical content creates zero additional storage.

```typescript
// Before insert
const contentHash = hash(canonical(content));
const existing = await db.findByContentHash(contentHash);

if (existing) {
  // Return reference to existing node
  return existing.node_id;
} else {
  // Create new node
  return db.insert(createNode(content));
}
```

---

## API Contracts

### Node Creation

```typescript
interface CreateNodeRequest {
  node_type: NodeType;
  content: unknown;
  metadata?: Metadata;
  account_id: string;
}

interface CreateNodeResponse {
  node_id: string;
  content_hash: string;
  is_duplicate: boolean;
  existing_node_id?: string; // If duplicate
}
```

**Guarantees:**

1. Idempotent: Same content + account = same result
2. Atomic: Node + edges created in single transaction
3. Validated: Content matches schema before persist
4. Audited: Provenance recorded automatically

### Edge Creation

```typescript
interface CreateEdgeRequest {
  from_node_id: string;
  to_node_id: string;
  edge_type: EdgeType;
  metadata?: EdgeMetadata;
}

interface CreateEdgeResponse {
  edge_id: string;
  created_at: number;
  is_duplicate: boolean;
}
```

**Guarantees:**

1. Validated: Both nodes exist before edge created
2. Typed: Edge type matches schema
3. Bidirectional: Reverse edges auto-created where needed
4. Deduplicated: Identical edges merged

---

## Schema Contracts

### Schema Versioning

**Contract:** All schemas are versioned and backward-compatible within major versions.

```typescript
interface Schema {
  schema_id: string; // e.g., "node.message.v1"
  version: SemVer; // e.g., "1.2.3"
  json_schema: JSONSchema; // JSON Schema v7
  migration?: Migration; // How to upgrade from v1.x to v2.0
}
```

**Compatibility Rules:**

- MAJOR: Breaking changes (remove field, change type)
- MINOR: Backward-compatible additions (new optional field)
- PATCH: Clarifications, no schema change

### Validation Contract

```typescript
// All data must validate before persistence
async function createNode(content: unknown): Promise<Node> {
  const schema = getSchema(nodeType);
  const validated = await schema.validate(content);

  if (!validated.success) {
    throw new ValidationError(validated.errors);
  }

  return persist(validated.data);
}
```

---

## Performance Contracts

### P1: Query Response Time

**Contract:** 95th percentile graph queries complete in <100ms for graphs up to 1M nodes.

**Measurement:**

```typescript
const p95 = metrics.query.latency.p95();
assert(p95 < 100); // milliseconds
```

### P2: Import Throughput

**Contract:** Import processes ≥1000 nodes/second on reference hardware (M1 MacBook Pro).

**Measurement:**

```typescript
const throughput = totalNodes / totalSeconds;
assert(throughput >= 1000);
```

### P3: Memory Efficiency

**Contract:** Working set stays below 500MB for 100K node graphs.

```bash
# Measure during import
/usr/bin/time -l npm run import:large
# RSS should be < 500MB
```

### P4: Deduplication Efficiency

**Contract:** Content hash lookup is O(1) average case.

```typescript
// Use hash index, not full scan
CREATE INDEX idx_content_hash ON nodes(content_hash);
```

---

## Security Contracts

### S1: Data Isolation

**Contract:** Users see only their account's data unless explicitly shared.

```sql
-- All queries scoped to account
SELECT * FROM nodes
WHERE account_id = :current_account_id
  OR node_id IN (SELECT node_id FROM shared_with WHERE user_id = :current_user_id);
```

### S2: Authentication

**Contract:** All API requests authenticated via session tokens.

```typescript
// Middleware validates session on every request
app.use(authenticateSession);
```

### S3: Encryption at Rest

**Contract:** Business tier encrypts PII using AES-256-GCM.

```typescript
// PII fields encrypted before storage
const encrypted = encrypt(content.pii, accountKey);
```

### S4: Audit Logging

**Contract:** All mutations logged with actor, timestamp, scope.

```sql
INSERT INTO audit_log (mutation_id, actor_id, operation, scope, timestamp)
VALUES (:mutation_id, :actor_id, :operation, :scope, NOW());
```

---

## Tier Contracts

### Free Tier

- ✅ Full offline functionality
- ✅ Client-side processing only
- ✅ BYO API keys
- ✅ SQLite/IndexedDB storage
- ❌ No hosted models
- ❌ No server-side processing
- ❌ No multi-user collaboration

### Pro Tier

- ✅ All Free features
- ✅ Hosted model inference (ephemeral)
- ✅ Scope receipts & verification
- ✅ Advanced analytics
- ❌ No persistent cloud storage
- ❌ No PII processing on servers

### Business Tier

- ✅ All Pro features
- ✅ Multi-user workspaces
- ✅ Encrypted cloud storage
- ✅ PII processing (with governance)
- ✅ Action execution (email, webhooks, CRM)
- ✅ Audit trails & compliance

---

## Migration Contracts

### M1: Zero-Downtime Migrations

**Contract:** Database migrations run online without service interruption.

```typescript
// Migrations are additive or backfill-compatible
// 1. Add new column (nullable)
// 2. Backfill in background
// 3. Make non-null after backfill
```

### M2: Rollback Safety

**Contract:** Every migration has a tested rollback path.

```sql
-- migrations/001_add_content_hash.sql
-- UP
ALTER TABLE nodes ADD COLUMN content_hash TEXT;

-- DOWN
ALTER TABLE nodes DROP COLUMN content_hash;
```

### M3: Data Preservation

**Contract:** Migrations never delete data without explicit user action.

```typescript
// Archive before destructive change
await archiveNodes(affectedNodeIds);
await destructiveChange();
```

---

## Testing Contracts

### T1: Coverage Threshold

**Contract:** Test coverage ≥80% for core packages (db, parsers, types).

```bash
npm run test:coverage
# Enforce in CI
if (coverage < 80) exit 1
```

### T2: Property-Based Testing

**Contract:** Canonicalization, hashing, and deduplication use property tests.

```typescript
// Example property: canonical is idempotent
fc.assert(
  fc.property(fc.object(), (obj) => {
    const c1 = canonicalize(obj);
    const c2 = canonicalize(c1);
    return deepEqual(c1, c2);
  })
);
```

### T3: Integration Tests

**Contract:** Every API endpoint has integration test coverage.

```typescript
describe('POST /api/nodes', () => {
  it('creates node with content hash', async () => {
    const res = await request(app)
      .post('/api/nodes')
      .send({ node_type: 'message', content: 'Hello' });

    expect(res.body.content_hash).toBeDefined();
  });
});
```

---

## Documentation Contracts

### D1: Architecture Decision Records

**Contract:** All significant decisions documented as ADRs.

```markdown
# ADR-001: Content-Addressable Storage

## Status

Accepted

## Context

Need deterministic deduplication...

## Decision

Use SHA-256 of canonical JSON...

## Consequences

- Automatic deduplication
- Requires canonicalization step
```

### D2: API Documentation

**Contract:** All public APIs have OpenAPI 3.0 specs.

```yaml
# openapi.yaml
paths:
  /api/nodes:
    post:
      summary: Create a new node
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateNodeRequest'
```

### D3: Schema Documentation

**Contract:** All schemas have examples and validation rules.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://canvas.memory/schemas/node.message.v1.json",
  "title": "Message Node",
  "examples": [
    {
      "node_type": "message",
      "content": "Hello, world!",
      "timestamp": 1729728000000
    }
  ]
}
```

---

## Enforcement

### Continuous Integration

All contracts verified in CI pipeline:

```yaml
# .github/workflows/contracts.yml
- name: Verify Architecture Contracts
  run: |
    npm run test:contracts
    npm run test:performance
    npm run test:security
```

### Pre-commit Hooks

Local validation before commit:

```bash
# .husky/pre-commit
npm run lint
npm run test:unit
npm run validate:schemas
```

### Contract Tests

Explicit contract verification:

```typescript
// __tests__/contracts/node-identity.test.ts
describe('Contract I1: Node Identity', () => {
  it('generates unique node_ids for different content', () => {
    const id1 = createNodeId('message', 'Hello', Date.now());
    const id2 = createNodeId('message', 'World', Date.now());
    expect(id1).not.toBe(id2);
  });

  it('generates same node_id for identical canonical content', () => {
    const content = { text: 'Hello' };
    const id1 = createNodeId('message', content, 1000);
    const id2 = createNodeId('message', content, 1000);
    expect(id1).toBe(id2);
  });
});
```

---

## Appendix A: Glossary

- **CAS**: Content-Addressable Storage
- **Canonical Form**: Normalized representation of data
- **Content Hash**: Cryptographic digest of canonical form
- **Scope**: Set of nodes visible to an operation
- **Receipt**: Immutable record of scope + execution
- **Node**: Atomic unit of data in graph
- **Edge**: Typed relationship between nodes
- **Mutation**: State-changing operation
- **Provenance**: Origin and history of data

---

## Appendix B: Related Documents

- [CANONICALIZATION.md](./CANONICALIZATION.md) - Canonical form specification
- [OVERVIEW.md](./OVERVIEW.md) - System architecture overview
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error handling patterns
- [../guides/](../guides/) - Implementation guides

---

## Revision History

| Version | Date       | Changes                    | Author |
| ------- | ---------- | -------------------------- | ------ |
| 2.0     | 2025-10-23 | Initial canonical contract | System |

---

**End of Contract Document**

All implementations must conform to this contract. Deviations require formal amendment process.
