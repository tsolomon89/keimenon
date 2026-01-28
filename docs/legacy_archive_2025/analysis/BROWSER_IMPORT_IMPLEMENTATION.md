# Browser Import Implementation Roadmap

**Date:** 2025-10-23
**Purpose:** Plan for bringing full Phase 1-3 processing to browser (`LocalImportService`)
**Goal:** Achieve server parity for local-first import without uploading data

---

## Problem Statement

**Current State:**

- **Server** (`/api/v1/import/enhanced`): Full Phase 1-3 processing (MinHash LSH + Clustering)
- **Browser** (`LocalImportService`): Basic processing only (parsing + stitching, NO Phase 1-3)

**Gap:** Browser users get ~10% of server processing capability.

**Blocker:** Phase 1-3 services depend on `better-sqlite3` (Node.js native module, won't run in browser)

---

## Solution: Browser-Compatible Storage Layer

### Approach

Replace `better-sqlite3` with **in-memory Maps** or **IndexedDB** while keeping the same interface.

**Key Insight:** Phase 1-3 services (`ContentProcessor`, `DeduplicationEngine`, `ClusteringEngine`) are already storage-agnostic - they accept a storage interface. We just need a browser-compatible implementation.

---

## Phase 1: Create BrowserGroupingStorage (2-3 hours)

### File: `packages/parsers/src/services/browser-storage.ts`

**Implementation:**

```typescript
/**
 * Browser-compatible storage for Phase 1-3 processing
 * Uses in-memory Maps instead of SQLite
 */

import { Blob, NodeSpan, NodeSignature } from './content-processor';
import { LshBandRecord, Cluster, ClusterMember } from './grouping-storage';

export class BrowserGroupingStorage {
  // In-memory storage
  private blobs = new Map<string, Blob>();
  private nodeSpans = new Map<string, NodeSpan[]>();
  private nodeSignatures = new Map<string, NodeSignature>();
  private lshBands = new Map<string, string[]>(); // band_hash → [node_ids]
  private canonicalMap = new Map<string, string>();
  private canonicalStats = new Map<string, any>();
  private clusterNodes = new Map<string, Cluster>();
  private clusterMembers = new Map<string, ClusterMember[]>();
  private clusterEdges: Array<[string, string, number]> = []; // [from, to, score]

  constructor() {
    // No initialization needed for Maps
  }

  // ==================== Blobs ====================

  insertBlob(blob: Blob): void {
    this.blobs.set(blob.hash, blob);
  }

  getBlob(blobId: string): Blob | null {
    return this.blobs.get(blobId) || null;
  }

  getAllBlobs(dataTag?: string): Blob[] {
    const all = Array.from(this.blobs.values());
    return dataTag ? all.filter((b) => b.data_tag === dataTag) : all;
  }

  // ==================== Node Spans ====================

  insertNodeSpan(span: NodeSpan): void {
    const existing = this.nodeSpans.get(span.node_id) || [];
    existing.push(span);
    this.nodeSpans.set(span.node_id, existing);
  }

  insertNodeSpans(spans: NodeSpan[]): void {
    for (const span of spans) {
      this.insertNodeSpan(span);
    }
  }

  getNodeSpans(nodeId: string): NodeSpan[] {
    return this.nodeSpans.get(nodeId) || [];
  }

  getAllNodeSpans(granularity?: string, modality?: string): NodeSpan[] {
    const all = Array.from(this.nodeSpans.values()).flat();
    return all.filter(
      (span) =>
        (!granularity || span.granularity === granularity) &&
        (!modality || span.modality === modality)
    );
  }

  // ==================== Node Signatures ====================

  insertNodeSignature(signature: NodeSignature): void {
    this.nodeSignatures.set(signature.node_id, signature);
  }

  insertNodeSignatures(signatures: NodeSignature[]): void {
    for (const sig of signatures) {
      this.insertNodeSignature(sig);
    }
  }

  getNodeSignature(nodeId: string): NodeSignature | null {
    return this.nodeSignatures.get(nodeId) || null;
  }

  getAllNodeSignatures(granularity?: string, modality?: string): NodeSignature[] {
    const all = Array.from(this.nodeSignatures.values());
    return all.filter(
      (sig) =>
        (!granularity || sig.granularity === granularity) &&
        (!modality || sig.modality === modality)
    );
  }

  // ==================== LSH Bands ====================

  insertLshBand(band: LshBandRecord): void {
    const existing = this.lshBands.get(band.band_hash) || [];
    if (!existing.includes(band.node_id)) {
      existing.push(band.node_id);
      this.lshBands.set(band.band_hash, existing);
    }
  }

  insertLshBands(bands: LshBandRecord[]): void {
    for (const band of bands) {
      this.insertLshBand(band);
    }
  }

  getNodesForBand(bandHash: string): string[] {
    return this.lshBands.get(bandHash) || [];
  }

  getAllLshBands(): Map<string, string[]> {
    return new Map(this.lshBands);
  }

  // ==================== Canonical Map ====================

  insertCanonicalMapping(nodeId: string, canonicalId: string): void {
    this.canonicalMap.set(nodeId, canonicalId);
  }

  getCanonical(nodeId: string): string | null {
    return this.canonicalMap.get(nodeId) || null;
  }

  getAllCanonicalMappings(): Map<string, string> {
    return new Map(this.canonicalMap);
  }

  // ==================== Canonical Stats ====================

  upsertCanonicalStats(stats: any): void {
    this.canonicalStats.set(stats.canonical_node_id, stats);
  }

  getCanonicalStats(canonicalId: string): any | null {
    return this.canonicalStats.get(canonicalId) || null;
  }

  // ==================== Clusters ====================

  insertClusterNode(cluster: Cluster): void {
    this.clusterNodes.set(cluster.cluster_id, cluster);
  }

  insertClusterMember(member: ClusterMember): void {
    const existing = this.clusterMembers.get(member.cluster_id) || [];
    existing.push(member);
    this.clusterMembers.set(member.cluster_id, existing);
  }

  insertClusterEdge(from: string, to: string, score: number): void {
    this.clusterEdges.push([from, to, score]);
  }

  getCluster(clusterId: string): Cluster | null {
    return this.clusterNodes.get(clusterId) || null;
  }

  getClusterMembers(clusterId: string): ClusterMember[] {
    return this.clusterMembers.get(clusterId) || [];
  }

  getAllClusters(): Cluster[] {
    return Array.from(this.clusterNodes.values());
  }

  // ==================== Utility ====================

  clear(): void {
    this.blobs.clear();
    this.nodeSpans.clear();
    this.nodeSignatures.clear();
    this.lshBands.clear();
    this.canonicalMap.clear();
    this.canonicalStats.clear();
    this.clusterNodes.clear();
    this.clusterMembers.clear();
    this.clusterEdges = [];
  }

  getStats(): {
    blobs: number;
    spans: number;
    signatures: number;
    lshBands: number;
    canonicalMappings: number;
    clusters: number;
    clusterMembers: number;
    clusterEdges: number;
  } {
    return {
      blobs: this.blobs.size,
      spans: Array.from(this.nodeSpans.values()).reduce((sum, arr) => sum + arr.length, 0),
      signatures: this.nodeSignatures.size,
      lshBands: this.lshBands.size,
      canonicalMappings: this.canonicalMap.size,
      clusters: this.clusterNodes.size,
      clusterMembers: Array.from(this.clusterMembers.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
      clusterEdges: this.clusterEdges.length,
    };
  }
}
```

**Lines:** ~200 (including comments)
**Dependencies:** None (pure JavaScript)

---

## Phase 2: Export from browser.ts (5 minutes)

### File: `packages/parsers/src/browser.ts`

**Add exports:**

```typescript
// Browser-safe storage
export { BrowserGroupingStorage } from './services/browser-storage';

// Phase 1-3 services (now browser-compatible!)
export {
  ContentProcessor,
  createContentProcessor,
  processText,
  DeduplicationEngine,
  createDeduplicationEngine,
  ClusteringEngine,
  createClusteringEngine,
  ClusterEvidenceComputer,
  createClusterEvidenceComputer,
} from './services';
```

---

## Phase 3: Wire to LocalImportService (1-2 hours)

### File: `apps/web/src/lib/local-import.ts`

**Add imports:**

```typescript
import {
  ParserRegistry,
  SegmentExtractor,
  SourcesStitcher,
  extractCodeBlocks,
  codeBlocksToAssets,
  deduplicateCodeAssets,
  // NEW: Phase 1-3 services
  ContentProcessor,
  BrowserGroupingStorage,
  DeduplicationEngine,
  ClusteringEngine,
  ClusterEvidenceComputer,
  type ParseResult,
  type NormalizedConversation,
  type SourceDoc,
  type CodeAsset,
  type ImportConfig,
} from '@keimenon/parsers/browser';
```

**Add new progress stages:**

```typescript
export interface LocalImportProgress {
  stage:
    | 'reading'
    | 'parsing'
    | 'extracting'
    | 'stitching'
    | 'breaking' // NEW: Phase 1
    | 'signatures' // NEW: Phase 2
    | 'deduping' // NEW: Phase 3a
    | 'clustering' // NEW: Phase 3b
    | 'saving'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  message: string;
  detail?: string;
}
```

**Add Phase 1-3 processing:**

```typescript
async importFile(file: File, config: LocalImportConfig): Promise<LocalImportResult> {
  const startTime = Date.now();

  try {
    // ... existing code (reading, parsing, code extraction, stitching) ...

    // Stage 4: Build source documents (existing)
    // ...

    // ===== NEW: Phase 1-3 Processing =====

    // Phase 1: Content Breaking
    this.reportProgress('breaking', 82, 'Breaking content into spans...');

    const processor = new ContentProcessor({
      extractTokens: false,
      extractPhrases: false,
      extractSentences: true,
      extractBlocks: true,
      extractSections: true,
      generateSignatures: true,
      minHashPermutations: 128,
    });

    const storage = new BrowserGroupingStorage();
    let spansCreated = 0;

    for (const conv of parseResult.conversations) {
      const processedMessages = await processor.processConversation({
        conversation_id: conv.conversation_id,
        title: conv.title,
        platform: conv.platform,
        created_at: conv.create_time,
        messages: conv.messages.map((msg, idx) => ({
          index: idx,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          hash: `hash_${conv.conversation_id}_${idx}`,
        })),
        metadata: {},
      });

      for (const processed of processedMessages) {
        storage.insertBlob(processed.blob);
        storage.insertNodeSpans(processed.spans);
        storage.insertNodeSignatures(processed.signatures);
        spansCreated += processed.spans.length;

        // Insert LSH bands
        for (const signature of processed.signatures) {
          if (signature.minhash_bands) {
            const bands = signature.minhash_bands.map((bandHash, bandIndex) => ({
              band_hash: bandHash,
              band_index: bandIndex,
              node_id: signature.node_id,
              created_at: signature.created_at,
              data_tag: 'browser',
            }));
            storage.insertLshBands(bands);
          }
        }
      }
    }

    this.reportProgress('breaking', 85, 'Content breaking complete',
      `Created ${spansCreated} spans`
    );

    // Phase 3a: Exact Deduplication
    this.reportProgress('deduping', 88, 'Finding exact duplicates...');

    const deduper = new DeduplicationEngine(storage as any); // Type cast for now
    const dedupResult = await deduper.deduplicate();

    this.reportProgress('deduping', 91, 'Deduplication complete',
      `Found ${dedupResult.canonical_nodes.length} canonical groups`
    );

    // Phase 3b: Near-Duplicate Clustering
    this.reportProgress('clustering', 93, 'Clustering similar content...');

    const clusterer = new ClusteringEngine(storage as any, undefined);

    let totalClusters = 0;
    try {
      const sentenceResult = await clusterer.cluster('sentence', 'prose');
      totalClusters += sentenceResult.stats.total_clusters || 0;

      const blockResult = await clusterer.cluster('block', 'prose');
      totalClusters += blockResult.stats.total_clusters || 0;
    } catch (error) {
      console.warn('Clustering warning:', error);
    }

    this.reportProgress('clustering', 96, 'Clustering complete',
      `Created ${totalClusters} clusters`
    );

    // Compute evidence scores
    const evidenceComputer = new ClusterEvidenceComputer(storage as any, undefined);
    evidenceComputer.computeAllEvidence();

    // ===== END Phase 1-3 Processing =====

    // Stage 5: Save to IndexedDB (optional)
    this.reportProgress('saving', 97, 'Saving to local storage...');

    // TODO: Implement IndexedDB persistence
    // For now, just keep in memory

    this.reportProgress('saving', 99, 'Save complete');

    // Stage 6: Build result
    const processingTimeMs = Date.now() - startTime;

    this.reportProgress('complete', 100, 'Import complete!',
      `Processed in ${(processingTimeMs / 1000).toFixed(1)}s`
    );

    const result: LocalImportResult = {
      success: true,
      conversations: parseResult.conversations.map(conv => ({
        id: conv.conversation_id,
        title: conv.title,
        platform: conv.platform,
        messageCount: conv.messages.length,
      })),
      sources,
      codeAssets,
      stats: {
        totalConversations: parseResult.stats.total_conversations,
        totalMessages: parseResult.stats.total_messages,
        totalSources: sources.length,
        totalCodeBlocks: codeAssets.length,
        userMessages: parseResult.stats.user_messages,
        assistantMessages: parseResult.stats.assistant_messages,
        processingTimeMs,
        // NEW: Phase 1-3 stats
        spansCreated,
        exactDuplicates: dedupResult.canonical_nodes.length,
        clusters: totalClusters,
      },
    };

    return result;

  } catch (error: any) {
    this.reportProgress('error', 0, 'Import failed', error.message);
    // ... error handling ...
  }
}
```

---

## Phase 4: Update ImportModule UI (30 minutes)

### File: `apps/web/src/components/keimenon/ImportModule.tsx`

**Update STEP_ORDER:**

```typescript
const STEP_ORDER: LocalImportProgress['stage'][] = [
  'reading',
  'parsing',
  'extracting',
  'stitching',
  'breaking', // NEW
  'deduping', // Updated (was code dedup, now full dedup)
  'clustering', // NEW
  'saving',
  'complete',
];
```

**Update stage labels:**

```typescript
const getStageLabel = (stage: LocalImportProgress['stage']): string => {
  switch (stage) {
    case 'reading':
      return 'Reading File';
    case 'parsing':
      return 'Parsing Conversations';
    case 'extracting':
      return 'Extracting Code';
    case 'stitching':
      return 'Stitching Sources';
    case 'breaking':
      return 'Breaking Content'; // NEW
    case 'deduping':
      return 'Finding Duplicates'; // Updated
    case 'clustering':
      return 'Clustering Content'; // NEW
    case 'saving':
      return 'Saving Results';
    case 'complete':
      return 'Complete';
    case 'error':
      return 'Error';
  }
};
```

**Update progress weights:**

```typescript
const getProgressWeight = (stage: LocalImportProgress['stage']): number => {
  switch (stage) {
    case 'reading':
      return 10; // 0-10%
    case 'parsing':
      return 20; // 10-30%
    case 'extracting':
      return 15; // 30-45%
    case 'stitching':
      return 20; // 45-65%
    case 'breaking':
      return 10; // 65-75% (NEW)
    case 'deduping':
      return 8; // 75-83% (NEW)
    case 'clustering':
      return 7; // 83-90% (NEW)
    case 'saving':
      return 5; // 90-95%
    case 'complete':
      return 5; // 95-100%
    default:
      return 0;
  }
};
```

---

## Phase 5: Testing (1 hour)

### Test Cases

**1. Small Import (10 messages)**

```bash
# Expected: <1s processing time, <10MB memory
# Verify: All stages complete successfully
```

**2. Medium Import (100 messages)**

```bash
# Expected: <5s processing time, <50MB memory
# Verify: Clustering finds meaningful groups
```

**3. Large Import (1000 messages)**

```bash
# Expected: <30s processing time, <100MB memory
# Verify: LSH optimization works (not O(n²))
```

**4. Duplicate Detection**

```bash
# Expected: Finds exact duplicates
# Expected: Finds near-duplicates with >0.7 similarity
```

**5. Code Clustering**

```bash
# Expected: Groups similar code blocks
# Expected: Separates prose from code
```

### Performance Benchmarks

| Metric            | Target | Acceptable | Unacceptable |
| ----------------- | ------ | ---------- | ------------ |
| 100 messages      | <5s    | <10s       | >15s         |
| 1000 messages     | <30s   | <60s       | >120s        |
| 10K messages      | <5min  | <10min     | >15min       |
| Memory (100 msgs) | <50MB  | <100MB     | >200MB       |
| Memory (1K msgs)  | <100MB | <200MB     | >500MB       |

---

## Phase 6: IndexedDB Persistence (Optional - 8-12 hours)

### File: `apps/web/src/lib/indexeddb-storage.ts`

**Schema:**

```typescript
// IndexedDB schema
const DB_NAME = 'keimenon-local';
const DB_VERSION = 1;

const STORES = {
  blobs: 'blobs',
  node_spans: 'node_spans',
  node_signatures: 'node_signatures',
  lsh_bands: 'lsh_bands',
  canonical_map: 'canonical_map',
  canonical_stats: 'canonical_stats',
  cluster_nodes: 'cluster_nodes',
  cluster_members: 'cluster_members',
  cluster_edges: 'cluster_edges',
};
```

**Wrapper:**

```typescript
export class IndexedDBGroupingStorage extends BrowserGroupingStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    // Open IndexedDB connection
    // Create object stores if needed
  }

  async persistToIndexedDB(): Promise<void> {
    // Write all in-memory Maps to IndexedDB
  }

  async loadFromIndexedDB(): Promise<void> {
    // Load all data from IndexedDB into Maps
  }

  async clear(): Promise<void> {
    super.clear();
    // Also clear IndexedDB
  }
}
```

---

## Performance Optimization Tips

### 1. Lazy Evaluation

Only run Phase 1-3 if user enables "Advanced Processing" toggle in UI

### 2. Web Workers

Move Phase 1-3 processing to Web Worker to keep UI responsive

```typescript
// apps/web/src/workers/import-worker.ts
self.addEventListener('message', async (event) => {
  const { conversations, config } = event.data;

  // Run Phase 1-3 in worker
  const storage = new BrowserGroupingStorage();
  const processor = new ContentProcessor(config);

  // ... process ...

  self.postMessage({ success: true, storage: storage.getStats() });
});
```

### 3. Incremental Processing

Process conversations in batches of 100 to avoid memory spikes

### 4. Memory Cleanup

Clear intermediate data structures after each phase

---

## Migration Path

### Option 1: Feature Flag (Recommended)

```typescript
// In LocalImportConfig
interface LocalImportConfig {
  // ...existing fields...
  advancedProcessing: boolean; // Default: false
}
```

**Benefits:**

- Gradual rollout
- Easy A/B testing
- Fallback if issues arise

### Option 2: Separate Component

Create `AdvancedImportModule.tsx` alongside existing `ImportModule.tsx`

**Benefits:**

- No risk to existing functionality
- Clear separation of concerns

### Option 3: Automatic Detection

Enable Phase 1-3 only if file size < 10MB or messages < 1000

**Benefits:**

- Transparent to user
- Performance-based decision

---

## Success Metrics

### Functional

- ✅ Browser achieves same deduplication quality as server
- ✅ Browser achieves same clustering quality as server
- ✅ All tests pass

### Performance

- ✅ <5s for 100 messages
- ✅ <30s for 1000 messages
- ✅ <100MB memory for 1000 messages

### User Experience

- ✅ Progress bar updates smoothly (no freezing)
- ✅ UI remains responsive during processing
- ✅ Clear error messages if OOM

---

## Risks & Mitigations

| Risk                            | Impact | Probability | Mitigation                                   |
| ------------------------------- | ------ | ----------- | -------------------------------------------- |
| Browser OOM on large imports    | High   | Medium      | Add file size limits, incremental processing |
| Performance worse than server   | Medium | Low         | Profile and optimize hot paths               |
| IndexedDB quota exceeded        | Medium | Low         | Prompt user to clear old data                |
| Web Worker compatibility issues | Low    | Low         | Feature detect, fallback to main thread      |

---

## Timeline Estimate

| Phase                         | Effort     | Dependencies | Deliverable        |
| ----------------------------- | ---------- | ------------ | ------------------ |
| 1. BrowserGroupingStorage     | 2-3 hours  | None         | ~200 lines of code |
| 2. Export from browser.ts     | 5 minutes  | Phase 1      | 5 lines of code    |
| 3. Wire to LocalImportService | 1-2 hours  | Phase 2      | ~100 lines of code |
| 4. Update ImportModule UI     | 30 minutes | Phase 3      | ~20 lines of code  |
| 5. Testing                    | 1 hour     | Phase 4      | Test suite         |
| 6. IndexedDB (optional)       | 8-12 hours | Phase 5      | ~300 lines of code |

**Total:** 4-6 hours (without IndexedDB), 12-18 hours (with IndexedDB)

---

## Next Steps

1. ✅ **Phase 1 (Documentation)** - DONE
2. ⏳ **Phase 2 (BrowserGroupingStorage)** - Implement in-memory storage
3. ⏳ **Phase 3 (Wire to LocalImportService)** - Add Phase 1-3 stages
4. ⏳ **Phase 4 (Update UI)** - Add progress stages
5. ⏳ **Phase 5 (Testing)** - Verify performance

---

**Author:** Claude Code Analysis
**Date:** 2025-10-23
**Status:** Ready for implementation
