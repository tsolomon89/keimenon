# Phase 3 Progress: Clustering Engine with J+MD

## Status: In Progress (35% Complete)

### ✅ Completed Components

#### 1. **Policy System** ([packages/types/src/policy.ts](../packages/types/src/policy.ts))

Complete admin-configurable policy system with:

- Gray-band thresholds per (level × modality)
  - attach, review_lower, reject_below for prose/code/math/json/markdown
- Clustering overlap policy (exclusive_per_slice, review_epsilon)
- Temporal treatment (use_in_membership, decay_halflife_days)
- Evidence weights (freq, diversity, role, temporal, modality, coherence)
- Tokenization settings (prose/code/math)
- Tie-break rules (score, nodekey, timestamp, contentid)
- Publishing settings (edges_only export)

**Key Features**:

- No hard-coded constants
- Full validation with helpful error messages
- Policy signature computation (SHA-256 of canonical JSON)
- Default policy ships with repo

#### 2. **Policy Loader** ([packages/types/src/policy-loader.ts](../packages/types/src/policy-loader.ts))

YAML-based policy loading with:

- Load from file or string
- Deep merge with defaults
- Validation on load
- Automatic signature computation
- Policy diff computation (for Admin UI)
- Save/export capabilities
- JSON import/export for manifest bundling

#### 3. **Default Policy YAML** ([policy.yaml](../policy.yaml))

Complete default policy with sensible thresholds:

- **Prose**: attach=0.88, review=0.75, reject=0.60
- **Code**: attach=0.92, review=0.80, reject=0.65 (stricter)
- **Math**: attach=0.90, review=0.78, reject=0.63
- **JSON**: attach=0.95, review=0.85, reject=0.70 (strictest)
- **Markdown**: attach=0.88, review=0.75, reject=0.60

**Evidence weights**:

- Frequency: 50%
- Diversity: 30%
- Role: 10%
- Temporal: 5%
- Modality: 5%
- Coherence: 20% (for clusters)

#### 4. **ChatRecord Type** ([packages/types/src/chat-record.ts](../packages/types/src/chat-record.ts))

J+MD surface definition:

- `raw_text`: Verbatim original
- `md`: Normalized CommonMark+GFM
- `md_norm_sha256`: Deterministic hash
- `islands`: Code/math blocks with coordinates
- Type-safe island detection (code vs math)

#### 5. **J+MD Processor** ([packages/parsers/src/services/jmd-processor.ts](../packages/parsers/src/services/jmd-processor.ts))

ChatRecord integration with:

- Convert NormalizedMessage → ChatRecord
- Detect code islands (fenced blocks, inline code)
- Detect math islands (display math $$, inline math $)
- Map existing node spans to md_char_start/end
- Provenance tracking (raw_text coordinates)
- Island containment checking
- Batch conversion support

**Island Detection**:

- Fenced code blocks: ` ```lang\n...\n``` `
- Inline code: `` `...` ``
- Display math: `$$...$$`
- Inline math: `$...$`

### 🔨 In Progress

None currently (session ended).

### ⏳ Remaining Work (65%)

#### 6. **Migration 005** - Clustering Schema

Tables to add:

- `chat_records` (id, conversation_id, role, raw_text, md, md_norm_sha256, islands, timestamp)
- `jmd_span_mappings` (node_id, chat_record_id, md_char_start, md_char_end, raw_text_start, raw_text_end, island_index)
- `cluster_evidence` (cluster_id, coherence_score, aggregate_evidence, member_count, ...)
- `cluster_decisions` (decision_id, node_id, cluster_id, score, threshold, decision, reason_code, timestamp)
- `review_queue` (queue_id, node_id, candidates, scores, reason, created_at, reviewed_at, decision)

Schema updates:

- Add `md_char_start`, `md_char_end`, `md_norm_sha256` to `node_spans`

#### 7. **Clustering Engine Core**

- LSH band candidate generation
- Pairwise similarity scoring (MinHash + TF-IDF + token overlap)
- Policy-driven decisions (attach/review/reject)
- Exclusive membership per slice enforcement
- Gray-band review queue population
- Deterministic tie-breaking
- Reason code generation

#### 8. **NEAR_DUP Edge Creation**

- Score calculation ∈ (0,1)
- Reason codes: `TOK_OVERLAP@p3`, `BLOCK_MATCH@code`, `ORDER_COHE@sent`
- Edge metadata: shared spans, top tokens, modality features
- Many-to-many edges (independent of membership)

#### 9. **Cluster Evidence System**

- Roll-up Phase-2 instance evidence
- Compute cluster coherence (avg edge scores)
- Monotone combination with policy weights
- Update on membership changes

#### 10. **Decision Audit Log**

- Record all attach/review/reject decisions
- Log: node_id, candidates, scores, threshold, decision, reason_code
- Idempotency verification (checksums)
- Replay capability for debugging
- Tie-break path tracking

#### 11. **Edges-Only Export**

- Hash node IDs (SHA-256)
- Export format: hashed_from, hashed_to, score, reason_code
- No plaintext content
- Versioned snapshots (keep last N)
- Manifest bundling with policy signature

#### 12. **Tests**

- Policy validation tests
- J+MD conversion tests
- Island detection tests
- Span mapping tests
- Clustering determinism tests
- Gray-band decision tests
- Exclusive membership tests
- Audit log replay tests

#### 13. **Documentation**

- Update GROUPING_ENGINE_USAGE.md with J+MD
- Add clustering workflow guide
- Document reason codes
- Add policy.yaml schema reference
- Gray-band review workflow examples
- Admin UI integration guide

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Policy System                            │
├─────────────────────────────────────────────────────────────┤
│  policy.yaml → PolicyLoader → ClusteringPolicy (signed)     │
│  • Gray-band thresholds (attach/review/reject)              │
│  • Evidence weights                                          │
│  • Tokenization settings                                     │
│  • Tie-break rules                                           │
│  • Publishing settings                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     J+MD Surface                             │
├─────────────────────────────────────────────────────────────┤
│  NormalizedMessage → JmdProcessor → ChatRecord              │
│  • raw_text (verbatim)                                       │
│  • md (normalized CommonMark+GFM)                           │
│  • islands (code/math blocks)                                │
│  • md_norm_sha256 (deterministic hash)                      │
│                                                              │
│  ProcessedContent → mapSpansToJmd → JmdSpanMappings         │
│  • md_char_start/end                                         │
│  • raw_text_start/end                                        │
│  • island_index (if inside code/math)                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  Clustering Engine (TODO)                    │
├─────────────────────────────────────────────────────────────┤
│  1. LSH candidate generation (O(1) lookup)                   │
│  2. Pairwise similarity (MinHash/TF-IDF/tokens)             │
│  3. Policy-driven decisions:                                 │
│     • score >= attach → auto-attach                          │
│     • review_lower <= score < attach → review queue         │
│     • score < reject_below → no edge                         │
│  4. Exclusive membership (one cluster per slice)             │
│  5. Deterministic tie-breaking                               │
│  6. Reason code generation                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  NEAR_DUP Edges (TODO)                       │
├─────────────────────────────────────────────────────────────┤
│  • Score ∈ (0,1)                                             │
│  • Reason codes (TOK_OVERLAP, BLOCK_MATCH, etc.)            │
│  • Metadata: shared spans, top tokens                        │
│  • Many-to-many (independent of membership)                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  Cluster Evidence (TODO)                     │
├─────────────────────────────────────────────────────────────┤
│  • Roll-up Phase-2 instance evidence                         │
│  • Coherence = avg(edge_scores)                             │
│  • Monotone combination (policy-weighted)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  Audit & Export (TODO)                       │
├─────────────────────────────────────────────────────────────┤
│  • Decision log (attach/review/reject)                       │
│  • Idempotency verification                                  │
│  • Edges-only export (hashed IDs, no plaintext)             │
│  • Versioned snapshots                                       │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. **Admin-Configurable Everything**

No hard-coded thresholds. All numeric values in policy.yaml:

- Thresholds per modality × level
- Evidence weight combinations
- Tokenization behavior
- Tie-break ordering

**Benefits**:

- Tune without code changes
- A/B test different policies
- Reproduce results (bundled policy)
- Domain experts can adjust

### 2. **J+MD Dual Surface**

Every span traceable to both `md` and `raw_text`:

- `md`: Stable for clustering (normalized)
- `raw_text`: Perfect provenance (verbatim)
- `md_char_start/end`: Coordinates on md
- `raw_text_start/end`: Coordinates on raw

**Benefits**:

- Clustering operates on clean surface
- Provenance always available
- Islands explicitly tracked
- Cross-reference md ↔ raw

### 3. **Gray-Band System**

Three decision zones:

- **attach**: Auto-attach (high confidence)
- **review**: Human review (ambiguous)
- **reject**: No edge (too dissimilar)

**Benefits**:

- Precision over recall
- No forced unions
- Tune sensitivity per modality
- Audit trail for edge cases

### 4. **Exclusive Membership per Slice**

Node can belong to at most one cluster in (level × modality):

- Primary cluster = highest score
- Multi-candidate (within ε) → review queue
- NEAR_DUP edges remain many-to-many

**Benefits**:

- Clear cluster boundaries
- No overlapping confusion
- Deterministic assignment
- Edges still capture all similarities

### 5. **Deterministic Tie-Breaking**

Ordered rules:

1. Higher score wins
2. If |Δscore| < ε, smaller NodeKey
3. Then earlier timestamp
4. Then smaller ContentId

**Benefits**:

- Same input → same output
- Stable across re-runs
- Verifiable (audit log)
- No random decisions

## Next Session Plan

1. **Migration 005** (clustering schema)
2. **Clustering Engine Core** (similarity + membership)
3. **NEAR_DUP Edge Creation** (scored links + reason codes)
4. **Cluster Evidence** (roll-up + coherence)
5. **Decision Audit Log** (determinism verification)
6. **Tests** (contract enforcement)
7. **Documentation** (usage guides)

## Files Created

### New Files (5)

- `packages/types/src/policy.ts` (policy system)
- `packages/types/src/policy-loader.ts` (YAML loading)
- `packages/types/src/chat-record.ts` (J+MD types)
- `packages/parsers/src/services/jmd-processor.ts` (ChatRecord integration)
- `policy.yaml` (default policy)

### Modified Files (2)

- `packages/types/src/index.ts` (export policy system)
- `docs/PHASE_3_PROGRESS.md` (this file)

## Estimated Remaining Work

- **Code**: ~2000-2500 lines
- **Tests**: ~500-800 lines
- **Migration**: ~200 lines
- **Documentation**: ~1000 lines
- **Time**: ~4-6 hours

---

**Status**: Foundation complete ✅
**Next**: Build clustering engine core
**Blocked**: None
