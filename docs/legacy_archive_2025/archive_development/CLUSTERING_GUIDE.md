# Clustering Guide — Keimenon Phase 3

**Purpose:** Explain how the policy-driven clustering engine works, with code examples and operational runbooks.

**Audience:** Backend engineers, data analysts, system admins configuring clustering policies.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [J+MD Surface Integration](#jmd-surface-integration)
4. [Policy System](#policy-system)
5. [Clustering Workflow](#clustering-workflow)
6. [Gray-Band Decision System](#gray-band-decision-system)
7. [Evidence Computation](#evidence-computation)
8. [Review Queue](#review-queue)
9. [Operational Runbooks](#operational-runbooks)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Keimenon clustering engine implements **non-destructive deduplication** where duplicate instances are treated as evidence rather than trash. All clustering operates on the **J+MD surface** (normalized Markdown + verbatim raw text) and is driven by admin-configurable policies with zero hard-coded constants.

**Key Features:**

- **Policy-Driven:** Every threshold, weight, and timeout configurable via `policy.yaml`
- **Deterministic:** Ordered tie-breaking rules ensure reproducible clustering
- **Privacy-Preserving:** Edges-only exports with SHA-256 hashed node IDs
- **Gray-Band Decisions:** Three zones (attach/review/reject) with review queue for ambiguous cases
- **Evidence-Based:** Cluster quality measured by coherence + instance evidence
- **Exclusive Membership:** One cluster per slice (level × modality)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Clustering Engine                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ J+MD Processor│─▶│ LSH Candidate│─▶│ Similarity   │     │
│  │              │  │ Generation   │  │ Computation  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                 │                  │              │
│         ▼                 ▼                  ▼              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ChatRecords  │  │ LSH Buckets  │  │ Gray-Band    │     │
│  │ (md + raw)   │  │ (O(1) lookup)│  │ Decision     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                              │              │
│                          ┌───────────────────┴───────┐      │
│                          ▼                           ▼      │
│                   ┌──────────────┐          ┌──────────────┐│
│                   │ NEAR_DUP     │          │ Review Queue ││
│                   │ Edges        │          │              ││
│                   └──────────────┘          └──────────────┘│
│                          │                                   │
│                          ▼                                   │
│                   ┌──────────────┐                          │
│                   │ Cluster      │                          │
│                   │ Evidence     │                          │
│                   └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**

1. Messages → J+MD Processor → ChatRecords (md + raw_text + islands)
2. ChatRecords → LSH Candidate Generation → Candidate pairs
3. Candidate pairs → Similarity Computation → Scored pairs
4. Scored pairs → Gray-Band Decision → Attach/Review/Reject
5. Attached pairs → NEAR_DUP Edges
6. Ambiguous pairs → Review Queue
7. NEAR_DUP Edges → Cluster Evidence Roll-up

---

## J+MD Surface Integration

### What is J+MD?

**J+MD** provides dual surfaces for each message:

- **`md`**: Normalized CommonMark+GFM for similarity computation
- **`raw_text`**: Verbatim original for provenance and display

### ChatRecord Structure

```typescript
interface ChatRecord {
  id: string; // chat_abc123
  conversation_id: string; // conv_xyz789
  role: 'user' | 'assistant' | 'system' | 'tool';
  raw_text: string; // Verbatim original
  md: string; // Normalized Markdown
  md_norm_sha256: string; // Content hash
  islands: ContentIsland[]; // Code/math blocks
  timestamp: number;
}

interface ContentIsland {
  type: 'code' | 'math';
  language?: string; // For code: 'typescript', 'python', etc.
  md_char_start: number; // Byte offset in md
  md_char_end: number;
  content: string; // Island content
}
```

### Creating ChatRecords

````typescript
import { createJmdProcessor } from '@keimenon/parsers';

const processor = createJmdProcessor(db);

// Convert a message to ChatRecord
const message: NormalizedMessage = {
  message_id: 'msg_123',
  role: 'user',
  content: 'Here is some code:\n```typescript\nconst x = 42;\n```',
  timestamp: Date.now(),
};

const result = processor.convertMessage(message, 'conv_xyz');

console.log(result.chatRecord.md);
// "Here is some code:\n```typescript\nconst x = 42;\n```"

console.log(result.chatRecord.islands);
// [{ type: 'code', language: 'typescript', md_char_start: 18, md_char_end: 50, content: 'const x = 42;' }]
````

### Island Detection

The J+MD processor detects:

- **Fenced code blocks:** ` ```lang\ncode\n``` `
- **Inline code:** `` `code` ``
- **Display math:** `$$math$$`
- **Inline math:** `$math$`

Islands are used for:

- **Modality routing:** Code islands → code similarity
- **Token sketching:** AST-like representation for code
- **Context preservation:** Span mappings to raw_text

---

## Policy System

### policy.yaml Structure

```yaml
version: '1.0.0'
signature: 'sha256_of_this_policy' # Auto-computed

# Overlap thresholds for candidate generation
overlap:
  min_jaccard: 0.3 # LSH candidate threshold
  min_cosine: 0.4 # TF-IDF candidate threshold
  lsh_bands: 16 # Number of LSH bands
  lsh_rows_per_band: 8 # Rows per band (128 total hashes)

# Temporal window for grouping
temporal:
  max_time_gap_sec: 3600 # 1 hour window
  burst_window_sec: 300 # 5 minute burst detection

# Gray-band thresholds (attach/review/reject)
gray_band:
  prose:
    sentence:
      attach: 0.90 # Auto-attach above 0.90
      review_lower: 0.75 # Review queue 0.75-0.90
      reject_below: 0.60 # Reject below 0.60
    block:
      attach: 0.88
      review_lower: 0.75
      reject_below: 0.60
    section:
      attach: 0.85
      review_lower: 0.70
      reject_below: 0.55
  code:
    sentence:
      attach: 0.95 # Stricter for code (statement-level)
      review_lower: 0.85
      reject_below: 0.70
    block:
      attach: 0.92 # Function-level
      review_lower: 0.80
      reject_below: 0.65
    section:
      attach: 0.88 # File-level
      review_lower: 0.75
      reject_below: 0.60
  # Similar for math, json, markdown...

# Evidence weights (must sum to 1.0)
evidence:
  freq_weight: 0.20 # Instance count
  diversity_weight: 0.15 # Distinct blobs
  role_weight: 0.10 # Role distribution
  temporal_weight: 0.10 # Temporal spread
  modality_weight: 0.10 # Modality consistency
  coherence_weight: 0.35 # Avg edge scores (most important)

# Tokenization settings
tokenization:
  min_token_length: 3
  stopwords_enabled: true
  stemming_enabled: false # Preserve technical terms

# Tie-breaking rules (in order)
tie_breaks:
  score_epsilon: 0.001 # Multi-candidate threshold
  prefer_larger_cluster: true
  prefer_older_timestamp: true

# Publishing (edges-only export)
publishing:
  edges_only:
    enabled: true
    min_score: 0.70 # Only export high-confidence edges
    keep_last: 10 # FIFO cleanup: keep 10 snapshots
    snapshot_dir: './data/exports/snapshots'
```

### Loading and Validating Policy

```typescript
import { loadPolicyFromFile, validatePolicy } from '@keimenon/types';

// Load from file
const policy = loadPolicyFromFile('./policy.yaml');

// Policy is auto-validated and signed
console.log(policy.signature);
// "sha256:a3f2c1..."

// Manual validation
const errors = validatePolicy(policy);
if (errors.length > 0) {
  console.error('Policy validation failed:', errors);
}
```

### Policy Validation Rules

1. **Threshold Ordering:** `reject_below < review_lower < attach` for all modalities
2. **Weight Sum:** Evidence weights must sum to 1.0 ± 0.001
3. **LSH Parameters:** `lsh_bands * lsh_rows_per_band = 128` (MinHash permutations)
4. **Temporal Windows:** `burst_window_sec < max_time_gap_sec`
5. **Publishing:** `min_score >= 0.5` (prevent noise in exports)

### Policy Signatures

Every policy is signed with SHA-256 for reproducibility:

```typescript
import { signPolicy } from '@keimenon/types';

const signedPolicy = signPolicy(policy);

// Signature includes:
// - version
// - all thresholds
// - all weights
// - tokenization settings
// - publishing config

// Stored with cluster decisions and exports
```

---

## Clustering Workflow

### End-to-End Example

```typescript
import { createClusteringEngine } from '@keimenon/parsers';

const engine = createClusteringEngine(db, policy);

// Cluster all sentence-level prose
const result = await engine.cluster('sentence', 'prose');

console.log(result.stats);
// {
//   total_nodes: 1000,
//   clustered_nodes: 850,
//   singleton_clusters: 200,
//   multi_member_clusters: 150,
//   reviewed_nodes: 100,
//   rejected_nodes: 50
// }

// Cluster all block-level code
const codeResult = await engine.cluster('block', 'code');
```

### Clustering Algorithm

```
FOR each node in slice (level × modality):
  IF node already clustered:
    SKIP

  candidates = findCandidates(node)  // LSH + similarity

  IF candidates.empty:
    CREATE new singleton cluster
  ELSE:
    decision = makeDecision(node, candidates)

    IF decision == 'attach':
      ATTACH node to best cluster
      CREATE NEAR_DUP edge(s)
    ELIF decision == 'review':
      ADD to review queue
    ELSE:  # reject
      CREATE new singleton cluster

    LOG decision with policy signature
```

### Candidate Generation (LSH)

```typescript
// Find candidates using Locality-Sensitive Hashing
private async findCandidates(
  nodeId: string,
  level: string,
  modality: string
): Promise<ClusterCandidate[]> {

  // 1. Compute MinHash signature (128 permutations)
  const nodeHash = this.computeMinHash(nodeId);

  // 2. Band hashing (16 bands × 8 rows)
  const bands = this.computeLshBands(nodeHash);

  // 3. Lookup candidates in same bands (O(1))
  const candidates = new Set<string>();
  for (const band of bands) {
    const matches = this.lshIndex.get(band) || [];
    matches.forEach(c => candidates.add(c));
  }

  // 4. Compute pairwise similarity for candidates
  const scored = [];
  for (const candidateCluster of candidates) {
    const score = await this.computeSimilarity(nodeId, candidateCluster, modality);
    if (score.total >= this.policy.overlap.min_jaccard) {
      scored.push({ cluster_id: candidateCluster, score });
    }
  }

  // 5. Sort by total score (desc)
  scored.sort((a, b) => b.score.total - a.score.total);

  return scored;
}
```

### Similarity Computation

```typescript
interface SimilarityScore {
  jaccard: number;      // MinHash Jaccard estimate [0, 1]
  cosine: number;       // TF-IDF cosine similarity [0, 1]
  token_sketch: number; // Code AST similarity [0, 1] (code only)
  total: number;        // Weighted average
}

// Similarity weights vary by modality
const weights = {
  prose: { jaccard: 0.4, cosine: 0.6, token_sketch: 0.0 },
  code:  { jaccard: 0.3, cosine: 0.3, token_sketch: 0.4 },
  math:  { jaccard: 0.5, cosine: 0.5, token_sketch: 0.0 },
};

private async computeSimilarity(
  nodeId: string,
  clusterId: string,
  modality: string
): Promise<SimilarityScore> {

  const node = this.getNode(nodeId);
  const clusterMembers = this.getClusterMembers(clusterId);

  // Average similarity to all cluster members
  let jaccard = 0, cosine = 0, tokenSketch = 0;

  for (const member of clusterMembers) {
    jaccard += this.jaccardSimilarity(node, member);
    cosine += this.cosineSimilarity(node, member);
    if (modality === 'code') {
      tokenSketch += this.tokenSketchSimilarity(node, member);
    }
  }

  jaccard /= clusterMembers.length;
  cosine /= clusterMembers.length;
  tokenSketch /= clusterMembers.length;

  const w = weights[modality];
  const total = w.jaccard * jaccard + w.cosine * cosine + w.token_sketch * tokenSketch;

  return { jaccard, cosine, token_sketch: tokenSketch, total };
}
```

---

## Gray-Band Decision System

### Three Decision Zones

```
1.0 ┤
    │     ┌─────────────────────────────┐
    │     │  AUTO-ATTACH ZONE           │
    ├─────┤  score >= attach            │
0.88│     │  → Create NEAR_DUP edge     │
    │     └─────────────────────────────┘
    │     ┌─────────────────────────────┐
    │     │  REVIEW ZONE                │
    ├─────┤  review_lower <= score      │
0.75│     │  → Add to review queue      │
    │     └─────────────────────────────┘
    │     ┌─────────────────────────────┐
    │     │  REJECT ZONE                │
    ├─────┤  score < review_lower       │
0.60│     │  → Create singleton cluster │
    │     └─────────────────────────────┘
0.0 ┤
```

### Decision Logic

```typescript
private async makeDecision(
  nodeId: string,
  candidates: ClusterCandidate[],
  level: string,
  modality: string
): Promise<DecisionResult> {

  const thresholds = getThresholds(this.policy, modality, level);
  const topCandidate = candidates[0];
  const topScore = topCandidate.score.total;

  // Check for multi-candidate ambiguity
  const epsilon = this.policy.tie_breaks.score_epsilon;
  const nearTies = candidates.filter(c =>
    Math.abs(c.score.total - topScore) < epsilon
  );

  if (nearTies.length > 1) {
    // Multiple candidates within epsilon → review queue
    return {
      decision: 'review',
      cluster_id: null,
      final_score: topScore,
      reason_code: 'MULTI_CANDIDATE',
      threshold_attach: thresholds.attach,
      threshold_review: thresholds.review_lower,
      threshold_reject: thresholds.reject_below,
    };
  }

  // Single best candidate → gray-band decision
  if (topScore >= thresholds.attach) {
    return {
      decision: 'attach',
      cluster_id: topCandidate.cluster_id,
      final_score: topScore,
      reason_code: this.determineReasonCode(topCandidate.score),
      threshold_attach: thresholds.attach,
      threshold_review: thresholds.review_lower,
      threshold_reject: thresholds.reject_below,
    };
  } else if (topScore >= thresholds.review_lower) {
    return {
      decision: 'review',
      cluster_id: null,
      final_score: topScore,
      reason_code: 'GRAY_BAND',
      threshold_attach: thresholds.attach,
      threshold_review: thresholds.review_lower,
      threshold_reject: thresholds.reject_below,
    };
  } else {
    return {
      decision: 'reject',
      cluster_id: null,
      final_score: topScore,
      reason_code: 'BELOW_THRESHOLD',
      threshold_attach: thresholds.attach,
      threshold_review: thresholds.review_lower,
      threshold_reject: thresholds.reject_below,
    };
  }
}
```

### Reason Codes

```typescript
type ReasonCode =
  | 'TOK_OVERLAP'      // High token overlap (Jaccard)
  | 'MINHASH_HIGH'     // MinHash similarity
  | 'COSINE_HIGH'      // TF-IDF cosine
  | 'BLOCK_MATCH'      // Exact block match
  | 'GRAY_BAND'        // Ambiguous score
  | 'MULTI_CANDIDATE'  // Multiple near-ties
  | 'BELOW_THRESHOLD'  // Score too low
  | 'TOKEN_SKETCH'     // Code AST similarity
  ;

private determineReasonCode(score: SimilarityScore): ReasonCode {
  if (score.jaccard >= 0.9) return 'MINHASH_HIGH';
  if (score.cosine >= 0.9) return 'COSINE_HIGH';
  if (score.token_sketch >= 0.9) return 'TOKEN_SKETCH';
  if (score.jaccard >= 0.7) return 'TOK_OVERLAP';
  return 'BLOCK_MATCH';
}
```

---

## Evidence Computation

### Cluster Evidence Formula

```typescript
evidenceScore =
  w_freq * log(1 + instanceCount) +
  w_diversity * log(1 + distinctBlobs) +
  w_role * roleDistributionEntropy +
  w_temporal * temporalSpreadScore +
  w_modality * modalityConsistencyScore +
  w_coherence * avgEdgeScore;

// Default weights (from policy.yaml):
// w_freq = 0.20
// w_diversity = 0.15
// w_role = 0.10
// w_temporal = 0.10
// w_modality = 0.10
// w_coherence = 0.35
```

### Computing Evidence

```typescript
import { createClusterEvidenceComputer } from '@keimenon/parsers';

const computer = createClusterEvidenceComputer(db, policy);

const evidence = computer.computeEvidence('cluster_abc123');

console.log(evidence);
// {
//   cluster_id: 'cluster_abc123',
//   evidence_score: 8.42,
//   instances_count: 25,
//   distinct_blobs: 8,
//   role_distribution: { user: 15, assistant: 10 },
//   temporal_spread_hours: 72,
//   modality_breakdown: { prose: 20, code: 5 },
//   coherence: { avg_score: 0.89, min_score: 0.75, max_score: 0.98 },
//   policy_signature: 'sha256:...'
// }
```

### Coherence Score

```typescript
// Coherence = average NEAR_DUP edge score within cluster
private computeCoherence(clusterId: string, members: string[]): CoherenceMetrics {
  const edges = this.getNearDupEdges(clusterId);

  if (edges.length === 0) {
    return { avg_score: 0, min_score: 0, max_score: 0, edge_count: 0 };
  }

  const scores = edges.map(e => e.weight);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  return {
    avg_score: avgScore,
    min_score: minScore,
    max_score: maxScore,
    edge_count: edges.length
  };
}
```

---

## Review Queue

### When Nodes Enter Review Queue

1. **Gray-Band Score:** `review_lower <= score < attach`
2. **Multi-Candidate:** Multiple clusters within `score_epsilon`
3. **Structural Conflict:** Contradictory Phase-2 edges (REFUTES)

### Review Queue Schema

```sql
CREATE TABLE review_queue (
  queue_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  level TEXT NOT NULL,           -- sentence/block/section
  modality TEXT NOT NULL,        -- prose/code/math/json/markdown
  candidates TEXT NOT NULL,      -- JSON array of ClusterCandidate
  top_score REAL NOT NULL,
  score_epsilon REAL NOT NULL,
  multi_candidate_structural_conflict BOOLEAN NOT NULL DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,           -- NULL until human review
  final_decision TEXT,           -- 'attach:<cluster_id>' or 'reject'
  reviewer_id TEXT,
  review_notes TEXT
);
```

### Querying Review Queue

```typescript
// Get all pending reviews
const pending = db
  .prepare(
    `
  SELECT * FROM review_queue
  WHERE reviewed_at IS NULL
  ORDER BY top_score DESC, created_at ASC
`
  )
  .all();

// Get reviews for specific modality
const codeReviews = db
  .prepare(
    `
  SELECT * FROM review_queue
  WHERE modality = ? AND reviewed_at IS NULL
`
  )
  .all('code');
```

### Manual Review Workflow

```typescript
// 1. Fetch review item
const item = db
  .prepare(
    `
  SELECT * FROM review_queue WHERE queue_id = ?
`
  )
  .get(queueId);

// 2. Display candidates to human reviewer
const candidates = JSON.parse(item.candidates);
console.log('Node:', item.node_id);
console.log('Candidates:');
candidates.forEach((c) => {
  console.log(`  - Cluster ${c.cluster_id}: score=${c.score.total.toFixed(3)}`);
});

// 3. Human makes decision
const decision = 'attach:cluster_xyz789'; // or 'reject'

// 4. Record decision
db.prepare(
  `
  UPDATE review_queue
  SET reviewed_at = ?, final_decision = ?, reviewer_id = ?, review_notes = ?
  WHERE queue_id = ?
`
).run(Date.now(), decision, reviewerId, notes, queueId);

// 5. Apply decision
if (decision.startsWith('attach:')) {
  const clusterId = decision.split(':')[1];
  engine.attachToCluster(item.node_id, clusterId, item.top_score);
} else {
  engine.createCluster(item.node_id, item.level, item.modality);
}
```

---

## Operational Runbooks

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Run migrations (includes 005_clustering_schema.ts)
npm run migrate

# 3. Verify policy.yaml
cat policy.yaml

# 4. Load and validate policy
npm run validate-policy

# 5. Run clustering
npm run cluster -- --level sentence --modality prose
```

### Running Clustering

```typescript
// Cluster all slices
async function clusterAll() {
  const engine = createClusteringEngine(db, policy);

  const levels = ['sentence', 'block', 'section'];
  const modalities = ['prose', 'code', 'math', 'json', 'markdown'];

  for (const level of levels) {
    for (const modality of modalities) {
      console.log(`Clustering ${level} × ${modality}...`);
      const result = await engine.cluster(level, modality);
      console.log(`  Clustered: ${result.stats.clustered_nodes}/${result.stats.total_nodes}`);
      console.log(`  Reviewed: ${result.stats.reviewed_nodes}`);
    }
  }
}
```

### Monitoring Clustering Progress

```sql
-- Total nodes clustered
SELECT level, modality, COUNT(*) as total
FROM cluster_memberships
GROUP BY level, modality;

-- Review queue depth
SELECT modality, COUNT(*) as pending
FROM review_queue
WHERE reviewed_at IS NULL
GROUP BY modality;

-- Clustering decisions breakdown
SELECT decision, COUNT(*) as count
FROM cluster_decisions
GROUP BY decision;

-- Top reason codes
SELECT json_extract(metadata, '$.reason_code') as reason, COUNT(*) as count
FROM edges
WHERE kind = 'NEAR_DUP'
GROUP BY reason
ORDER BY count DESC;
```

### Exporting Edges

```typescript
import { createPublishableExport } from '@keimenon/api';

const exporter = createPublishableExport(db, policy);

// Export high-confidence edges (score >= 0.70)
const snapshot = exporter.exportEdgesOnly({ minScore: 0.7 });

console.log(snapshot.stats);
// {
//   total_edges: 1250,
//   total_nodes: 850,
//   avg_score: 0.87,
//   min_score: 0.70,
//   max_score: 0.99
// }

// Save snapshot
exporter.saveSnapshot(snapshot);
// Saved to: ./data/exports/snapshots/edges_20250114_143022.json

// Verify snapshot integrity
const verification = exporter.verifySnapshot(snapshot.version);
console.log(verification.valid); // true

// Cleanup old snapshots (keep last 10)
exporter.cleanOldSnapshots();
```

### Adjusting Policy

```yaml
# Increase code strictness (require higher similarity)
gray_band:
  code:
    block:
      attach: 0.95 # Was 0.92
      review_lower: 0.85 # Was 0.80
      reject_below: 0.70 # Was 0.65
```

After adjusting policy:

```bash
# 1. Validate new policy
npm run validate-policy

# 2. Re-cluster with new policy (non-destructive)
npm run cluster -- --level block --modality code --force

# 3. Compare decision counts
sqlite3 keimenon.db "
  SELECT policy_signature, decision, COUNT(*)
  FROM cluster_decisions
  WHERE level='block' AND modality='code'
  GROUP BY policy_signature, decision;
"
```

---

## Troubleshooting

### Clustering Too Aggressive (Over-Clustering)

**Symptom:** Many false positives, unrelated content in same cluster.

**Diagnosis:**

```sql
-- Find low-coherence clusters
SELECT c.cluster_id, AVG(e.weight) as avg_coherence
FROM clusters c
JOIN edges e ON (e.from_node IN (SELECT node_id FROM cluster_memberships WHERE cluster_id = c.cluster_id))
WHERE e.kind = 'NEAR_DUP'
GROUP BY c.cluster_id
HAVING avg_coherence < 0.70
ORDER BY avg_coherence ASC;
```

**Fix:**

1. Increase `attach` threshold in policy.yaml
2. Decrease `score_epsilon` (stricter tie-breaking)
3. Increase `min_jaccard` / `min_cosine` (fewer candidates)

### Clustering Too Conservative (Under-Clustering)

**Symptom:** Many singleton clusters, obvious duplicates not merged.

**Diagnosis:**

```sql
-- Count singleton clusters
SELECT level, modality, COUNT(*) as singletons
FROM clusters c
WHERE (SELECT COUNT(*) FROM cluster_memberships WHERE cluster_id = c.cluster_id) = 1
GROUP BY level, modality;
```

**Fix:**

1. Decrease `attach` threshold in policy.yaml
2. Increase `review_lower` threshold (send more to review)
3. Decrease `min_jaccard` / `min_cosine` (more candidates)

### High Review Queue Depth

**Symptom:** Thousands of items in review queue.

**Diagnosis:**

```sql
-- Review queue by modality
SELECT modality, COUNT(*) as pending, AVG(top_score) as avg_score
FROM review_queue
WHERE reviewed_at IS NULL
GROUP BY modality;
```

**Fix:**

1. Widen attach/review thresholds (smaller gray band)
2. Increase `score_epsilon` (tolerate more ties)
3. Enable auto-attach for high-confidence reviews:
   ```sql
   UPDATE review_queue
   SET final_decision = 'attach:' || json_extract(candidates, '$[0].cluster_id'),
       reviewed_at = strftime('%s', 'now') * 1000,
       reviewer_id = 'auto'
   WHERE reviewed_at IS NULL AND top_score >= 0.85;
   ```

### LSH Performance Degradation

**Symptom:** Clustering runs slower as corpus grows.

**Diagnosis:**

```sql
-- LSH bucket distribution
SELECT band_hash, COUNT(*) as bucket_size
FROM lsh_index
GROUP BY band_hash
ORDER BY bucket_size DESC
LIMIT 10;
```

**Fix:**

1. Increase `lsh_bands` (more granular bucketing)
2. Decrease `lsh_rows_per_band` (more buckets, smaller buckets)
3. Rebuild LSH index periodically:
   ```typescript
   engine.rebuildLshIndex();
   ```

### Policy Signature Mismatch

**Symptom:** Old decisions conflict with new policy.

**Diagnosis:**

```sql
-- Count decisions by policy signature
SELECT policy_signature, COUNT(*) as count
FROM cluster_decisions
GROUP BY policy_signature;
```

**Fix:**

1. Re-cluster with new policy (non-destructive):
   ```bash
   npm run cluster -- --force --policy-signature sha256:new_sig
   ```
2. Old decisions remain for audit trail
3. Query by policy signature:
   ```sql
   SELECT * FROM cluster_decisions WHERE policy_signature = 'sha256:latest';
   ```

---

## Summary

The clustering engine provides:

✅ **Policy-Driven:** Zero hard-coded constants
✅ **Deterministic:** Reproducible clustering with tie-breaking
✅ **Privacy-Preserving:** Hashed exports with no plaintext
✅ **Evidence-Based:** Cluster quality measured by coherence
✅ **Auditable:** Full decision trail with policy signatures
✅ **Non-Destructive:** All instances preserved as evidence
✅ **Gray-Band Decisions:** Review queue for ambiguous cases
✅ **J+MD Anchored:** All similarity on normalized Markdown surface

**Next Steps:**

- Review [EDGES_ONLY_EXPORT.md](./EDGES_ONLY_EXPORT.md) for export format
- Check [GROUPING_ENGINE_USAGE.md](./GROUPING_ENGINE_USAGE.md) for Phase 1-3 overview
- See [PHASE_3_COMPLETE.md](./PHASE_3_COMPLETE.md) for implementation details
