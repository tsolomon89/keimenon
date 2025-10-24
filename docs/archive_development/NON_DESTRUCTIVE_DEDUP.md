# Non-Destructive Deduplication: Design & Usage

## Core Principle

**Duplicates are evidence, not trash.** Every instance is preserved as its own node. Canonicalization is a read-time convenience, not a write-time mutation.

## The Contract

### 1. First Principles

- ✅ **Never delete or merge nodes** - Every instance stays with its own spans and provenance
- ✅ **Canonicalization is read-time** - Pick a canonical for display, but keep all instances
- ✅ **Duplicates become signals** - Frequency, diversity, and recurrence strengthen clusters/claims

### 2. Data Model

#### Tables (Migration 004)

**canonical_map** - Read helper for fast lookups

```sql
CREATE TABLE canonical_map (
  node_id TEXT NOT NULL,              -- Instance node
  canonical_node_id TEXT NOT NULL,    -- Canonical representative
  kind TEXT CHECK(kind='EXACT_DUP'),  -- Edge type
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, canonical_node_id)
);
```

**canonical_stats** - Materialized evidence weights

```sql
CREATE TABLE canonical_stats (
  canonical_node_id TEXT PRIMARY KEY,
  instances_count INTEGER NOT NULL,
  distinct_blobs INTEGER NOT NULL,
  distinct_roles INTEGER NOT NULL,
  distinct_modalities INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  evidence_score REAL NOT NULL,
  freq_weight REAL NOT NULL,
  diversity_weight REAL NOT NULL,
  role_weight REAL NOT NULL,
  temporal_weight REAL NOT NULL,
  modality_weight REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### Views

**node_instances** - All nodes with canonical reference

```sql
CREATE VIEW node_instances AS
SELECT
  n.id AS node_id,
  COALESCE(cm.canonical_node_id, n.id) AS canonical_node_id,
  n.*,
  cm.canonical_node_id IS NOT NULL AS is_duplicate
FROM nodes n
LEFT JOIN canonical_map cm ON n.id = cm.node_id;
```

**unique_nodes** - Canonicals with evidence stats

```sql
CREATE VIEW unique_nodes AS
SELECT
  cs.canonical_node_id AS node_id,
  n.*,
  cs.instances_count,
  cs.distinct_blobs,
  cs.evidence_score
FROM canonical_stats cs
JOIN nodes n ON cs.canonical_node_id = n.id;
```

### 3. Canonical Selection

**Rule**: Pick the node with the **smallest NodeKey** (deterministic, stable across re-ingests)

```typescript
// Example: Given 3 exact duplicates
nodes: [
  { node_id: 'node_xyz', node_key: 'nk_bbb...' },
  { node_id: 'node_abc', node_key: 'nk_aaa...' }, // ← Canonical (smallest)
  { node_id: 'node_qrs', node_key: 'nk_ccc...' },
];
```

### 4. Edge Semantics

**EXACT_DUP** - Many instances → One canonical

```typescript
{
  kind: "EXACT_DUP",
  from_node: "instance_node",
  to_node: "canonical_node",
  metadata: {
    canonical: "canonical_node",
    content_id: "cid_abc123..."
  }
}
```

All instances are preserved in the graph. The edge just indicates "this node is a duplicate of that canonical."

## Usage

### Basic Deduplication

```typescript
import { DeduplicationEngine, GroupingStorage } from '@canvas/parsers';
import Database from 'better-sqlite3';

const db = new Database('./canvas.db');
const storage = new GroupingStorage('./canvas.db');
const deduper = new DeduplicationEngine(db, storage);

// Run full deduplication pipeline
const result = await deduper.deduplicate();

console.log(`Found ${result.exact_dups_found} duplicates`);
console.log(`Created ${result.canonicals_created} canonicals`);
console.log(`Created ${result.edges_created} EXACT_DUP edges`);
```

### Query Patterns

#### Instances View (Default - All Nodes)

```typescript
// Get ALL nodes (including duplicates)
const allNodes = db
  .prepare(
    `
  SELECT * FROM nodes
  WHERE type = 'message'
`
  )
  .all();

console.log(`Total instances: ${allNodes.length}`);
```

#### Unique View (Canonicals Only)

```typescript
// Get only canonicals with evidence stats
const uniqueNodes = db
  .prepare(
    `
  SELECT * FROM unique_nodes
  WHERE type = 'message'
`
  )
  .all();

console.log(`Unique messages: ${uniqueNodes.length}`);
```

#### Get All Instances for a Canonical

```typescript
const instances = deduper.getInstances(canonicalNodeId);

console.log(`Canonical ${canonicalNodeId} has ${instances.length} instances`);
```

#### Get Canonical for an Instance

```typescript
const canonical = deduper.getCanonical(nodeId);

if (deduper.isDuplicate(nodeId)) {
  console.log(`Node ${nodeId} is a duplicate of ${canonical}`);
} else {
  console.log(`Node ${nodeId} is unique (its own canonical)`);
}
```

### Evidence Weights

#### Default Configuration

```typescript
const weights = {
  freq_weight: 0.5, // 50% - log1p(instances_count)
  diversity_weight: 0.3, // 30% - log1p(distinct_blobs)
  role_weight: 0.1, // 10% - unique_roles / 3
  temporal_weight: 0.05, //  5% - log1p(time_span_days)
  modality_weight: 0.05, //  5% - log1p(distinct_modalities)
};
```

#### Custom Weights

```typescript
const deduper = new DeduplicationEngine(db, storage, {
  freq_weight: 0.6, // Emphasize frequency more
  diversity_weight: 0.4, // Emphasize diversity more
  role_weight: 0.0, // Ignore roles
  temporal_weight: 0.0,
  modality_weight: 0.0,
});
```

#### Evidence Score Calculation

```typescript
evidence_score =
  0.5 * log1p(instances_count) +
  0.3 * log1p(distinct_blobs) +
  0.1 * (unique_roles / 3) +
  0.05 * log1p(time_span_days) +
  0.05 * log1p(distinct_modalities);
```

**Example**:

- 5 instances across 3 blobs with 2 roles over 7 days
- `freq_weight = log1p(5) = 1.79`
- `diversity_weight = log1p(3) = 1.39`
- `role_weight = 2/3 = 0.67`
- `temporal_weight = log1p(7) = 2.08`
- `evidence_score = 0.5*1.79 + 0.3*1.39 + 0.1*0.67 + 0.05*2.08 = 1.48`

### Ranking by Evidence

```typescript
// Get top canonicals by evidence score
const topCanonicals = deduper.getTopCanonicals((limit = 100), (minInstancesCount = 2));

for (const canon of topCanonicals) {
  console.log(
    `${canon.canonical_node_id}: ${canon.instances_count} instances, score ${canon.evidence_score}`
  );
}
```

### Statistics

```typescript
const stats = deduper.getStats();

console.log(`Total nodes: ${stats.total_nodes}`);
console.log(`Unique nodes: ${stats.unique_nodes}`);
console.log(`Duplicate nodes: ${stats.duplicate_nodes}`);
console.log(`Canonicals with duplicates: ${stats.canonicals_with_dups}`);
console.log(`Avg instances per canonical: ${stats.avg_instances_per_canonical}`);
```

## API Integration (Future)

### Read-Time View Flags

```typescript
// GET /api/graph?collapse_exact=true&collapse_near=false

if (req.query.collapse_exact === 'true') {
  // Return unique view
  const nodes = db.prepare('SELECT * FROM unique_nodes').all();
} else {
  // Return instances view
  const nodes = db.prepare('SELECT * FROM node_instances').all();
}
```

### Evidence Panel (Inspector)

```typescript
// GET /api/nodes/:nodeId/evidence

const canonical = deduper.getCanonical(nodeId);
const stats = deduper.getCanonicalStats(canonical);
const instances = deduper.getInstances(canonical);

return {
  canonical,
  stats: {
    instances_count: stats.instances_count,
    distinct_blobs: stats.distinct_blobs,
    evidence_score: stats.evidence_score,
  },
  instances: instances.map((id) => ({
    node_id: id,
    // ... fetch node details
  })),
};
```

### Export with View Selection

```typescript
// Export with instances (provenance mode)
function exportWithInstances(filters) {
  return db
    .prepare(
      `
    SELECT * FROM nodes
    WHERE ${filters}
    ORDER BY created_at
  `
    )
    .all();
}

// Export with canonicals (unique mode)
function exportWithCanonicals(filters) {
  return db
    .prepare(
      `
    SELECT * FROM unique_nodes
    WHERE ${filters}
    ORDER BY evidence_score DESC
  `
    )
    .all();
}
```

## Acceptance Tests

### Test 1: No Loss

```typescript
// Create two identical paragraphs
const text = 'Hello world';
const p1 = await processor.processText(text);
const p2 = await processor.processText(text);

// Store both
storage.insertBlob(p1.blob);
storage.insertBlob(p2.blob);
storage.insertNodeSpans(p1.spans);
storage.insertNodeSpans(p2.spans);

const beforeCount = db.prepare('SELECT COUNT(*) FROM node_spans').get().count;

// Run dedup
await deduper.deduplicate();

const afterCount = db.prepare('SELECT COUNT(*) FROM node_spans').get().count;

// ✅ NO NODES DELETED
assert(beforeCount === afterCount);

// ✅ Canonical created with 2 instances
const canonical = deduper.getCanonical(p1.spans[0].node_id);
const instances = deduper.getInstances(canonical);
assert(instances.length === 2);
```

### Test 2: Unique View

```typescript
// With collapse_exact=true, show 1 node with instances_count=2
const uniqueNodes = db.prepare('SELECT * FROM unique_nodes').all();
assert(uniqueNodes[0].instances_count === 2);

// Expanding reveals both instances
const instances = deduper.getInstances(uniqueNodes[0].node_id);
assert(instances.length === 2);
```

### Test 3: Evidence Score

```typescript
// More instances = higher evidence score
const text1 = 'High frequency text';
const text2 = 'Low frequency text';

// Create 5 instances of text1
for (let i = 0; i < 5; i++) {
  const p = await processor.processText(text1);
  // ... insert
}

// Create 2 instances of text2
for (let i = 0; i < 2; i++) {
  const p = await processor.processText(text2);
  // ... insert
}

await deduper.deduplicate();

const topCanonicals = deduper.getTopCanonicals(10);

// ✅ text1 canonical should rank higher
assert(topCanonicals[0].instances_count === 5);
assert(topCanonicals[0].evidence_score > topCanonicals[1].evidence_score);
```

## Performance Considerations

### Index Usage

```sql
-- Fast canonical lookup
CREATE INDEX idx_canonical_map_node ON canonical_map(node_id);
CREATE INDEX idx_canonical_map_canonical ON canonical_map(canonical_node_id);

-- Fast evidence ranking
CREATE INDEX idx_canonical_stats_evidence ON canonical_stats(evidence_score DESC);
CREATE INDEX idx_canonical_stats_instances ON canonical_stats(instances_count DESC);
```

### Batch Processing

```typescript
// Dedup after bulk import (not during)
await bulkImport(conversations);
await deduper.deduplicate(); // Single pass, all at once
```

### Incremental Updates

```typescript
// When adding new content, refresh only affected canonicals
const newNode = await processor.processText(text);
// ... insert

await deduper.deduplicate(); // Re-runs efficiently

// Or refresh specific canonical
await deduper.refreshCanonicalStats(canonicalNodeId);
```

## Migration Path

1. Run migration 003 (grouping engine schema)
2. Run migration 004 (canonical_map and canonical_stats)
3. Import/process conversations
4. Run deduplication once: `await deduper.deduplicate()`
5. Query with views:
   - `node_instances` for provenance
   - `unique_nodes` for overview
   - `canonical_stats` for ranking

## Next Steps

- [ ] Build clustering engine for NEAR_DUP (similar but not identical)
- [ ] Add UI toggles for collapse_exact/collapse_near
- [ ] Create Inspector evidence panel
- [ ] Add Nav filters by evidence_score
- [ ] Implement claims linkage with evidence weights

## References

- [deduplication-engine.ts](../packages/parsers/src/services/deduplication-engine.ts)
- [Migration 004](../apps/api/src/migrations/004_canonical_map_and_stats.ts)
- [Deduplication Tests](../packages/parsers/src/services/__tests__/deduplication.test.ts)
