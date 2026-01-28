# Grouping Engine Usage Guide

This guide demonstrates how to use the deterministic, modality-aware grouping engine for processing conversation data.

## Overview

The grouping engine provides multi-level text breaking with content-addressable storage:

```
Token → Phrase → Sentence → Block → Section
```

## Quick Start

### 1. Parse Conversation

```typescript
import { ChatGPTParser } from '@keimenon/parsers';

const parser = new ChatGPTParser();
const result = await parser.parse(chatGptData, 'conversation.json');
const conversation = result.conversations[0];
```

### 2. Process with Breaking Pipeline

```typescript
import { ContentProcessor } from '@keimenon/parsers';

const processor = new ContentProcessor({
  extractTokens: true,
  extractPhrases: true,
  extractSentences: true,
  extractBlocks: true,
  extractSections: true,
  generateSignatures: true,
  minHashPermutations: 128,
});

const processedMessages = await processor.processConversation(conversation);
```

### 3. Persist to Database

```typescript
import { GroupingStorage } from '@keimenon/parsers';
import { extractLshBands } from '@keimenon/parsers';

const storage = new GroupingStorage('./keimenon.db');

for (const processed of processedMessages) {
  // Insert blob
  storage.insertBlob(processed.blob);

  // Insert spans
  storage.insertNodeSpans(processed.spans);

  // Insert signatures
  storage.insertNodeSignatures(processed.signatures);

  // Generate and insert LSH bands
  for (const signature of processed.signatures) {
    const bands = extractLshBands(
      { hashes: signature.minhash, numPermutations: 128 },
      16 // 16 bands
    );

    const lshBands = bands.map((band) => ({
      band_hash: band.bandHash,
      band_index: band.bandIndex,
      node_id: signature.node_id,
      created_at: signature.created_at,
    }));

    storage.insertLshBands(lshBands);
  }
}
```

### 4. Query and Deduplicate

```typescript
// Find exact duplicates by content_id
const duplicates = storage.findNodesByContentId(contentId);

// Find near-duplicates via LSH
const candidates = storage.findCandidatesByBandHash(bandHash);

// Get node hierarchy
const children = storage.getChildSpans(parentNodeId);

// Get statistics
const stats = storage.getStats();
console.log(`Stored ${stats.node_count} nodes across ${stats.blob_count} blobs`);
```

## Key Concepts

### Content-Addressable Storage

All content is stored as blobs with SHA-256 addresses:

```typescript
interface Blob {
  blob_id: string; // blob_abc123...
  hash: string; // SHA-256
  size_bytes: number;
  encoding: string; // utf8
  created_at: number;
}
```

### Virtual Nodes with Spans

Nodes reference byte ranges in blobs:

```typescript
interface NodeSpan {
  node_id: string;           // Unique node ID
  node_key: string;          // nk_def456... (stable across re-ingests)
  blob_hash: string;         // References blob
  byte_start: number;
  byte_end: number;
  level: 'token' | 'phrase' | 'sentence' | 'block' | 'section' | 'message';
  modality: 'code' | 'prose' | 'markdown' | 'json' | ...;
  parent_node_id?: string;   // Parent in hierarchy
}
```

### Three-Key ID System

1. **BlobId** (`blob_abc123`): SHA-256 of raw bytes
2. **NodeKey** (`nk_def456`): Stable hash of `(blob|level|modality|span)` - deterministic across re-ingests
3. **ContentId** (`cid_789abc`): Hash of normalized content - enables exact deduplication

### Signatures for Similarity

```typescript
interface NodeSignature {
  node_id: string;
  content_id: string; // For exact dedup
  minhash: number[]; // 128-element array for Jaccard similarity
  minhash_bands?: string[]; // LSH band hashes for O(1) lookup
  tfidf_vector?: Record<string, number>; // For prose similarity
  token_sketch?: string; // For code: "op|ident|num|..."
  structural_path: string; // "h1[2]|h2[5]|p[3]" - prevents false merges
}
```

### Structural Signatures

Prevents false merges across document sections:

```typescript
// Example structural paths:
'h1[0]'; // First h1 heading
'h1[0]|h2[1]'; // Second h2 under first h1
'h1[0]|h2[1]|p[3]'; // Fourth paragraph in that section
'h1[2]|h2[0]|code_block[0]'; // First code block in section
```

## Advanced Usage

### Custom Processing Config

```typescript
const processor = new ContentProcessor({
  extractTokens: false, // Skip token level (faster)
  extractPhrases: false, // Skip phrase level
  extractSentences: true, // Keep sentences
  extractBlocks: true, // Keep blocks
  extractSections: true, // Keep sections
  generateSignatures: true, // Generate MinHash/TF-IDF
  minHashPermutations: 64, // Fewer permutations (faster, less accurate)
  generateLshBands: true, // Generate LSH bands
  lshBandsCount: 8, // Fewer bands (faster, less sensitive)
});
```

### Processing Arbitrary Text

```typescript
import { processText } from '@keimenon/parsers';

const processed = await processText('Your text here', {
  extractSections: true,
  generateSignatures: true,
});

console.log(`Found ${processed.sections.length} sections`);
console.log(`Found ${processed.blocks.length} blocks`);
console.log(`Found ${processed.sentences.length} sentences`);
```

### Direct Breaking Pipeline Access

```typescript
import { extractSections, extractBlocks, extractSentences, tokenize } from '@keimenon/parsers';

const text = '# Hello\n\nThis is a paragraph.';

// Extract at each level
const sections = extractSections(text);
const blocks = extractBlocks(text);
const sentences = extractSentences(text);
const tokens = tokenize(text);

// Generate signatures
import { generateContentSignature } from '@keimenon/parsers';

const signature = generateContentSignature(
  text,
  0,
  Buffer.byteLength(text, 'utf8'),
  'message',
  text,
  { minHashPermutations: 128 }
);
```

### Similarity Calculation

```typescript
import {
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateTokenSketchSimilarity,
} from '@keimenon/parsers';

// Jaccard similarity from MinHash
const jaccardSim = calculateJaccardSimilarity(sig1.minHash, sig2.minHash);

// Cosine similarity from TF-IDF
if (sig1.tfIdf && sig2.tfIdf) {
  const cosineSim = calculateCosineSimilarity(sig1.tfIdf, sig2.tfIdf);
}

// Token sketch similarity for code
if (sig1.tokenSketch && sig2.tokenSketch) {
  const sketchSim = calculateTokenSketchSimilarity(sig1.tokenSketch, sig2.tokenSketch);
}
```

### Clustering Workflow

```typescript
// 1. Find candidates via LSH
const candidates = storage.findCandidatesByBandHashes(bandHashes, 3); // Min 3 bands match

// 2. Calculate exact similarity for candidates
const similarities = candidates.map((candidateId) => {
  const candidateSig = storage.getNodeSignature(candidateId);
  const similarity = calculateJaccardSimilarity(querySig.minHash, candidateSig.minHash);
  return { nodeId: candidateId, similarity };
});

// 3. Filter by threshold
const nearDuplicates = similarities.filter((s) => s.similarity >= 0.8);

// 4. Create cluster
const clusterId = `cluster_${smallestNodeKey}`;
storage.insertCluster({
  cluster_id: clusterId,
  representative_node: querySig.node_id,
  member_count: nearDuplicates.length + 1,
  algorithm: 'minhash',
  threshold: 0.8,
  created_at: Date.now(),
  updated_at: Date.now(),
});

// 5. Add members
for (const dup of nearDuplicates) {
  storage.insertClusterMember({
    cluster_id: clusterId,
    node_id: dup.nodeId,
    similarity_score: dup.similarity,
    joined_at: Date.now(),
  });
}
```

## Modality-Aware Processing

The engine automatically detects content type:

- **Code**: Regex lexing, token sketches, no sentence splitting
- **Prose**: Sentence boundaries, TF-IDF vectors, stop word filtering
- **Markdown**: Extract headings, code islands, semantic text
- **JSON**: Key sorting, volatile field removal, deterministic formatting
- **Math/LaTeX**: Special handling for equations

Example:

```typescript
// Code is processed differently than prose
const codeBlocks = processed.blocks.filter((b) => b.modality === 'code');
const proseBlocks = processed.blocks.filter((b) => b.modality === 'prose');

// Code blocks have token sketches
const codeSignatures = processed.signatures.filter((s) => s.token_sketch);

// Prose blocks have TF-IDF vectors
const proseSignatures = processed.signatures.filter((s) => s.tfidf_vector);
```

## Performance Tips

1. **Batch Operations**: Use `insertNodeSpans()` instead of individual `insertNodeSpan()`
2. **LSH Tuning**: More bands = more sensitive but slower queries
3. **Level Selection**: Skip token/phrase levels for faster processing
4. **Parallel Processing**: Process conversations in parallel (they're independent)
5. **Incremental Updates**: Re-use existing blobs when content hasn't changed

## Example: Full Pipeline

See [integration.test.ts](../packages/parsers/src/services/__tests__/integration.test.ts) for a complete end-to-end example.

## Schema Reference

See [003_grouping_engine_schema.ts](../apps/api/src/migrations/003_grouping_engine_schema.ts) for the complete database schema.

## Phase 3: J+MD Integration and Clustering Engine

### J+MD Surface Overview

**J+MD** provides dual surfaces for all messages:

- **`md`**: Normalized CommonMark+GFM (used for clustering)
- **`raw_text`**: Verbatim original (used for provenance)

This ensures all similarity computations operate on a consistent, normalized surface while preserving the original content for display and audit.

### Creating ChatRecords

````typescript
import { createJmdProcessor } from '@keimenon/parsers';

const jmdProcessor = createJmdProcessor(db);

// Convert message to ChatRecord
const message: NormalizedMessage = {
  message_id: 'msg_123',
  role: 'user',
  content: 'Here is code:\n```typescript\nconst x = 42;\n```',
  timestamp: Date.now(),
};

const result = jmdProcessor.convertMessage(message, 'conv_xyz');

console.log(result.chatRecord);
// {
//   id: 'chat_msg_123',
//   conversation_id: 'conv_xyz',
//   role: 'user',
//   raw_text: 'Here is code:\n```typescript\nconst x = 42;\n```',
//   md: 'Here is code:\n```typescript\nconst x = 42;\n```',
//   md_norm_sha256: 'a3f2c1...',
//   islands: [
//     {
//       type: 'code',
//       language: 'typescript',
//       md_char_start: 13,
//       md_char_end: 45,
//       content: 'const x = 42;'
//     }
//   ],
//   timestamp: 1736867422000
// }
````

### Content Islands

Islands are detected code/math blocks within markdown:

```typescript
interface ContentIsland {
  type: 'code' | 'math';
  language?: string; // For code: 'typescript', 'python', etc.
  md_char_start: number; // Byte offset in md
  md_char_end: number;
  content: string; // Island content
}
```

**Detected:**

- Fenced code blocks: ` ```lang\ncode\n``` `
- Inline code: `` `code` ``
- Display math: `$$math$$`
- Inline math: `$math$`

### Policy-Driven Clustering

The clustering engine is fully configurable via `policy.yaml`:

```yaml
version: '1.0.0'

# Overlap thresholds
overlap:
  min_jaccard: 0.3
  min_cosine: 0.4
  lsh_bands: 16
  lsh_rows_per_band: 8

# Gray-band thresholds (attach/review/reject)
gray_band:
  prose:
    sentence:
      attach: 0.90 # Auto-attach above
      review_lower: 0.75 # Review queue 0.75-0.90
      reject_below: 0.60 # Reject below
    block:
      attach: 0.88
      review_lower: 0.75
      reject_below: 0.60
  code:
    block:
      attach: 0.92 # Stricter for code
      review_lower: 0.80
      reject_below: 0.65

# Evidence weights (sum to 1.0)
evidence:
  freq_weight: 0.20
  diversity_weight: 0.15
  role_weight: 0.10
  temporal_weight: 0.10
  modality_weight: 0.10
  coherence_weight: 0.35 # Most important
```

### Running Clustering

```typescript
import { createClusteringEngine } from '@keimenon/parsers';
import { loadPolicyFromFile } from '@keimenon/types';

const policy = loadPolicyFromFile('./policy.yaml');
const engine = createClusteringEngine(db, policy);

// Cluster sentence-level prose
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

// Cluster block-level code
const codeResult = await engine.cluster('block', 'code');
```

### Gray-Band Decision System

The engine uses three decision zones:

1. **Auto-Attach** (`score >= attach`): Create NEAR_DUP edge
2. **Review Queue** (`review_lower <= score < attach`): Human review needed
3. **Reject** (`score < review_lower`): Create singleton cluster

```typescript
// Query review queue
const pending = db
  .prepare(
    `
  SELECT * FROM review_queue
  WHERE reviewed_at IS NULL
  ORDER BY top_score DESC
`
  )
  .all();

// Make manual decision
db.prepare(
  `
  UPDATE review_queue
  SET reviewed_at = ?, final_decision = ?, reviewer_id = ?
  WHERE queue_id = ?
`
).run(Date.now(), 'attach:cluster_xyz', 'admin', queueId);
```

### NEAR_DUP Edges

Clustering creates scored edges with reason codes:

```typescript
import { createNearDupEdgeGenerator } from '@keimenon/parsers';

const generator = createNearDupEdgeGenerator(db);

// Get edges by reason code
const highConfidence = generator.getEdgesByReasonCode('MINHASH_HIGH');

console.log(highConfidence);
// [
//   {
//     from_node: 'node_abc',
//     to_node: 'node_def',
//     weight: 0.89,
//     metadata: {
//       score: 0.89,
//       jaccard: 0.91,
//       cosine: 0.87,
//       reason_code: 'MINHASH_HIGH',
//       level: 'sentence',
//       modality: 'prose'
//     }
//   }
// ]

// Get all edges for a node
const nodeEdges = generator.getEdgesForNode('node_abc');
```

### Cluster Evidence

Evidence combines Phase-2 metrics with coherence:

```typescript
import { createClusterEvidenceComputer } from '@keimenon/parsers';

const computer = createClusterEvidenceComputer(db, policy);

const evidence = computer.computeEvidence('cluster_abc');

console.log(evidence);
// {
//   cluster_id: 'cluster_abc',
//   evidence_score: 8.42,
//   instances_count: 25,
//   distinct_blobs: 8,
//   role_distribution: { user: 15, assistant: 10 },
//   temporal_spread_hours: 72,
//   modality_breakdown: { prose: 20, code: 5 },
//   coherence: {
//     avg_score: 0.89,
//     min_score: 0.75,
//     max_score: 0.98,
//     edge_count: 50
//   }
// }
```

### Privacy-Preserving Exports

Export similarity graphs with hashed node IDs:

```typescript
import { createPublishableExport } from '@keimenon/api';

const exporter = createPublishableExport(db, policy);

// Export edges with score >= 0.70
const snapshot = exporter.exportEdgesOnly({ minScore: 0.7 });

console.log(snapshot);
// {
//   version: '20250114_143022',
//   policy_signature: 'sha256:a3f2c1...',
//   exported_at: 1736867422000,
//   edges: [
//     {
//       from: '5e884898da28047151d0e56f8dc6292773603d0d...',  // SHA-256 hash
//       to: 'd4735e3a265e16eee03f59718b9b5d03019c07d8...',
//       score: 0.89,
//       reason_code: 'MINHASH_HIGH'
//     }
//   ],
//   stats: {
//     total_edges: 1250,
//     total_nodes: 850,
//     avg_score: 0.87
//   }
// }

// Save snapshot
exporter.saveSnapshot(snapshot);

// Verify integrity
const verification = exporter.verifySnapshot(snapshot.version);
console.log(verification.valid); // true

// Cleanup old snapshots (keep last 10)
exporter.cleanOldSnapshots();
```

### Monitoring Clustering

```sql
-- Cluster statistics
SELECT level, modality, COUNT(*) as clusters, SUM(member_count) as total_members
FROM clusters
GROUP BY level, modality;

-- Review queue depth
SELECT modality, COUNT(*) as pending, AVG(top_score) as avg_score
FROM review_queue
WHERE reviewed_at IS NULL
GROUP BY modality;

-- Edge statistics
SELECT
  json_extract(metadata, '$.reason_code') as reason,
  COUNT(*) as count,
  AVG(weight) as avg_score
FROM edges
WHERE kind = 'NEAR_DUP'
GROUP BY reason
ORDER BY count DESC;

-- High-coherence clusters
SELECT c.cluster_id, c.member_count, AVG(e.weight) as coherence
FROM clusters c
JOIN cluster_memberships cm ON c.cluster_id = cm.cluster_id
JOIN edges e ON cm.node_id = e.from_node
WHERE e.kind = 'NEAR_DUP'
GROUP BY c.cluster_id
HAVING coherence > 0.85
ORDER BY member_count DESC;
```

## Phase 3 Documentation

For more detailed information:

- **[CLUSTERING_GUIDE.md](./CLUSTERING_GUIDE.md)**: Comprehensive clustering workflow, algorithms, and troubleshooting
- **[EDGES_ONLY_EXPORT.md](./EDGES_ONLY_EXPORT.md)**: Export format specification and privacy guarantees
- **[PHASE_3_COMPLETE.md](./PHASE_3_COMPLETE.md)**: Implementation details and contract verification

## Next Steps

- ✅ Phase 1: Content-addressable storage with modality detection (Complete)
- ✅ Phase 2: Multi-level breaking with signatures (Complete)
- ✅ Phase 3: J+MD integration and clustering engine (Complete)
- ⏳ Phase 4: API endpoints and UI integration
- ⏳ Phase 5: Neo4j visualization and keimenon graph navigation
