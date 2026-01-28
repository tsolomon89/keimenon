# Import Processing Deep Dive: Actual Implementation Analysis

**Date:** 2025-10-22
**Purpose:** Document what the import system actually does (code reality) vs. what's documented
**Scope:** Complete data flow from file upload through frontend visualization

---

## Executive Summary

⚠️ **IMPORTANT:** This document has been updated to reflect the **actual production system**, not the dormant TF-IDF code.

The import system processes chat export files through a sophisticated pipeline using:

- **MinHash LSH** (128 permutations) for fast near-duplicate detection
- **Multi-level clustering** (sentence×prose, block×prose, block×code)
- **Evidence-based deduplication** with canonical mapping and scoring
- **Jaccard/Levenshtein/Cosine** similarity algorithms
- **Hierarchical content breaking** (tokens → phrases → sentences → blocks → sections)

**Two Import Paths:**

1. **Server** (`/api/v1/import/enhanced`): Full Phase 1-3 processing (MinHash LSH + Clustering)
2. **Browser** (`LocalImportService`): Basic processing (parsing + stitching only, NO Phase 1-3)

Data flows: `JSON File → Conversations → Blobs → Spans → Signatures → LSH → Deduplication → Clustering → Database`

---

## Part 0: Server vs. Browser Import Paths

### Server Import (`/api/v1/import/enhanced`)

**Used by:** `ChatImportModal` (job-based system with SSE streaming)
**Processing:** FULL Phase 1-3 with MinHash LSH + Clustering

**Pipeline:**

```
1. Parse JSON (StreamingJSONParserV2)
2. Build Sources (SourcesBuilder)
3. Extract Code (CodeExtractor)
4. Detect Duplicates (similarityEngine)
5. Phase 1: Content Breaking (ContentProcessor)
6. Phase 2: Signature Generation (MinHash + TF-IDF + LSH)
7. Phase 3a: Exact Deduplication (DeduplicationEngine)
8. Phase 3b: Near-Duplicate Clustering (ClusteringEngine)
9. Compute Evidence (ClusterEvidenceComputer)
10. Save to Neo4j/SQLite
```

**Dependencies:** Node.js, better-sqlite3, Neo4j driver

### Browser Import (`LocalImportService`)

**Used by:** `ImportModule` (local-first, no server)
**Processing:** BASIC parsing + stitching ONLY (**NO Phase 1-3**)

**Pipeline:**

```
1. Read File (FileReader)
2. Parse JSON (ParserRegistry)
3. Extract Code (extractCodeBlocks)
4. Dedupe Code (deduplicateCodeAssets - simple hash matching)
5. Segment Extraction (SegmentExtractor)
6. Stitch Sources (SourcesStitcher - Jaccard similarity)
7. (NOT IMPLEMENTED) Save to IndexedDB
```

**Dependencies:** Browser APIs only, no SQLite

**Key Difference:**

- ❌ Browser does NOT break content into spans
- ❌ Browser does NOT generate MinHash signatures
- ❌ Browser does NOT use LSH for near-duplicate detection
- ❌ Browser does NOT perform multi-level clustering
- ✅ Browser DOES basic Jaccard stitching
- ✅ Browser DOES simple code deduplication

**Reason:** Phase 1-3 services depend on `better-sqlite3` (Node.js native module, incompatible with browser)

**Future:** Create `BrowserGroupingStorage` with in-memory Maps or IndexedDB to enable full processing in browser.

---

## Part 1: Complete Import Pipeline (Server - 8 Stages)

### Stage 1: File Reading & Platform Detection

**Location:** `packages/parsers/src/parsers/index.ts:26-38`

```typescript
// Auto-detect platform from JSON structure
ParserRegistry.parse(data, filename)
  → ChatGPTParser.canParse(data)   // Checks for "conversations" array
  → ClaudeParser.canParse(data)     // Checks for "chat_messages"
  → GeminiParser.canParse(data)     // Checks for specific structure
  → GenericParser (fallback)
```

**Output:** `ParseResult` containing `NormalizedConversation[]`

### Stage 2: Message Normalization

**Location:** Platform-specific parsers (e.g., `packages/parsers/src/parsers/chatgpt.ts`)

Each parser transforms platform-specific format to normalized structure:

```typescript
interface NormalizedConversation {
  conversation_id: string;
  title: string;
  platform: string;
  messages: NormalizedMessage[];
  create_time: number;
  update_time: number;
}

interface NormalizedMessage {
  index: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata: any;
}
```

**Key Transformations:**

- Flatten nested conversation structures
- Extract message content from platform-specific wrappers
- Compute message indices (sequential ordering)
- Generate stable IDs (using `nanoid()`)

### Stage 3: Phase 1 - Content Breaking

**Location:** `packages/parsers/src/services/content-processor.ts:155-340`

**Process:**

```
ContentProcessor.processConversation(conversation)

1. For each message:
   - Create Blob (content fingerprint)
   - Extract hierarchical spans:
     * Tokens: Individual words
     * Phrases: 2-4 word sequences
     * Sentences: Sentence boundaries
     * Blocks: Paragraphs/code blocks
     * Sections: Major divisions

2. Generate fingerprints:
   - SHA-256 content_id (exact matching)
   - Byte offsets for each span

3. Store in memory:
   - blobs: Map<blob_id, Blob>
   - node_spans: Map<node_id, NodeSpan[]>
```

**Output:** `ProcessedContent[]` with blobs and spans

### Stage 4: Phase 2 - Signature Generation

**Location:** `packages/parsers/src/breaking/signature-generator.ts`

**Algorithms:**

```
1. MinHash Signature (128 permutations):
   - Hash each token with 128 different hash functions
   - Take minimum hash value for each permutation
   - Result: 128-value signature
   - Purpose: Fast fuzzy matching (Jaccard approximation)

2. TF-IDF Vector:
   - Compute term frequencies
   - Calculate inverse document frequency
   - Create sparse vector representation
   - Purpose: Semantic similarity

3. Token Sketch:
   - Sample most significant tokens
   - Create compact representation
   - Purpose: Fast similarity checks

4. LSH Bands (16 bands × 8 rows each):
   - Divide MinHash into bands
   - Hash each band separately
   - Store band_hash → [node_ids]
   - Purpose: O(1) candidate lookup
```

**Output:** `NodeSignature[]` and `LshBandRecord[]`

### Stage 5: Phase 3a - Exact Deduplication

**Location:** `packages/parsers/src/services/deduplication-engine.ts:81-188`

**Algorithm:**

```
DeduplicationEngine.deduplicate()

1. Group by content_id (SHA-256):
   SELECT node_id, content_id
   GROUP BY content_id
   HAVING COUNT(*) > 1

2. Pick canonical (smallest NodeKey per group):
   canonical = MIN(node_id) ORDER BY node_id

3. Create EXACT_DUP edges:
   For each duplicate → canonical

4. Populate canonical_map:
   node_id → canonical_node_id

5. Compute evidence scores:
   Evidence =
     0.5 × log(1 + instance_count) +
     0.3 × log(1 + distinct_blobs) +
     0.1 × (unique_roles / 3) +
     0.05 × log(1 + time_span_days) +
     0.05 × log(1 + modalities)
```

**Output:** `DeduplicationResult` with canonical mappings and stats

### Stage 6: Phase 3b - Near-Duplicate Clustering

**Location:** `packages/parsers/src/services/clustering-engine.ts:116-428`

**Algorithm:**

```
ClusteringEngine.cluster(granularity, modality)

1. LSH Candidate Generation:
   - Query lsh_bands table by band_hash
   - Find nodes with matching bands
   - Threshold: ≥2 matching bands (out of 16)

2. Pairwise Similarity:
   For each candidate pair (A, B):
     - Compute Jaccard from MinHash signatures
     - Filter by threshold (default: 0.7)

3. Connected Components:
   - Build adjacency graph from pairs
   - Find connected components (clusters)
   - Assign cluster_id = smallest node_id

4. Create cluster nodes:
   - Store in cluster_nodes table
   - Track member_count, algorithm, threshold

5. Create NEAR_DUP edges:
   - Store in cluster_edges table
   - Include similarity_score

6. Run on 3 dimensions:
   - (sentence, prose)
   - (block, prose)
   - (block, code)
```

**Output:** `ClusteringResult` with cluster nodes and edges

### Stage 7: Segment Extraction & Stitching

**Location:**

- `packages/parsers/src/sources/segment-extractor.ts:14-118`
- `packages/parsers/src/sources/stitcher.ts:14-73`

**Segment Extraction:**

```typescript
1. Group consecutive messages by same role:
   [user, user, assistant, user] → [[user, user], [assistant], [user]]

2. Filter by role (user/assistant/both)

3. Apply length thresholds:
   - minLengthUser (default: 400 chars)
   - minLengthAI (default: varies)

4. Compute fingerprint:
   hash = SHA-256(content)

5. Exact deduplication by hash
```

**Stitching Strategies:**

**A. by_title (Main Algorithm):**

```
1. Create title buckets (normalize titles)
2. Select top N seeds by total character count
3. For each seed, tokenize content
4. Greedy attach remaining segments:
   - Compute Jaccard similarity to each seed
   - If similarity ≥ threshold: attach
   - Mode: unique (each segment to 1 source) or non-unique (many)
5. Build SourceDoc from attached segments
```

**B. by_chat:**

- One source per conversation
- All segments in chronological order

**C. by_chat_role:**

- One source per (conversation × role) pair
- E.g., "Conversation Title (user)", "Conversation Title (assistant)"

**Jaccard Similarity:**

```
J(A, B) = |A ∩ B| / |A ∪ B|

Where A, B are token sets
Threshold typically 0.3-0.5
```

### Stage 8: Code Block Extraction & Deduplication

**Location:** `apps/api/src/services/import-enhanced-v2.ts:389-450`

**Extraction:**

````typescript
1. Regex pattern: ```lang\n(code)```
2. Extract from assistant messages only
3. Filter by minLength (default: 50 chars)
4. Compute hash for each block
````

**Deduplication:**

```
Non-destructive canonicalization (packages/parsers/src/services/deduplication-engine.ts)

1. Group by content_id (fingerprint)
2. Pick canonical: smallest NodeKey
3. Create EXACT_DUP edges: duplicate → canonical
4. Populate canonical_map table
5. Compute evidence scores:

   Evidence Score =
     freq_weight × log(1 + instance_count) +
     diversity_weight × log(1 + distinct_blobs) +
     role_weight × (unique_roles / 3) +
     temporal_weight × log(1 + time_span_days) +
     modality_weight × log(1 + modalities)

   Default weights: [0.5, 0.3, 0.1, 0.05, 0.05]
```

**Key Insight:** Duplicates are NOT deleted - they're linked via edges and scored by "evidence strength"

---

## Part 2: Duplicate Detection Algorithms

### Multi-Layer Detection

**Location:** `apps/api/src/services/duplicate-detection.ts:63-133`

**Process:**

```
1. Extract all messages with metadata
2. O(n²) pairwise comparison (optimizable)
3. Apply filters:
   - crossConversation: skip if same conv and filter disabled
   - lengthRatio: reject if lengths too different
   - minTokenOverlap: reject if < N tokens match
```

**Algorithms:**

**A. Jaccard (Default):**

```typescript
J(A, B) = |A ∩ B| / |A ∪ B|

tokens_A = tokenize(normalize(text_A))
tokens_B = tokenize(normalize(text_B))
similarity = jaccard(tokens_A, tokens_B)
```

**B. Levenshtein:**

```typescript
// Dynamic programming edit distance
// O(m × n) space and time
distance = levenshteinDistance(text_A, text_B);
similarity = 1 - distance / max(len(A), len(B));
```

**C. Cosine:**

```typescript
// Word frequency vectors
vector_A = [freq(word) for word in vocab]
vector_B = [freq(word) for word in vocab]

dot_product = sum(A[i] × B[i])
magnitude_A = sqrt(sum(A[i]²))
magnitude_B = sqrt(sum(B[i]²))

cosine = dot_product / (magnitude_A × magnitude_B)
```

**D. Embedding (Stub):**

```typescript
// TODO: Not implemented yet
// Would use sentence-transformers or OpenAI embeddings
// Fallback to Jaccard currently
```

**Decision Logic:**

```typescript
isDuplicate =
  similarity ≥ threshold AND
  lengthRatio ≥ (1 - tolerance) AND
  tokenOverlap ≥ minOverlap

// Auto-resolve options:
if (autoApproveExact && similarity === 1.0):
  decision = 'keep-primary'
elif (similarity ≥ autoMergeThreshold):
  decision = 'merge'
else:
  decision = null // require manual review
```

### Duplicate Grouping

**Location:** `apps/api/src/services/duplicate-detection.ts:353-389`

Groups candidates by conversation pairs:

```
Key = sort([conv_title_A, conv_title_B]).join('||')
Groups with same key = duplicates across those two conversations
```

---

## Part 3: Database Storage Model

### Node Types Created

**1. UploadItem**

```typescript
{
  id: `upload_${hash}`,
  kind: 'UploadItem',
  metadata: {
    uploadHash: string,
    platform: string,
    conversationCount: number,
    messageCount: number,
    config: ImportConfiguration
  }
}
```

**2. ChatThread**

```typescript
{
  id: conversation_id,
  kind: 'ChatThread',
  title: string,
  metadata: {
    platform: string,
    messageCount: number,
    uploadHash: string
  }
}
```

**3. Message**

```typescript
{
  id: message_id,
  kind: 'Message',
  role: 'user' | 'assistant' | 'system',
  thread_id: conversation_id,
  timestamp: number,
  content_location: 'local://messages/{conv_id}/{msg_id}.md',
  char_count: number,
  metadata: {
    hash: string,
    index: number
  }
}
```

**4. Group**

```typescript
{
  id: group_id,
  kind: 'Group',
  name: string,
  member_count: number,
  metadata: {
    keywords: string[],
    isManual: boolean,
    isCatchAll: boolean,
    confidence: number
  }
}
```

**5. CodeBlock**

```typescript
{
  id: code_id,
  kind: 'CodeBlock',
  language: string,
  content_location: 'local://code/{id}.{ext}',
  content_hash: string,
  line_count: number,
  char_count: number,
  metadata: {
    derived_from_message_id: string
  }
}
```

### Edge Types

**1. HAS_MESSAGE** (ChatThread → Message)

```typescript
{
  kind: 'HAS_MESSAGE',
  from: conversation_id,
  to: message_id,
  metadata: { index: number }
}
```

**2. CONTAINS** (Group → Message)

```typescript
{
  kind: 'CONTAINS',
  from: group_id,
  to: message_id
}
```

**3. EXTRACTED_FROM** (CodeBlock → Message)

```typescript
{
  kind: 'EXTRACTED_FROM',
  from: code_id,
  to: message_id
}
```

**4. EXACT_DUP** (Duplicate → Canonical)

```typescript
{
  kind: 'EXACT_DUP',
  from: duplicate_node_id,
  to: canonical_node_id,
  weight: 1.0,
  metadata: {
    canonical: canonical_id,
    content_id: hash
  }
}
```

### Special Tables

**canonical_map:**

```sql
node_id → canonical_node_id
kind = 'EXACT_DUP'
```

**canonical_stats:**

```sql
canonical_node_id → {
  instances_count,
  distinct_blobs,
  distinct_roles,
  distinct_modalities,
  first_seen_at,
  last_seen_at,
  evidence_score,
  [weight components...]
}
```

---

## Part 4: Frontend Visualization

### Import Module UI

**Location:** `apps/web/src/components/keimenon/ImportModule.tsx:69-809`

**Stage Visualization:**

```typescript
STEP_ORDER = [
  'reading',      // File I/O + JSON parse
  'parsing',      // Platform detection + normalization
  'extracting',   // Code block extraction
  'deduping',     // Code deduplication
  'stitching',    // Source document building
  'saving',       // Database write
  'complete'      // Summary
]

Each step shows:
- Status indicator (pending/active/complete/error)
- Progress percentage (0-100)
- Detail message
- Animated pulse when active
```

**Progress Calculation:**

```typescript
Stage weights:
  reading:    0-20%
  parsing:    20-40%
  extracting: 40-60%
  deduping:   55-60%
  stitching:  60-80%
  saving:     80-95%
  complete:   95-100%
```

### Duplicate Review Panel

**Location:** `apps/web/src/components/import/DuplicateReviewPanel.tsx:22-398`

**Three-Panel Layout:**

**Left Panel (Tree View):**

- Groups by conversation pairs
- Shows count of duplicates
- Color-coded by decision status
- Keyboard nav: ↑↓ arrows

**Center Panel (Comparison):**

- Side-by-side or unified diff view
- Similarity metrics display
- Highlight differences
- Metadata comparison

**Right Panel (Actions):**

- Decision buttons (1-4 keyboard shortcuts)
  - 1: Keep Primary
  - 2: Keep Duplicate
  - 3: Keep Both
  - 4: Merge
- Bulk actions dropdown
- Undo/Redo (Ctrl+Z/Y)

**API Call on Decision:**

```typescript
await resolveDuplicate(candidateId, action);
// POST /api/duplicates/{id}/resolve
// Body: { action: 'keep-primary' | ... }
```

### Keimenon Display

**Location:** `apps/web/src/components/keimenon/Keimenon2D.tsx` (inferred)

**Node Rendering:**

- Groups appear as bubbles/cards
- Size proportional to member_count
- Color by confidence score
- Keyword badges
- Click → expand to show messages

**Edge Rendering:**

- CONTAINS edges → visual grouping
- EXACT_DUP edges → dashed lines (optional display)
- HAS_MESSAGE edges → hidden (structural)

### Inspector Panel

**Location:** `apps/web/src/components/inspector/ImportOperationInspector.tsx`

Shows detailed stats:

- Conversations processed
- Messages extracted
- Groups created (manual vs. auto)
- Code blocks found
- Duplicates detected
- Processing time
- Throughput (messages/sec)

---

## Part 5: Key Algorithms in Detail

### MinHash LSH Deep Dive

**Why MinHash + LSH?**

- **Fast:** O(1) candidate generation (vs. O(n²) pairwise comparison)
- **Accurate:** Provably good Jaccard approximation
- **Scalable:** Works on millions of documents
- **Tunable:** Adjust bands/rows for precision/recall tradeoff

**MinHash Algorithm:**

```
Given document D with tokens {t1, t2, ..., tn}:

1. Generate 128 hash functions (h1, h2, ..., h128)
2. For each hash function hi:
   - Compute hi(t) for every token t in D
   - signature[i] = MIN(hi(t) for all t)

Result: 128-value signature [s1, s2, ..., s128]

Property: P(signature_A[i] == signature_B[i]) = Jaccard(A, B)
```

**Example:**

```
Doc A: "machine learning models neural networks"
Doc B: "deep learning neural networks models"

Tokens A: {machine, learning, models, neural, networks}
Tokens B: {deep, learning, neural, networks, models}

Jaccard(A,B) = 4/6 = 0.667

MinHash signatures (first 8 of 128):
  h1: A=0x3f2a, B=0x3f2a  ✓ match
  h2: A=0x91bc, B=0x91bc  ✓ match
  h3: A=0x45d7, B=0x2e81  ✗ different
  h4: A=0x7fe3, B=0x7fe3  ✓ match
  h5: A=0x1a92, B=0x1a92  ✓ match
  h6: A=0xc4f1, B=0x88a3  ✗ different
  h7: A=0x5621, B=0x5621  ✓ match
  h8: A=0xb3d4, B=0xb3d4  ✓ match

Matches: 6/8 = 0.75 (approximates 0.667 Jaccard)
```

**Code Reference:**

```typescript
// packages/parsers/src/breaking/signature-generator.ts
function generateMinHashSignature(tokens: Set<string>, numPermutations: number): number[] {
  const signature = new Array(numPermutations).fill(Infinity);

  for (const token of tokens) {
    for (let i = 0; i < numPermutations; i++) {
      const hash = hashWithSeed(token, i);
      signature[i] = Math.min(signature[i], hash);
    }
  }

  return signature;
}
```

### LSH (Locality-Sensitive Hashing) Deep Dive

**Why LSH?**

- Converts O(n²) pairwise comparison → O(n) lookups
- Groups similar signatures into same "buckets"
- High probability that similar docs end up in same bucket

**LSH Banding Algorithm:**

```
Given MinHash signature [s1, s2, ..., s128]:

1. Divide into B bands of R rows each:
   - Band 1: [s1, s2, ..., s8]    (rows 0-7)
   - Band 2: [s9, s10, ..., s16]  (rows 8-15)
   - ...
   - Band 16: [s121, ..., s128]   (rows 120-127)

2. Hash each band separately:
   - band_hash_1 = hash([s1, s2, ..., s8])
   - band_hash_2 = hash([s9, s10, ..., s16])
   - ...

3. Store in LSH table:
   lsh_bands[band_hash_1] = [doc_id_A, doc_id_C, ...]
   lsh_bands[band_hash_2] = [doc_id_A, doc_id_B, ...]

4. Candidate generation:
   - Query all bands for doc_X
   - Union of all matching docs = candidates
   - Filter candidates by actual Jaccard threshold
```

**Probability Math:**

```
Given:
- B = 16 bands
- R = 8 rows per band
- Similarity s (Jaccard)

Probability docs become candidates:
  P = 1 - (1 - s^R)^B

Example (s = 0.7 similarity):
  P = 1 - (1 - 0.7^8)^16
    = 1 - (1 - 0.058)^16
    = 1 - 0.397
    = 0.603 (60% chance of being candidates)

Example (s = 0.5 similarity):
  P = 1 - (1 - 0.5^8)^16
    = 1 - (1 - 0.0039)^16
    = 0.061 (6% chance - filters out low similarity)
```

**Code Reference:**

```typescript
// packages/parsers/src/breaking/signature-generator.ts
function extractLshBands(
  signature: number[],
  bandsConfig: { numBands: number; rowsPerBand: number }
): string[] {
  const { numBands, rowsPerBand } = bandsConfig;
  const bands: string[] = [];

  for (let i = 0; i < numBands; i++) {
    const start = i * rowsPerBand;
    const end = start + rowsPerBand;
    const bandValues = signature.slice(start, end);
    const bandHash = hashArray(bandValues);
    bands.push(`band_${bandHash}`);
  }

  return bands;
}
```

### Connected Components Clustering

**Why Connected Components?**

- Natural grouping of transitively similar items
- Single-linkage clustering (A~B, B~C ⇒ A~C in same cluster)
- Efficient graph algorithms (Union-Find)

**Example:**

```
Candidate pairs from LSH (threshold = 0.7):
  (A, B): 0.85
  (B, C): 0.75
  (D, E): 0.80
  (E, F): 0.72

Build adjacency graph:
  A -- B -- C

  D -- E -- F

Find connected components:
  Cluster 1: {A, B, C}
  Cluster 2: {D, E, F}

Assign cluster_id = smallest node:
  Cluster 1: cluster_id = A
  Cluster 2: cluster_id = D
```

**Code Reference:**

```typescript
// packages/parsers/src/services/clustering-engine.ts
function findConnectedComponents(edges: Array<[string, string]>): Map<string, string[]> {
  const uf = new UnionFind();

  // Union all connected nodes
  for (const [a, b] of edges) {
    uf.union(a, b);
  }

  // Group by root
  const clusters = new Map<string, string[]>();
  for (const node of uf.getAllNodes()) {
    const root = uf.find(node);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(node);
  }

  return clusters;
}
```

### Jaccard Similarity Deep Dive

**Why Jaccard?**

- Simple, efficient (O(n) for sets)
- Works well for text with high term overlap
- Normalized to [0, 1]
- Symmetric: J(A,B) = J(B,A)

**Example:**

```
Doc A: "machine learning models neural networks"
Doc B: "deep learning neural networks models"

Tokens A: {machine, learning, models, neural, networks}
Tokens B: {deep, learning, neural, networks, models}

Intersection: {learning, models, neural, networks} = 4 tokens
Union: {machine, learning, models, neural, networks, deep} = 6 tokens

Jaccard = 4/6 = 0.667

Interpretation: 66.7% similar (moderate overlap)
```

**Compared to other metrics:**

| Metric      | Formula         | Pros            | Cons                        |
| ----------- | --------------- | --------------- | --------------------------- |
| Jaccard     | \|A∩B\|/\|A∪B\| | Simple, fast    | Ignores frequency           |
| Cosine      | A·B/(‖A‖‖B‖)    | Frequency-aware | Not normalized for set diff |
| Levenshtein | EditDist(A,B)   | Character-level | Slow O(mn)                  |

**Code Reference:**

```typescript
// packages/parsers/src/utils/fingerprint.ts
export function jaccard(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}
```

---

## Part 6: Performance Characteristics

### Time Complexity

| Operation               | Complexity  | Notes                       |
| ----------------------- | ----------- | --------------------------- |
| File read               | O(n)        | n = file size               |
| JSON parse              | O(n)        | n = chars                   |
| Normalize conversations | O(c×m)      | c = convos, m = msgs/convo  |
| TF-IDF extraction       | O(m×t)      | m = msgs, t = avg tokens    |
| Co-occurrence matrix    | O(m×k²)     | k = keywords                |
| Clustering              | O(c²×log c) | c = clusters (target count) |
| Message assignment      | O(m×c×k)    | assign m msgs to c clusters |
| Segment extraction      | O(m)        | linear scan                 |
| Stitching by_title      | O(s×c)      | s = segments, c = seeds     |
| Duplicate detection     | O(m²)       | pairwise comparison (BAD)   |
| Code extraction         | O(m×l)      | l = avg msg length          |
| Database writes         | O(n+e)      | n = nodes, e = edges        |

**Bottlenecks:**

1. **Duplicate detection** is O(n²) - needs optimization for large imports
2. **Clustering** can be slow for high target counts
3. **Database writes** - batched via `DatabaseWriteQueue` for perf

### Space Complexity

| Structure            | Size     | Notes                   |
| -------------------- | -------- | ----------------------- |
| Parsed conversations | O(c×m×l) | l = avg msg length      |
| TF-IDF scores        | O(k)     | k = keywords (100)      |
| Co-occurrence matrix | O(k²)    | symmetric matrix        |
| Groups               | O(g×m)   | g = groups, m = members |
| Duplicate candidates | O(d)     | d = duplicate pairs     |
| Database nodes       | O(n)     | n = total entities      |
| Database edges       | O(e)     | e = relationships       |

**Memory-Intensive Operations:**

- Co-occurrence matrix (100×100 = 10K entries)
- Duplicate detection (storing all pairs)
- Large conversations (100+ messages per convo)

---

## Part 7: Actual Implementation Status

### What's ACTUALLY Running (Server) ✅

1. **MinHash LSH (128 permutations)** - Fast fuzzy duplicate detection
2. **Multi-level Clustering** - 3-way clustering (sentence×prose, block×prose, block×code)
3. **Evidence-based Deduplication** - Canonical mapping with scoring
4. **Content Breaking** - Hierarchical spans (token → phrase → sentence → block → section)
5. **Signature Generation** - MinHash + TF-IDF + Token Sketch
6. **LSH Banding** - 16 bands × 8 rows for O(1) candidate lookup
7. **Connected Components** - Graph-based cluster formation
8. **Multiple Stitching Strategies** - by_title, by_chat, by_topic all working
9. **Code Block Extraction** - Regex-based, supports multiple languages
10. **Multi-Algorithm Duplicate Detection** - Jaccard, Levenshtein, Cosine implemented
11. **Server Import UI** - Job-based with SSE streaming (`ChatImportModal`)

### What's NOT Running (Browser) ❌

1. **Phase 1-3 Processing in Browser** - `LocalImportService` does NOT run:
   - Content Breaking
   - MinHash signature generation
   - LSH banding
   - Deduplication engine
   - Clustering engine
   - Evidence computation

2. **Local Storage Persistence**
   - Code: `apps/web/src/lib/local-import.ts:277-283`
   - TODO comment: "Implement local storage save using IndexedDB"
   - Currently only prepares result, doesn't persist

3. **Browser Progress Stages**
   - Current: 7 stages (reading → parsing → extracting → deduping → stitching → saving → complete)
   - Missing: Phase 1-3 stages (breaking, signatures, LSH, dedup, clustering)

### What's Dormant (Exists But Not Called) ⚠️

1. **TF-IDF Auto-Grouping Pipeline**
   - Location: `apps/api/src/services/keyword-extractor.ts`
   - Status: Fully implemented, but NOT called by production route
   - Used by: `EnhancedImportServiceV2` (which is NOT used by `/api/v1/import/enhanced`)
   - Reason: Replaced by MinHash LSH + Clustering

2. **Hierarchical Keyword Clustering**
   - Location: `apps/api/src/services/keyword-extractor.ts:183-233`
   - Status: Fully implemented, but NOT called
   - Used by: `EnhancedAutogroupService` (dormant)

3. **Group Nodes with Keywords**
   - Would be created by `EnhancedImportServiceV2.saveToDatabase()`
   - NOT created by production route `processEnhancedImport()`

### What's Stubbed/TODO 🚧

1. **Embedding-Based Similarity**
   - Code: `apps/api/src/services/duplicate-detection.ts:243-251`
   - TODO comment: "Implement embedding-based similarity using ML model"
   - Currently falls back to Jaccard

2. **Bundle Creation**
   - Code: `apps/api/src/services/import-enhanced-v2.ts:470-476`
   - TODO comment: "Implement bundle creation logic"
   - Returns 0 bundles

3. **Browser-Compatible Storage**
   - Phase 1-3 services depend on `better-sqlite3` (Node.js only)
   - Need: `BrowserGroupingStorage` with in-memory Maps or IndexedDB
   - Blocker: Prevents Phase 1-3 from running in browser

### Documentation Accuracy 📝

**NOW DOCUMENTED (This Document):**

1. ✅ MinHash LSH algorithm details
2. ✅ Multi-level clustering approach
3. ✅ Evidence-based scoring system
4. ✅ Server vs. Browser differences
5. ✅ Phase 1-3 processing pipeline

**STILL MISSING:**

1. ❌ Browser implementation roadmap
2. ❌ `BrowserGroupingStorage` design
3. ❌ IndexedDB persistence layer
4. ❌ Frontend integration guide for Phase 1-3

**NO LONGER ACCURATE:**

1. ⚠️ References to TF-IDF grouping as "production" (it's dormant)
2. ⚠️ Claims that `ImportModule` does full processing (it doesn't)
3. ⚠️ Documentation implying browser = server capabilities

---

## Part 8: Data Transformations Flowchart (Server Pipeline)

```
┌──────────────────────────────────┐
│  JSON File (ChatGPT/Claude)      │
└─────────────┬────────────────────┘
              │ StreamingJSONParserV2
              ▼
┌──────────────────────────────────┐
│ ParseResult                      │
│ ├─ conversations: [              │
│ │    conversation_id, title,     │
│ │    messages: [...]             │
│ ]                                │
└─────────────┬────────────────────┘
              │ ContentProcessor.processConversation()
              ▼
┌──────────────────────────────────┐
│ ProcessedContent[]               │
│ ├─ blobs: [                      │
│ │    {blob_id, hash, size}]     │
│ ├─ spans: [                      │
│ │    {node_id, start, end,       │
│ │     granularity, modality}]    │
│ └─ signatures: [                 │
│      {minhash, tfidf, sketch}]   │
└─────────────┬────────────────────┘
              │ GroupingStorage.insert*()
              ▼
┌──────────────────────────────────┐
│ SQLite Storage                   │
│ ├─ blobs                         │
│ ├─ node_spans                    │
│ ├─ node_signatures               │
│ └─ lsh_bands (16 bands × nodes)  │
└─────────────┬────────────────────┘
              │ DeduplicationEngine.deduplicate()
              ▼
┌──────────────────────────────────┐
│ Exact Duplicates                 │
│ ├─ canonical_map:                │
│ │    node_id → canonical_id      │
│ ├─ canonical_stats:              │
│ │    evidence scores, counts     │
│ └─ dup_edges:                    │
│      EXACT_DUP relationships     │
└─────────────┬────────────────────┘
              │ ClusteringEngine.cluster()
              ▼
┌──────────────────────────────────┐
│ Near-Duplicate Clusters          │
│ ├─ cluster_nodes:                │
│ │    {cluster_id, member_count,  │
│ │     algorithm, threshold}      │
│ └─ cluster_edges:                │
│      NEAR_DUP relationships      │
│      (similarity_score)          │
└─────────────┬────────────────────┘
              │ ClusterEvidenceComputer
              ▼
┌──────────────────────────────────┐
│ Evidence Scores                  │
│ - Frequency weight               │
│ - Diversity weight               │
│ - Temporal weight                │
│ - Role weight                    │
│ - Modality weight                │
└─────────────┬────────────────────┘
              │ saveToNeo4j()
              ▼
┌──────────────────────────────────┐
│ Neo4j/SQLite Main Graph          │
│ Nodes:                           │
│  - ChatThread                    │
│  - Message                       │
│  - Source                        │
│  - CodeBlock                     │
│ Edges:                           │
│  - CONTAINS                      │
│  - DERIVES_FROM                  │
│  - DUP_OF                        │
└─────────────┬────────────────────┘
              │ Frontend SSE stream
              ▼
┌──────────────────────────────────┐
│ Keimenon Visualization             │
│ - ChatThreads as nodes           │
│ - Clusters as groups             │
│ - Duplicate edges (dashed)       │
│ - Inspector panel                │
└──────────────────────────────────┘
```

## Part 8b: Browser Pipeline (Current - Limited)

```
┌──────────────────────────────────┐
│  File (Drag & Drop)              │
└─────────────┬────────────────────┘
              │ FileReader.readAsText()
              ▼
┌──────────────────────────────────┐
│ ParseResult                      │
│ (same as server)                 │
└─────────────┬────────────────────┘
              │ extractCodeFromConversations()
              ▼
┌──────────────────────────────────┐
│ CodeAssets[]                     │
│ (regex extraction only)          │
└─────────────┬────────────────────┘
              │ SegmentExtractor.extractAll()
              ▼
┌──────────────────────────────────┐
│ UserSegments[]                   │
│ (filtered by role/length)        │
└─────────────┬────────────────────┘
              │ SourcesStitcher.buildSources()
              ▼
┌──────────────────────────────────┐
│ SourceDocs[]                     │
│ (Jaccard stitching)              │
└─────────────┬────────────────────┘
              │ (NOT IMPLEMENTED)
              ▼
┌──────────────────────────────────┐
│ ❌ Local Storage (IndexedDB)     │
│ (TODO: Needs implementation)     │
└─────────────┬────────────────────┘
              │ Return result
              ▼
┌──────────────────────────────────┐
│ LocalImportResult                │
│ ├─ conversations                 │
│ ├─ sources                       │
│ └─ codeAssets                    │
└──────────────────────────────────┘

❌ Missing: Phase 1-3 processing
❌ Missing: IndexedDB persistence
❌ Missing: MinHash/LSH/Clustering
```

---

## Part 9: Configuration Deep Dive

### Import Configuration Structure

**Type:** `ImportConfiguration` (`packages/types/src/nodes.ts`)

```typescript
interface ImportConfiguration {
  // Source filtering
  sources: {
    scope: 'message' | 'segment' | 'bundle';
    roleFilter: {
      user: boolean;
      ai: boolean;
    };
    minLengthUser: number; // Default: 400
    minLengthAI: number; // Default: varies
    bundling: {
      enabled: boolean;
      maxPerBundle: number; // Default: 10
    };
  };

  // Grouping configuration
  grouping: {
    manual?: Array<{
      name: string;
      keywords: string[];
    }>;
    auto?: {
      enabled: boolean;
      targetGroupCount: number; // Default: 25
      minGroupSize: number; // Default: 2
      createCatchAll: boolean; // Default: true
    };
  };

  // Code extraction
  code: {
    extract: boolean;
    minLength: number; // Default: 50
    languages: string[]; // Default: ['typescript', 'python', ...]
  };

  // Duplicate detection
  duplicates: {
    enabled: boolean;
    exactMatch: boolean;
    similarityThreshold: number; // Default: 0.85
    crossConversation: boolean;
    algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
    normalizeTokens: boolean;
    minTokenOverlap: number; // Default: 5
    lengthRatioTolerance: number; // Default: 0.2
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    ignoreTimestamp: boolean;
    requireReview: boolean;
    autoApproveExact: boolean;
    autoMergeThreshold: number; // Default: 0.95
  };
}
```

**Default Configuration:**

```typescript
// apps/web/src/lib/local-import.ts:51-67
export const DEFAULT_LOCAL_CONFIG: LocalImportConfig = {
  includeUser: true,
  includeAssistant: false,
  minMessageLength: 400,
  processingMode: 'auto', // 'auto' uses by_title stitching
  branches: 'merged',
  extractCode: true,
  codeMinLength: 50,
  codeDeduplicate: true,
  duplicateDetection: {
    enabled: false, // Off by default!
    exactMatch: true,
    similarityThreshold: 0.85,
    crossConversation: true,
    algorithm: 'jaccard',
  },
};
```

### Configuration Effects on Output

**Example 1: User-only, Auto-grouping**

```typescript
Config: {
  includeUser: true,
  includeAssistant: false,
  grouping: { auto: { targetGroupCount: 10 } }
}

Result:
  - ~10 groups (depends on clustering)
  - Only user messages in sources
  - Code blocks NOT extracted (only in AI messages)
  - Groups named by most central keyword
```

**Example 2: Both roles, Manual groups**

```typescript
Config: {
  includeUser: true,
  includeAssistant: true,
  grouping: {
    manual: [
      { name: "React", keywords: ["react", "jsx", "component"] },
      { name: "API", keywords: ["api", "endpoint", "request"] }
    ],
    auto: { enabled: false }
  }
}

Result:
  - Exactly 2 groups (+ catch-all if createCatchAll=true)
  - Manual groups take priority
  - Messages with react/jsx/component → "React" group
  - Messages with api/endpoint/request → "API" group
  - Unmatched → "Other / Uncategorized"
```

**Example 3: Duplicate detection enabled**

```typescript
Config: {
  duplicates: {
    enabled: true,
    algorithm: 'cosine',
    similarityThreshold: 0.90,
    autoApproveExact: true,
    requireReview: true
  }
}

Result:
  - Pairwise comparison runs (slow for large imports)
  - Exact matches (1.0 similarity) auto-resolved as 'keep-primary'
  - Similarities 0.90-0.99 → manual review panel
  - Similarities < 0.90 → ignored
  - Frontend shows DuplicateReviewPanel component
```

---

## Part 10: Key Code Locations Reference

### Backend (API)

| Feature                 | File                                                    | Lines   |
| ----------------------- | ------------------------------------------------------- | ------- |
| Main import service     | `apps/api/src/services/import-enhanced-v2.ts`           | 122-200 |
| TF-IDF extraction       | `apps/api/src/services/keyword-extractor.ts`            | 97-140  |
| Hierarchical clustering | `apps/api/src/services/keyword-extractor.ts`            | 183-233 |
| Auto-grouping           | `apps/api/src/services/autogroup-enhanced.ts`           | 48-143  |
| Duplicate detection     | `apps/api/src/services/duplicate-detection.ts`          | 63-278  |
| Deduplication engine    | `packages/parsers/src/services/deduplication-engine.ts` | 104-144 |

### Parsers (packages)

| Feature            | File                                                | Lines  |
| ------------------ | --------------------------------------------------- | ------ |
| Parser registry    | `packages/parsers/src/parsers/index.ts`             | 10-47  |
| ChatGPT parser     | `packages/parsers/src/parsers/chatgpt.ts`           | -      |
| Claude parser      | `packages/parsers/src/parsers/claude.ts`            | -      |
| Segment extraction | `packages/parsers/src/sources/segment-extractor.ts` | 14-118 |
| Source stitching   | `packages/parsers/src/sources/stitcher.ts`          | 14-150 |
| Jaccard similarity | `packages/parsers/src/utils/fingerprint.ts`         | -      |

### Frontend (Web)

| Feature                | File                                                      | Lines   |
| ---------------------- | --------------------------------------------------------- | ------- |
| Import module          | `apps/web/src/components/keimenon/ImportModule.tsx`       | 69-809  |
| Local import service   | `apps/web/src/lib/local-import.ts`                        | 169-354 |
| Duplicate review panel | `apps/web/src/components/import/DuplicateReviewPanel.tsx` | 22-398  |
| Progress context       | `apps/web/src/contexts/ImportProgressContext.tsx`         | -       |

---

## Part 11: Edge Cases & Special Handling

### 1. Empty Conversations

**Code:** `packages/parsers/src/parsers/chatgpt.ts` (and others)

```typescript
// Skip conversations with no messages
if (conv.messages.length === 0) continue;

// Skip messages with empty content
if (!msg.content || msg.content.trim() === '') continue;
```

### 2. Unicode & Special Characters

**Code:** `apps/api/src/services/keyword-extractor.ts:22-28`

```typescript
// Tokenization handles Unicode
text
  .toLowerCase()
  .replace(/[^\w\s]/g, ' ') // Removes punctuation, keeps Unicode letters
  .split(/\s+/)
  .filter((token) => token.length > 2);
```

**Issue:** Regex `\w` may not catch all Unicode chars correctly in JavaScript
**Solution:** Consider using `XRegExp` or Unicode-aware tokenizers for i18n

### 3. Very Large Files (>100MB)

**Code:** `apps/web/src/lib/local-import.ts:181-199`

```typescript
// FileReader loads entire file into memory (potential OOM)
reader.readAsText(file);

// No streaming support currently
```

**Issue:** Browser memory limits (~2GB)
**Solution:** Needs streaming JSON parser for very large files

### 4. Duplicate Conversations (Same Title)

**Code:** `packages/parsers/src/sources/stitcher.ts:130-142`

```typescript
// Title normalization
function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

// Conversations with same title → same bucket
```

**Effect:** "New Chat" appears in many exports → all merged into one giant source

### 5. Code Blocks Without Language

**Code:** `apps/api/src/services/import-enhanced-v2.ts:404-406`

````typescript
const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
const language = match[1] || 'text'; // Default to 'text'
````

**Effect:** Unlabeled code blocks saved as 'text' language

### 6. Circular References in Conversations

**Code:** Platform parsers handle by ignoring

**Effect:** Some exports have non-tree structures (e.g., branching conversations)
**Current:** Each branch treated as separate message sequence

### 7. Missing Timestamps

**Code:** `packages/parsers/src/parsers/generic.ts`

```typescript
// Fallback to index-based timestamps
timestamp: msg.timestamp || Date.now() - (messages.length - idx) * 1000;
```

**Effect:** Relative ordering preserved, absolute times may be wrong

### 8. Extremely Long Messages (>1MB)

**Code:** `packages/parsers/src/sources/segment-extractor.ts:46-50`

```typescript
// No hard limit enforced
if (combinedContent.length < minChars) continue;
```

**Issue:** Very long messages (entire docs pasted) can cause:

- Tokenization slowdown
- Memory issues
- Poor TF-IDF scores (document too large)

**Solution:** Consider max length cap or chunking

---

## Part 12: Testing & Verification

### What's Tested

**Unit Tests:**

- `packages/parsers/src/services/__tests__/deduplication.test.ts` - Deduplication engine
- `packages/types/src/navigation.model.test.ts` - Navigation models
- `apps/web/src/components/keimenon/ImportsTableCard.test.tsx` - UI component
- `apps/web/src/components/settings/UsersListCard.test.tsx` - Settings UI

**Integration Tests:**

- `apps/api/src/__tests__/import-enhanced.test.ts` - Full import pipeline
- `apps/api/src/__tests__/e2e-import-workflow.test.ts` - End-to-end workflow

### What's NOT Tested

1. TF-IDF keyword extraction (no tests found)
2. Hierarchical clustering (no tests found)
3. Auto-grouping service (no tests found)
4. Duplicate detection algorithms (no tests found)
5. Jaccard similarity edge cases
6. Large file handling (performance/memory tests)
7. Unicode/i18n tokenization
8. Frontend import UI (no component tests)

---

## Conclusion

### The Real Production System (Server)

The import system uses **MinHash LSH + Multi-level Clustering**, NOT TF-IDF keyword grouping:

1. **Platform Detection** - Auto-detects ChatGPT, Claude, Gemini formats
2. **Content Breaking** - Hierarchical spans (token → phrase → sentence → block → section)
3. **MinHash Signatures** - 128 permutations for fast Jaccard approximation
4. **LSH Banding** - 16 bands × 8 rows for O(1) candidate lookup
5. **Exact Deduplication** - SHA-256 fingerprinting with canonical mapping
6. **Near-Duplicate Clustering** - Connected components on LSH candidates
7. **Evidence Scoring** - Frequency, diversity, temporal, role, modality weights
8. **Multi-Algorithm Duplicate Detection** - Jaccard/Levenshtein/Cosine
9. **Source Stitching** - by_title, by_chat, by_topic strategies
10. **Code Extraction** - Regex-based with deduplication

**Key Strengths:**

- ✅ O(1) candidate generation (LSH vs. O(n²) pairwise)
- ✅ Non-destructive deduplication (evidence-based)
- ✅ Multi-level clustering (3-way: sentence/block × prose/code)
- ✅ Provably accurate Jaccard approximation
- ✅ Scales to millions of documents

**Key Weaknesses:**

- ❌ Browser does NOT have Phase 1-3 processing
- ❌ No streaming for very large files (>100MB)
- ❌ Embedding similarity not implemented
- ❌ IndexedDB persistence not implemented (browser)
- ❌ Better-sqlite3 dependency prevents browser use

### Browser Limitations

**Current:** `LocalImportService` does BASIC processing only:

- ✅ Parsing + Code extraction + Stitching
- ❌ NO Content Breaking
- ❌ NO MinHash signatures
- ❌ NO LSH banding
- ❌ NO Deduplication engine
- ❌ NO Clustering engine

**Reason:** Phase 1-3 services depend on `better-sqlite3` (Node.js native module)

**Solution:** Create `BrowserGroupingStorage` with in-memory Maps or IndexedDB

### Documentation Status

**NOW ACCURATE (This Document):**

- ✅ MinHash LSH algorithm explained
- ✅ Multi-level clustering documented
- ✅ Evidence scoring formula provided
- ✅ Server vs. Browser differences clarified
- ✅ Phase 1-3 pipeline detailed

**DORMANT CODE (Exists But Not Used):**

- ⚠️ TF-IDF keyword extraction (`keyword-extractor.ts`)
- ⚠️ Hierarchical keyword clustering (`keyword-extractor.ts:183-233`)
- ⚠️ `EnhancedImportServiceV2` (replaced by `processEnhancedImport()`)

**NEXT STEPS:**

1. Implement `BrowserGroupingStorage` (in-memory Maps)
2. Wire Phase 1-3 to `LocalImportService`
3. Add IndexedDB persistence
4. Update `ImportModule` UI with new stages

---

**Generated:** 2025-10-23 (Updated)
**By:** Claude Code Deep Dive Analysis
**Based on:** Actual source code inspection + verification testing
**Status:** ✅ Accurate as of Oct 2025 - Reflects production reality
