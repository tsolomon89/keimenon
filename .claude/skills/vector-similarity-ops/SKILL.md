---
name: vector-similarity-ops
description: Operates on similarity detection, duplicate resolution, and vector-based operations. Understands Jaccard, Levenshtein, Cosine algorithms. Validates deduplication logic, fingerprinting, and DUP_OF edge creation. Use when working with import, deduplication, or similarity features.
allowed-tools: Read, Write, Edit, Grep, mcp__canvas-database__query_nodes, mcp__canvas-database__query_edges
---

---

**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):

- **Context Consolidation**: Automatic, not optional (Section 13.0)
- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)
- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)
- **Full-Scope Traversal**: Address all layers (Section 13.3)
- **Recursive Intelligence**: Enrich system with every run (Section 13.4)

---

# Vector & Similarity Operations

## Purpose

Expert in similarity algorithms, duplicate detection, content-addressable storage, and graph-based deduplication:

- **Similarity Algorithms**: Jaccard, Levenshtein, Cosine
- **Fingerprinting**: SHA-256 content-addressable hashing
- **Deduplication**: Message/code duplicate detection and DUP_OF edge creation
- **Graph Modeling**: Similarity relationships in the graph database

## When to Activate

This skill activates when you need to:

- Implement or modify similarity detection logic
- Configure deduplication algorithms
- Debug duplicate detection issues
- Optimize similarity thresholds
- Validate fingerprinting implementation
- Create DUP_OF or SIMILAR_TO edges
- Work with import/deduplication features

## Core Algorithms

### 1. Jaccard Similarity (Token-Based)

**How it Works**:
Measures similarity between two sets by comparing overlapping tokens.

**Formula**:

```
similarity = |A ∩ B| / |A ∪ B|
```

**Implementation Reference**:

```typescript
// apps/api/src/services/similarity-engine.ts

export class SimilarityEngine {
  private calculateJaccard(text1: string, text2: string): number {
    // 1. Tokenize (split into words)
    const tokens1 = new Set(this.tokenize(text1));
    const tokens2 = new Set(this.tokenize(text2));

    // 2. Calculate intersection
    const intersection = new Set([...tokens1].filter((token) => tokens2.has(token)));

    // 3. Calculate union
    const union = new Set([...tokens1, ...tokens2]);

    // 4. Jaccard = intersection / union
    return intersection.size / union.size;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }
}
```

**Best For**:

- ✅ Short to medium text (chat messages, comments)
- ✅ When word overlap is significant
- ✅ Fast computation (O(n + m))
- ❌ Long documents (loses context)
- ❌ Order-sensitive content (code)

**Configuration**:

```typescript
{
  algorithm: 'jaccard',
  threshold: 0.8,          // 80% token overlap
  normalizeTokens: true,   // Lowercase + remove punctuation
  ignoreCase: true,
  ignoreWhitespace: true,
  minTokenOverlap: 5       // At least 5 shared tokens
}
```

### 2. Levenshtein Distance (Edit Distance)

**How it Works**:
Measures minimum number of single-character edits (insertions, deletions, substitutions) to transform one string into another.

**Formula**:

```
distance = min edits needed to transform A → B
similarity = 1 - (distance / max(len(A), len(B)))
```

**Implementation Reference**:

```typescript
// apps/api/src/services/similarity-engine.ts

private calculateLevenshtein(text1: string, text2: string): number {
  const len1 = text1.length;
  const len2 = text2.length;

  // Create 2D array for dynamic programming
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  // Fill DP table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  // Convert distance to similarity score (0-1)
  const distance = dp[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}
```

**Best For**:

- ✅ Character-level similarity (typos, spelling variants)
- ✅ Short strings (names, titles)
- ✅ Order matters
- ❌ Long documents (O(n\*m) complexity)
- ❌ Token-level differences

**Configuration**:

```typescript
{
  algorithm: 'levenshtein',
  threshold: 0.85,          // 85% character similarity
  ignoreCase: true,
  ignoreWhitespace: false,  // Whitespace differences count
  lengthRatioTolerance: 0.2 // Lengths must be within 20%
}
```

### 3. Cosine Similarity (Vector-Based)

**How it Works**:
Represents texts as TF-IDF vectors and measures angle between them.

**Formula**:

```
similarity = (A · B) / (||A|| × ||B||)
```

**Implementation Reference**:

```typescript
// apps/api/src/services/similarity-engine.ts

private calculateCosine(text1: string, text2: string): number {
  // 1. Create term frequency vectors
  const vector1 = this.createTFIDFVector(text1);
  const vector2 = this.createTFIDFVector(text2);

  // 2. Calculate dot product
  let dotProduct = 0;
  for (const term in vector1) {
    if (term in vector2) {
      dotProduct += vector1[term] * vector2[term];
    }
  }

  // 3. Calculate magnitudes
  const magnitude1 = Math.sqrt(
    Object.values(vector1).reduce((sum, val) => sum + val * val, 0)
  );
  const magnitude2 = Math.sqrt(
    Object.values(vector2).reduce((sum, val) => sum + val * val, 0)
  );

  // 4. Cosine similarity
  return dotProduct / (magnitude1 * magnitude2);
}

private createTFIDFVector(text: string): Record<string, number> {
  const tokens = this.tokenize(text);
  const termFreq: Record<string, number> = {};

  // Calculate term frequency
  tokens.forEach(token => {
    termFreq[token] = (termFreq[token] || 0) + 1;
  });

  // Normalize by document length
  const docLength = tokens.length;
  for (const term in termFreq) {
    termFreq[term] = termFreq[term] / docLength;
  }

  return termFreq;
}
```

**Best For**:

- ✅ Long documents
- ✅ Topic similarity (semantic meaning)
- ✅ Handles different lengths well
- ✅ Order-independent
- ❌ Computationally expensive
- ❌ Requires stopword filtering

**Configuration**:

```typescript
{
  algorithm: 'cosine',
  threshold: 0.75,          // 75% semantic similarity
  normalizeTokens: true,
  removeStopwords: true,    // Remove "the", "is", "a", etc.
  minDocLength: 10          // Skip very short texts
}
```

## Algorithm Selection Guide

| Use Case                     | Best Algorithm  | Threshold | Reason                                            |
| ---------------------------- | --------------- | --------- | ------------------------------------------------- |
| Chat messages (50-500 chars) | **Jaccard**     | 0.80      | Fast, good for token overlap                      |
| Code blocks                  | **Jaccard**     | 0.85      | After normalization (comments/whitespace removed) |
| Titles/Names                 | **Levenshtein** | 0.90      | Catches typos and small variations                |
| Long documents (>1000 chars) | **Cosine**      | 0.75      | Handles semantic similarity                       |
| Near-exact duplicates        | **Jaccard**     | 0.95      | High threshold for strict matching                |
| Fuzzy duplicates             | **Jaccard**     | 0.70      | Lower threshold for loose matching                |

## Fingerprinting & Content-Addressable Storage

### SHA-256 Fingerprinting

**Purpose**: Create unique identifier for content to enable:

- Instant duplicate detection (O(1) lookup)
- Content-addressable storage
- Immutable references

**Implementation**:

```typescript
// apps/api/src/services/fingerprint.ts OR packages/parsers/src/utils/fingerprint.ts

import crypto from 'crypto';

export function calculateFingerprint(content: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(typeof content === 'string' ? Buffer.from(content) : content);
  return hash.digest('hex'); // Returns 64-char lowercase hex string
}
```

**Use Cases**:

**1. Source Node Deduplication**:

```typescript
// Before creating Source node
const fingerprint = calculateFingerprint(fileBuffer);

// Check if already exists
const existing = await db.execute(
  'SELECT * FROM nodes WHERE kind = ? AND json_extract(properties, "$.fingerprint") = ? AND account_id = ?',
  ['Source', fingerprint, accountId]
);

if (existing.records.length > 0) {
  // File already uploaded, return existing node
  return { source: existing.records[0], duplicate: true };
}

// Create new Source node with fingerprint
await db.createNode({
  id: `src_${fingerprint.slice(0, 16)}`,
  kind: 'Source',
  properties: {
    fingerprint,
    title: file.name,
    mime_type: file.mimetype,
    size_bytes: file.size,
  },
  account_id: accountId,
  created_by: userId,
  created_at: Date.now(),
  updated_at: Date.now(),
});
```

**2. Code Block Normalization + Fingerprinting**:

```typescript
// packages/parsers/src/utils/fingerprint.ts

function normalizeCode(code: string, language: string): string {
  let normalized = code;

  // Remove comments
  if (['javascript', 'typescript', 'java', 'c', 'cpp'].includes(language)) {
    normalized = normalized.replace(/\/\/.*$/gm, ''); // Single-line comments
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments
  } else if (['python', 'ruby', 'bash'].includes(language)) {
    normalized = normalized.replace(/#.*$/gm, ''); // Python comments
  }

  // Normalize whitespace
  normalized = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return normalized;
}

export function fingerprintCodeBlock(code: string, language: string): string {
  const normalized = normalizeCode(code, language);
  return calculateFingerprint(normalized);
}
```

**3. Message Deduplication**:

```typescript
// During chat import
const fingerprint = calculateFingerprint(message.content);

// Check for duplicate
const duplicates = await db.execute(
  'SELECT * FROM nodes WHERE kind = ? AND json_extract(properties, "$.fingerprint") = ? AND account_id = ?',
  ['Message', fingerprint, accountId]
);

if (duplicates.records.length > 0) {
  // Create DUP_OF edge instead of new node
  await db.createEdge({
    kind: 'DUP_OF',
    from_id: currentMessageId,
    to_id: duplicates.records[0].id,
    properties: {
      similarity_score: 1.0, // Exact duplicate
      algorithm: 'fingerprint',
      detected_at: Date.now(),
    },
    account_id: accountId,
    created_by: userId,
    created_at: Date.now(),
  });
}
```

## Graph Deduplication Patterns

### Pattern 1: Exact Duplicates (DUP_OF Edge)

**When to Use**: Content is identical after normalization

**Graph Structure**:

```
Message1 -[DUP_OF {score: 1.0}]-> Message2 (canonical)
Message3 -[DUP_OF {score: 1.0}]-> Message2 (canonical)
```

**Implementation**:

```typescript
// During import, for each message
const fingerprint = calculateFingerprint(message.content);

// Find canonical (first occurrence)
const canonical = await findCanonicalByFingerprint(fingerprint, accountId);

if (canonical) {
  // Don't create new node, create DUP_OF edge
  await db.createEdge({
    kind: 'DUP_OF',
    from_id: currentThreadId, // Or parent container
    to_id: canonical.id,
    properties: {
      similarity_score: 1.0,
      algorithm: 'fingerprint',
      duplicate_content_hash: fingerprint,
    },
    account_id: accountId,
    created_by: userId,
    created_at: Date.now(),
  });
} else {
  // Create new node (this becomes canonical)
  await db.createNode({
    id: messageId,
    kind: 'Message',
    properties: {
      content: message.content,
      fingerprint,
      role: message.role,
    },
    account_id: accountId,
    created_by: userId,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
}
```

### Pattern 2: Fuzzy Duplicates (SIMILAR_TO Edge)

**When to Use**: Content is similar but not identical (threshold-based)

**Graph Structure**:

```
Message1 -[SIMILAR_TO {score: 0.87, algorithm: 'jaccard'}]-> Message2
Message2 -[SIMILAR_TO {score: 0.92, algorithm: 'jaccard'}]-> Message3
```

**Implementation**:

```typescript
// During import, after creating all nodes
const messages = await getAllMessagesInScope(accountId);

for (let i = 0; i < messages.length; i++) {
  for (let j = i + 1; j < messages.length; j++) {
    const similarity = calculateSimilarity(
      messages[i].properties.content,
      messages[j].properties.content,
      { algorithm: 'jaccard', threshold: 0.8 }
    );

    if (similarity.isDuplicate) {
      await db.createEdge({
        kind: 'SIMILAR_TO',
        from_id: messages[i].id,
        to_id: messages[j].id,
        properties: {
          similarity_score: similarity.score,
          algorithm: 'jaccard',
          threshold: 0.8,
        },
        account_id: accountId,
        created_by: userId,
        created_at: Date.now(),
      });
    }
  }
}
```

## Import Deduplication Workflow

### Step 1: Configure Deduplication

```typescript
// Import configuration
const importConfig = {
  deduplication: {
    enabled: true,
    algorithm: 'jaccard', // 'jaccard' | 'levenshtein' | 'cosine'
    threshold: 0.85, // 0.0 - 1.0
    scope: 'global', // 'conversation' | 'global'
    create_edges: true, // Create SIMILAR_TO edges
  },
  code_extraction: {
    enabled: true,
    deduplicate_code: true,
    normalize_before_hash: true,
  },
};
```

### Step 2: Process Import

```typescript
// apps/api/src/services/import-enhanced-v2.ts OR import-local.ts

async function processMessages(
  messages: Message[],
  config: ImportConfig,
  accountId: string,
  userId: string
) {
  const processedMessages: Node[] = [];
  const duplicateEdges: Edge[] = [];

  for (const message of messages) {
    // Calculate fingerprint
    const fingerprint = calculateFingerprint(message.content);

    if (config.deduplication.enabled) {
      // Check for exact duplicate
      const canonical = await findCanonicalByFingerprint(fingerprint, accountId);

      if (canonical) {
        // Exact duplicate - create DUP_OF edge
        duplicateEdges.push({
          kind: 'DUP_OF',
          from_id: message.thread_id,
          to_id: canonical.id,
          properties: { similarity_score: 1.0, algorithm: 'fingerprint' },
          account_id: accountId,
          created_by: userId,
          created_at: Date.now(),
        });
        continue; // Skip creating node
      }

      // Check for fuzzy duplicates
      if (config.deduplication.scope === 'global') {
        const similar = await findSimilarMessages(
          message.content,
          accountId,
          config.deduplication.algorithm,
          config.deduplication.threshold
        );

        if (similar.length > 0 && config.deduplication.create_edges) {
          // Create SIMILAR_TO edges
          similar.forEach((sim) => {
            duplicateEdges.push({
              kind: 'SIMILAR_TO',
              from_id: messageNode.id,
              to_id: sim.id,
              properties: {
                similarity_score: sim.score,
                algorithm: config.deduplication.algorithm,
              },
              account_id: accountId,
              created_by: userId,
              created_at: Date.now(),
            });
          });
        }
      }
    }

    // Create message node
    const messageNode = await db.createNode({
      id: `msg_${generateId()}`,
      kind: 'Message',
      properties: {
        content: message.content,
        fingerprint,
        role: message.role,
        timestamp: message.timestamp,
      },
      account_id: accountId,
      created_by: userId,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    processedMessages.push(messageNode);
  }

  // Create duplicate edges in batch
  if (duplicateEdges.length > 0) {
    await db.createEdgesBatch(duplicateEdges);
  }

  return { messages: processedMessages, duplicates: duplicateEdges.length };
}
```

### Step 3: Report Results

```typescript
return {
  imported: {
    threads: threadCount,
    messages: messageCount,
    sources: sourceCount,
    code_blocks: codeBlockCount,
  },
  deduplication: {
    exact_duplicates: exactDuplicateCount, // DUP_OF edges
    similar_messages: similarMessageCount, // SIMILAR_TO edges
    skipped_nodes: skippedDuplicateCount, // Nodes not created
  },
  statistics: {
    similarity_scores: {
      min: 0.85,
      max: 1.0,
      avg: 0.92,
    },
  },
};
```

## Optimization Techniques

### 1. Length-Based Pre-Filter

```typescript
// Skip similarity calculation if lengths differ too much
function shouldCompare(text1: string, text2: string, tolerance: number = 0.2): boolean {
  const len1 = text1.length;
  const len2 = text2.length;
  const ratio = Math.abs(len1 - len2) / Math.max(len1, len2);

  return ratio <= tolerance;
}

// Use before expensive similarity calculation
if (shouldCompare(msg1.content, msg2.content, 0.2)) {
  const similarity = calculateJaccard(msg1.content, msg2.content);
  // ...
}
```

### 2. Fingerprint-Based Bucketing

```typescript
// Group by first N characters of fingerprint
const buckets: Record<string, Message[]> = {};

messages.forEach((msg) => {
  const bucket = msg.fingerprint.slice(0, 4); // First 4 chars
  if (!buckets[bucket]) buckets[bucket] = [];
  buckets[bucket].push(msg);
});

// Only compare within same bucket
for (const bucket in buckets) {
  const msgs = buckets[bucket];
  // Compare msgs within bucket (smaller search space)
}
```

### 3. MinHash for Large-Scale Deduplication

```typescript
// For very large imports (10k+ messages)
// Use MinHash/LSH for approximate nearest neighbors
// This reduces O(n²) comparisons to O(n log n)

// Implementation would go in packages/parsers/src/services/minhash.ts
// Reference: https://en.wikipedia.org/wiki/MinHash
```

## Testing Deduplication

### Using MCP Chat-Import Server

```typescript
// Test deduplication with known duplicates
mcp__canvas -
  chat -
  import__test_deduplication({
    algorithm: 'jaccard',
    threshold: 0.85,
  });

// Import test dataset
mcp__canvas -
  chat -
  import__import_test_dataset({
    dataset_name: 'tiny', // Has known duplicates
    config: {
      deduplication: {
        enabled: true,
        algorithm: 'jaccard',
        threshold: 0.85,
      },
    },
  });

// Verify results
mcp__canvas -
  chat -
  import__verify_import_results({
    import_id: 'result_from_above',
  });
```

### Querying Duplicate Edges

```typescript
// Find all DUP_OF edges
mcp__canvas -
  database__query_edges({
    kind: 'DUP_OF',
    limit: 100,
  });

// Find SIMILAR_TO edges with high scores
mcp__canvas -
  database__query_edges({
    kind: 'SIMILAR_TO',
    limit: 50,
  });
// Then filter by similarity_score in properties
```

## Common Issues and Solutions

### Issue: Too Many False Positives

**Symptom**: Unrelated messages marked as duplicates

**Solution**:

- Increase threshold (0.85 → 0.90)
- Switch algorithm (Jaccard → Levenshtein for short text)
- Add length ratio tolerance check
- Use fingerprinting for exact matches only

### Issue: Missing Duplicates

**Symptom**: Obvious duplicates not detected

**Solution**:

- Decrease threshold (0.85 → 0.75)
- Check normalization (whitespace, case, punctuation)
- Verify fingerprinting is applied consistently
- Use Jaccard for token-based content

### Issue: Slow Import Performance

**Symptom**: Import takes too long with deduplication enabled

**Solution**:

- Use fingerprinting for exact duplicates (O(1) lookup)
- Skip fuzzy matching for large imports
- Implement bucketing/MinHash for large datasets
- Run deduplication as background job after import

## Success Metrics

Deduplication is working well when:

- ✅ Exact duplicates detected with 100% accuracy
- ✅ Fuzzy duplicates detected with >85% precision
- ✅ False positive rate <5%
- ✅ Import performance <10% slower with deduplication
- ✅ DUP_OF edges have score=1.0
- ✅ SIMILAR_TO edges have scores between threshold and 1.0
- ✅ No cross-account duplicate edges (isolation enforced)

## Reference Files

- [apps/api/src/services/similarity-engine.ts](../../../apps/api/src/services/similarity-engine.ts) - Similarity algorithms
- [apps/api/src/services/duplicate-detection.ts](../../../apps/api/src/services/duplicate-detection.ts) - Duplicate detection logic
- [packages/parsers/src/utils/fingerprint.ts](../../../packages/parsers/src/utils/fingerprint.ts) - Fingerprinting utilities
- [packages/parsers/src/services/deduplication-engine.ts](../../../packages/parsers/src/services/deduplication-engine.ts) - Deduplication engine
- [docs/architecture/CANONICALIZATION.md](../../../docs/architecture/CANONICALIZATION.md) - Deduplication strategy

---

**Note**: This skill is read-only for validation. Use Write/Edit tools separately to modify deduplication configurations or algorithms.
