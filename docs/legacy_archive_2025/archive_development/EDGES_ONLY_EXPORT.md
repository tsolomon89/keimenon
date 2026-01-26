# Edges-Only Export Format Specification

**Purpose:** Define the privacy-preserving export format for NEAR_DUP similarity graphs with hashed node IDs and no plaintext content.

**Audience:** Backend engineers, data analysts, researchers consuming Canvas Memory exports.

---

## Table of Contents

1. [Overview](#overview)
2. [Privacy Guarantees](#privacy-guarantees)
3. [Export Format](#export-format)
4. [Snapshot Versioning](#snapshot-versioning)
5. [Integrity Verification](#integrity-verification)
6. [Usage Examples](#usage-examples)
7. [Import/Analysis](#importanalysis)
8. [Policy Compliance](#policy-compliance)

---

## Overview

The **edges-only export** provides a privacy-preserving snapshot of the NEAR_DUP similarity graph without exposing any plaintext content. All node IDs are hashed with SHA-256, and only edge metadata (scores, reason codes) is included.

**Use Cases:**

- **Research:** Analyze similarity patterns without content access
- **External Tools:** Import into graph databases (Neo4j, NetworkX)
- **Audit:** Verify clustering decisions via edge topology
- **Benchmarking:** Compare clustering quality across policy versions
- **Publishing:** Share similarity graphs with third parties safely

**What's Included:**

- Hashed node IDs (SHA-256)
- Edge scores (similarity weights)
- Reason codes (TOK_OVERLAP, MINHASH_HIGH, etc.)
- Edge counts and statistics
- Policy signature (for reproducibility)
- Export timestamp and version

**What's Excluded:**

- Plaintext content (md, raw_text)
- Node metadata (role, timestamp, conversation_id)
- ChatRecord details
- Provenance information
- Any PII or sensitive data

---

## Privacy Guarantees

### 1. No Content Leakage

**Guarantee:** Zero plaintext content in exports.

**Implementation:**

- All node IDs hashed with SHA-256 (irreversible one-way function)
- No node metadata included (no role, timestamp, conversation_id)
- No edge metadata containing content excerpts
- No ChatRecord details or J+MD surfaces

**Verification:**

```typescript
// Automated verification in publishable-export.ts
function verifySnapshot(snapshot: EdgeSnapshot): VerificationResult {
  const errors: string[] = [];

  // Check for plaintext content
  const jsonStr = JSON.stringify(snapshot);
  if (jsonStr.includes('raw_text') || jsonStr.includes('content')) {
    errors.push('Found plaintext content in snapshot');
  }

  // Verify all node IDs are hashed (64-char hex)
  for (const edge of snapshot.edges) {
    if (!/^[0-9a-f]{64}$/.test(edge.from)) {
      errors.push(`Invalid hash format: ${edge.from}`);
    }
    if (!/^[0-9a-f]{64}$/.test(edge.to)) {
      errors.push(`Invalid hash format: ${edge.to}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### 2. Collision Resistance

**Guarantee:** SHA-256 ensures no accidental ID collisions.

**Properties:**

- 2^256 possible hashes (~10^77)
- Collision probability negligible for realistic corpus sizes
- Deterministic: same node_id → same hash

**Example:**

```typescript
import crypto from 'crypto';

function hashNodeId(nodeId: string): string {
  return crypto.createHash('sha256').update(nodeId).digest('hex');
}

hashNodeId('node_abc123');
// "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"

hashNodeId('node_abc123'); // Same hash
// "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
```

### 3. Irreversibility

**Guarantee:** Cannot recover original node IDs from hashes.

**Why:** SHA-256 is a cryptographic hash function with no known preimage attacks.

**Note:** If an attacker has access to the original database, they can compute hashes and match them. This export protects against _content_ exposure, not ID guessing.

### 4. No Metadata Inference

**Guarantee:** No indirect content leakage via metadata.

**Excluded Metadata:**

- Timestamps (could reveal temporal patterns)
- Roles (user vs. assistant)
- Conversation IDs (group related nodes)
- Token counts (proxy for content length)
- Language tags (reveal code vs. prose)

**Included Metadata:**

- Similarity scores (abstract weights)
- Reason codes (clustering logic, not content)
- Policy signature (configuration, not data)

---

## Export Format

### JSON Schema

```json
{
  "version": "20250114_143022",
  "policy_signature": "sha256:a3f2c1b8...",
  "exported_at": 1736867422000,
  "edges": [
    {
      "from": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "to": "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
      "score": 0.8765,
      "reason_code": "MINHASH_HIGH"
    },
    {
      "from": "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
      "to": "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
      "score": 0.9234,
      "reason_code": "TOK_OVERLAP"
    }
  ],
  "stats": {
    "total_edges": 1250,
    "total_nodes": 850,
    "avg_score": 0.8723,
    "min_score": 0.7,
    "max_score": 0.9912,
    "reason_codes": {
      "MINHASH_HIGH": 450,
      "TOK_OVERLAP": 380,
      "COSINE_HIGH": 220,
      "BLOCK_MATCH": 150,
      "TOKEN_SKETCH": 50
    }
  }
}
```

### TypeScript Interface

```typescript
export interface EdgeSnapshot {
  version: string; // Timestamp-based version (YYYYMMDD_HHMMSS)
  policy_signature: string; // SHA-256 of policy.yaml
  exported_at: number; // Unix timestamp (ms)
  edges: HashedEdge[];
  stats: SnapshotStats;
}

export interface HashedEdge {
  from: string; // SHA-256 hash of from_node
  to: string; // SHA-256 hash of to_node
  score: number; // Similarity score [0, 1]
  reason_code: ReasonCode; // Clustering reason
}

export interface SnapshotStats {
  total_edges: number;
  total_nodes: number; // Count of unique hashed node IDs
  avg_score: number;
  min_score: number;
  max_score: number;
  reason_codes: Record<ReasonCode, number>;
}

export type ReasonCode =
  | 'TOK_OVERLAP'
  | 'MINHASH_HIGH'
  | 'COSINE_HIGH'
  | 'BLOCK_MATCH'
  | 'TOKEN_SKETCH';
```

### File Naming Convention

```
edges_{version}.json
```

**Examples:**

- `edges_20250114_143022.json` (exported Jan 14, 2025 at 2:30:22 PM)
- `edges_20250115_091500.json` (exported Jan 15, 2025 at 9:15:00 AM)

**Version Format:** `YYYYMMDD_HHMMSS` (ISO 8601 basic format)

---

## Snapshot Versioning

### Version Generation

```typescript
export function generateVersion(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// Example:
generateVersion(1736867422000); // "20250114_143022"
```

### FIFO Cleanup

**Policy Setting:**

```yaml
publishing:
  edges_only:
    keep_last: 10 # Keep last 10 snapshots, delete older
```

**Cleanup Logic:**

```typescript
export function cleanOldSnapshots(): void {
  const keepLast = this.policy.publishing.edges_only.keep_last;
  const snapshots = this.listSnapshots(); // Sorted by version (newest first)

  if (snapshots.length > keepLast) {
    const toDelete = snapshots.slice(keepLast);
    toDelete.forEach((snapshot) => {
      fs.unlinkSync(snapshot.path);
      console.log(`Deleted old snapshot: ${snapshot.version}`);
    });
  }
}
```

**Example:**

```
Snapshots before cleanup (12 total):
  edges_20250114_143022.json
  edges_20250114_120000.json
  edges_20250114_090000.json
  edges_20250113_180000.json
  edges_20250113_150000.json
  edges_20250113_120000.json
  edges_20250112_180000.json
  edges_20250112_150000.json
  edges_20250112_120000.json
  edges_20250111_180000.json
  edges_20250111_150000.json  ← Will be deleted
  edges_20250111_120000.json  ← Will be deleted

After cleanup (keep_last=10):
  edges_20250114_143022.json
  edges_20250114_120000.json
  edges_20250114_090000.json
  edges_20250113_180000.json
  edges_20250113_150000.json
  edges_20250113_120000.json
  edges_20250112_180000.json
  edges_20250112_150000.json
  edges_20250112_120000.json
  edges_20250111_180000.json
```

### Snapshot Directory

```yaml
publishing:
  edges_only:
    snapshot_dir: './data/exports/snapshots'
```

**Directory Structure:**

```
data/
└── exports/
    └── snapshots/
        ├── edges_20250114_143022.json
        ├── edges_20250114_120000.json
        └── edges_20250114_090000.json
```

---

## Integrity Verification

### Verification Steps

```typescript
export interface VerificationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function verifySnapshot(version: string): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Load snapshot file
  const snapshot = this.loadSnapshot(version);
  if (!snapshot) {
    errors.push(`Snapshot not found: ${version}`);
    return { valid: false, errors, warnings };
  }

  // 2. Verify JSON structure
  if (!snapshot.edges || !Array.isArray(snapshot.edges)) {
    errors.push('Missing or invalid edges array');
  }
  if (!snapshot.stats) {
    errors.push('Missing stats object');
  }

  // 3. Verify hashed node IDs (64-char hex)
  const hashPattern = /^[0-9a-f]{64}$/;
  for (const edge of snapshot.edges) {
    if (!hashPattern.test(edge.from)) {
      errors.push(`Invalid hash format: ${edge.from}`);
    }
    if (!hashPattern.test(edge.to)) {
      errors.push(`Invalid hash format: ${edge.to}`);
    }
  }

  // 4. Verify no plaintext content
  const jsonStr = JSON.stringify(snapshot);
  const forbiddenKeys = ['raw_text', 'content', 'md', 'message'];
  for (const key of forbiddenKeys) {
    if (jsonStr.includes(key)) {
      errors.push(`Found forbidden key: ${key}`);
    }
  }

  // 5. Verify score ranges [0, 1]
  for (const edge of snapshot.edges) {
    if (edge.score < 0 || edge.score > 1) {
      errors.push(`Invalid score: ${edge.score}`);
    }
  }

  // 6. Verify policy signature format
  if (!snapshot.policy_signature.startsWith('sha256:')) {
    errors.push('Invalid policy signature format');
  }

  // 7. Verify stats consistency
  const uniqueNodes = new Set<string>();
  snapshot.edges.forEach((e) => {
    uniqueNodes.add(e.from);
    uniqueNodes.add(e.to);
  });

  if (uniqueNodes.size !== snapshot.stats.total_nodes) {
    warnings.push(
      `Node count mismatch: expected ${snapshot.stats.total_nodes}, got ${uniqueNodes.size}`
    );
  }

  if (snapshot.edges.length !== snapshot.stats.total_edges) {
    warnings.push(
      `Edge count mismatch: expected ${snapshot.stats.total_edges}, got ${snapshot.edges.length}`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

### Running Verification

```typescript
import { createPublishableExport } from '@canvas/api';

const exporter = createPublishableExport(db, policy);

// Verify specific snapshot
const result = exporter.verifySnapshot('20250114_143022');

if (result.valid) {
  console.log('✓ Snapshot verified successfully');
  if (result.warnings.length > 0) {
    console.warn('Warnings:', result.warnings);
  }
} else {
  console.error('✗ Verification failed:', result.errors);
}
```

### Verification Checklist

- [ ] Valid JSON structure
- [ ] All node IDs are 64-char hex (SHA-256)
- [ ] No plaintext content (no `raw_text`, `md`, `content` keys)
- [ ] All scores in range [0, 1]
- [ ] Policy signature format: `sha256:...`
- [ ] Stats match edge/node counts
- [ ] All reason codes valid
- [ ] Version format: `YYYYMMDD_HHMMSS`

---

## Usage Examples

### Basic Export

```typescript
import { createPublishableExport } from '@canvas/api';

const exporter = createPublishableExport(db, policy);

// Export all edges with score >= 0.70
const snapshot = exporter.exportEdgesOnly({
  minScore: 0.7,
});

console.log(snapshot.stats);
// {
//   total_edges: 1250,
//   total_nodes: 850,
//   avg_score: 0.8723,
//   min_score: 0.7000,
//   max_score: 0.9912
// }

// Save snapshot
exporter.saveSnapshot(snapshot);
console.log(`Saved: edges_${snapshot.version}.json`);
```

### Filtered Export (Reason Code)

```typescript
// Export only high-confidence code similarities
const codeSnapshot = exporter.exportEdgesOnly({
  minScore: 0.85,
  reasonCodes: ['TOKEN_SKETCH', 'BLOCK_MATCH'],
});

console.log(codeSnapshot.stats.reason_codes);
// { TOKEN_SKETCH: 50, BLOCK_MATCH: 150 }
```

### Scheduled Export

```typescript
// Run daily exports at midnight
import cron from 'node-cron';

cron.schedule('0 0 * * *', () => {
  const snapshot = exporter.exportEdgesOnly({ minScore: 0.7 });
  exporter.saveSnapshot(snapshot);
  exporter.cleanOldSnapshots(); // Keep last 10
  console.log(`Daily export completed: ${snapshot.version}`);
});
```

### Loading Snapshots

```typescript
// List all available snapshots
const snapshots = exporter.listSnapshots();
console.log(`Found ${snapshots.length} snapshots`);

// Load specific snapshot
const snapshot = exporter.loadSnapshot('20250114_143022');

// Load latest snapshot
const latest = exporter.loadSnapshot(snapshots[0].version);
```

---

## Import/Analysis

### NetworkX (Python)

```python
import json
import networkx as nx

# Load snapshot
with open('edges_20250114_143022.json', 'r') as f:
    snapshot = json.load(f)

# Create graph
G = nx.Graph()

for edge in snapshot['edges']:
    G.add_edge(
        edge['from'],
        edge['to'],
        weight=edge['score'],
        reason=edge['reason_code']
    )

print(f"Nodes: {G.number_of_nodes()}")
print(f"Edges: {G.number_of_edges()}")

# Compute graph metrics
print(f"Avg clustering coefficient: {nx.average_clustering(G):.3f}")
print(f"Avg shortest path length: {nx.average_shortest_path_length(G):.3f}")

# Find communities
from networkx.algorithms import community
communities = community.greedy_modularity_communities(G)
print(f"Detected {len(communities)} communities")

# High-score edges
high_score_edges = [(u, v) for u, v, d in G.edges(data=True) if d['weight'] > 0.9]
print(f"High-score edges (>0.9): {len(high_score_edges)}")
```

### Neo4j (Cypher)

```cypher
// Load snapshot into Neo4j
CALL apoc.load.json('file:///edges_20250114_143022.json') YIELD value
UNWIND value.edges AS edge
MERGE (from:Node {hash: edge.from})
MERGE (to:Node {hash: edge.to})
MERGE (from)-[r:NEAR_DUP]->(to)
SET r.score = edge.score,
    r.reason = edge.reason_code;

// Query high-confidence clusters
MATCH (n:Node)-[r:NEAR_DUP]-(m:Node)
WHERE r.score > 0.85
RETURN n, r, m
LIMIT 100;

// Find densely connected nodes
MATCH (n:Node)-[r:NEAR_DUP]-(m:Node)
WITH n, COUNT(r) as degree, AVG(r.score) as avg_score
WHERE degree > 5
RETURN n.hash, degree, avg_score
ORDER BY degree DESC
LIMIT 10;
```

### SQLite Analysis

```sql
-- Load snapshot into SQLite
CREATE TABLE snapshot_edges (
  from_hash TEXT NOT NULL,
  to_hash TEXT NOT NULL,
  score REAL NOT NULL,
  reason_code TEXT NOT NULL
);

-- Import JSON (using CLI or script)
-- .mode json
-- .import edges_20250114_143022.json snapshot_edges

-- Compute node degrees
SELECT from_hash as node, COUNT(*) as degree
FROM snapshot_edges
GROUP BY from_hash
ORDER BY degree DESC
LIMIT 10;

-- Average score by reason code
SELECT reason_code, AVG(score) as avg_score, COUNT(*) as count
FROM snapshot_edges
GROUP BY reason_code
ORDER BY avg_score DESC;

-- Find triangles (3-cliques)
SELECT a.from_hash as n1, a.to_hash as n2, b.to_hash as n3
FROM snapshot_edges a
JOIN snapshot_edges b ON a.to_hash = b.from_hash
JOIN snapshot_edges c ON b.to_hash = c.from_hash AND c.to_hash = a.from_hash
WHERE a.score > 0.8 AND b.score > 0.8 AND c.score > 0.8
LIMIT 100;
```

---

## Policy Compliance

### Policy Signature Bundling

Every export includes the policy signature used for clustering:

```json
{
  "version": "20250114_143022",
  "policy_signature": "sha256:a3f2c1b8d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7",
  ...
}
```

**Why:** Ensures reproducibility. Given the same corpus and policy, clustering should produce identical edges.

### Verifying Policy Compliance

```typescript
// Load policy from snapshot
const snapshot = exporter.loadSnapshot('20250114_143022');
const snapshotPolicy = loadPolicyBySignature(snapshot.policy_signature);

// Compare with current policy
const currentPolicy = loadPolicyFromFile('./policy.yaml');

if (snapshotPolicy.signature !== currentPolicy.signature) {
  console.warn('Snapshot uses different policy version');
  console.log('Snapshot policy:', snapshotPolicy.version);
  console.log('Current policy:', currentPolicy.version);
}
```

### Min Score Filter

**Policy Setting:**

```yaml
publishing:
  edges_only:
    min_score: 0.70 # Only export edges with score >= 0.70
```

**Rationale:** Low-score edges (< 0.70) are often noise or weak similarities. Filtering improves signal-to-noise ratio in exports.

**Override:**

```typescript
// Export all edges (ignore policy min_score)
const allEdges = exporter.exportEdgesOnly({ minScore: 0.0 });

// Export only very high confidence
const highConfidence = exporter.exportEdgesOnly({ minScore: 0.9 });
```

---

## Summary

The edges-only export provides:

✅ **Privacy-Preserving:** SHA-256 hashed node IDs, no plaintext
✅ **Integrity Verified:** Automated verification checks
✅ **Policy-Compliant:** Bundled policy signature for reproducibility
✅ **Version-Controlled:** Timestamped snapshots with FIFO cleanup
✅ **Analysis-Ready:** Import into NetworkX, Neo4j, SQLite
✅ **Lightweight:** Only edges + metadata (no node content)
✅ **Auditable:** Full clustering decisions traceable via edges

**File Format:**

- JSON with typed schema
- 64-char hex hashed node IDs (SHA-256)
- Scores [0, 1] with reason codes
- Statistics (avg/min/max scores, reason code breakdown)

**Use Cases:**

- Research: Analyze similarity patterns
- External Tools: Import into graph databases
- Audit: Verify clustering decisions
- Benchmarking: Compare policy versions
- Publishing: Share graphs safely

**Next Steps:**

- Review [CLUSTERING_GUIDE.md](./CLUSTERING_GUIDE.md) for clustering workflow
- See [GROUPING_ENGINE_USAGE.md](./GROUPING_ENGINE_USAGE.md) for Phase 1-3 overview
- Check [PHASE_3_COMPLETE.md](./PHASE_3_COMPLETE.md) for implementation details
