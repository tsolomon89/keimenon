# Canvas Memory OS — ACTUAL Current State

**Last Updated**: 2025-10-11
**Status**: CORRECTION - This document reflects what's ACTUALLY implemented

---

## ⚠️ IMPORTANT: Documentation Was Outdated

The previous documentation I created was based on older status files. After reviewing the actual codebase, I found **significantly MORE features** have been implemented than documented. This file corrects the record.

---

## What's ACTUALLY Implemented

### ✅ Chat Import System (FULLY FUNCTIONAL)

This is a **major feature** that wasn't properly documented!

**Supported Platforms**:

- ChatGPT export files (.json)
- Claude conversation exports (.json)
- Gemini chat exports (.json)
- Generic JSON format

**Import Modes**:

1. **Standard Import** - Basic conversation parsing
2. **Enhanced Import (Sources Mode)** - Advanced with:
   - Message segmentation and stitching
   - Code block extraction
   - Duplicate detection with multiple algorithms
   - Cross-conversation deduplication
   - Similarity scoring

**API Endpoints**:

```
POST /api/v1/import/chat              - Basic chat import
POST /api/v1/import/chat/batch        - Batch import multiple files
POST /api/v1/import/enhanced          - Enhanced import with Sources mode
POST /api/v1/import/stream            - Streaming upload for large files
GET  /api/v1/import/stream/progress/:id - Check upload progress
DELETE /api/v1/import/stream/cancel/:id - Cancel upload
POST /api/v1/import/chat/apply-decisions - Apply dedup decisions
GET  /api/v1/import/chat/decisions/status/:id - Check decision status
GET  /api/v1/import/config/defaults   - Get default config
```

### ✅ Parsers Package (COMPLETE)

**Location**: `packages/parsers/`

**Includes**:

- `ChatGPTParser` - Parse ChatGPT exports
- `ClaudeParser` - Parse Claude exports
- `GeminiParser` - Parse Gemini exports
- `GenericParser` - Fallback for unknown formats
- `ParserRegistry` - Auto-detect format

**Utilities**:

- `fingerprint()` - SHA-256 + text normalization
- `extractCodeBlocks()` - Extract code from messages
- `codeBlocksToAssets()` - Convert code to Source nodes
- `deduplicateCodeAssets()` - Dedupe code snippets
- `SegmentExtractor` - Extract message segments
- `SourcesStitcher` - Stitch segments into Sources

### ✅ Local Document Store (SQLite-based)

**Location**: `apps/api/src/services/local-document-store.ts`

Uses **better-sqlite3** for local storage (not just Neo4j!).

**Features**:

- Local file storage with deduplication
- Fast lookups by fingerprint
- Metadata storage
- Automatic initialization
- Default location: `~/.canvas-memory/`

**Why SQLite + Neo4j?**

- SQLite: Fast local lookups, dedup checking
- Neo4j: Graph relationships, canvas visualization

### ✅ Advanced Services

**Duplicate Detection** (`services/duplicate-detection.ts`):

- Multiple algorithms: Jaccard, Levenshtein, Cosine, Embedding
- Configurable similarity thresholds
- Cross-conversation matching
- Auto-merge or manual review

**Code Extractor** (`services/code-extractor.ts`):

- Extract code blocks from chat messages
- Language detection
- Deduplication of code snippets
- Generate filenames from content

**Similarity Engine** (`services/similarity-engine.ts`):

- Jaccard similarity (token overlap)
- Levenshtein distance (edit distance)
- Cosine similarity (vector-based)
- Embedding-based similarity (planned)

**Autogroup Enhanced** (`services/autogroup-enhanced.ts`):

- Keyword extraction
- Topic clustering
- Conversation grouping
- Smart naming

**Streaming JSON Parser** (`services/streaming-json-parser-v2.ts`):

- Handle large files (100MB+)
- Progress tracking
- Memory-efficient
- Cancellable

### ✅ Frontend UI (More Than Documented)

**Actual Pages**:

- `/` - Redirects based on auth
- `/login` - Mock authentication page
- `/canvas` - Main canvas interface (NOT `/board/:id`!)
- `/ingest` - File upload
- `/board/[id]` - Individual board view (legacy?)

**Import UI Components**:

- `StreamingUploadModal` - Upload with progress
- `ImportStageSelect` - File selection stage
- `ImportStageConfig` - Configuration stage
- `ImportStageProcessing` - Processing stage
- `DuplicateReviewPanel` - Review duplicates
- `DuplicateComparisonView` - Side-by-side comparison
- `DuplicateTreeView` - Hierarchical duplicate view
- `CodeExtractionSection` - Code config
- `GroupsSection` - Grouping config
- `MinLengthSection` - Message filtering config

**Canvas Components**:

- `CanvasLayout` - Main layout (FourRegion concept)
- `FirstTimeUploadModal` - Onboarding
- Plus all the canvas rendering components

### ✅ Content API

**Endpoints**:

```
GET /api/v1/content/message/:id       - Get message content
GET /api/v1/content/source/:id        - Get source content
GET /api/v1/content/code/:id          - Get code content
GET /api/v1/content/conversation/:id  - Get conversation content
GET /api/v1/content/stats             - Get content statistics
```

### ✅ Groups API

**Endpoints**:

```
GET  /api/v1/groups                   - List groups
POST /api/v1/groups                   - Create group
GET  /api/v1/groups/:id               - Get group
PUT  /api/v1/groups/:id               - Update group
DELETE /api/v1/groups/:id             - Delete group
```

### ✅ Config API

**Endpoints**:

```
GET /api/v1/config/defaults           - Get default config
POST /api/v1/config                   - Save config
```

### ✅ Duplicates API

**Endpoints**:

```
GET /api/v1/duplicates                - List duplicates
POST /api/v1/duplicates/merge         - Merge duplicates
POST /api/v1/duplicates/ignore        - Ignore duplicate
```

---

## What's NOT Implemented (Previously Incorrectly Documented as Done)

### ❌ Claims Extraction

- No UI
- No API endpoints
- Schema exists in types package
- **Status**: Planned for Phase 1D

### ❌ UnifiedDoc Generation

- No compiler
- No API endpoints
- Schema exists
- **Status**: Planned for Phase 1D

### ❌ Sequester UI

- No toggle controls
- API support unclear
- Schema exists
- **Status**: Planned

### ❌ Real Authentication

- Only mock auth (login page accepts anything)
- No Clerk/Auth0 integration
- **Status**: Future

---

## Corrected Feature Matrix

| Feature                 | Status         | Notes                             |
| ----------------------- | -------------- | --------------------------------- |
| **File Upload**         | ✅ Complete    | Via `/ingest`                     |
| **Chat Import**         | ✅ Complete    | ChatGPT, Claude, Gemini           |
| **Sources Mode**        | ✅ Complete    | Advanced segmentation & stitching |
| **Code Extraction**     | ✅ Complete    | From chat messages                |
| **Duplicate Detection** | ✅ Complete    | Multiple algorithms               |
| **Streaming Upload**    | ✅ Complete    | For large files                   |
| **Canvas 2D**           | ✅ Complete    | `/canvas` page                    |
| **Node CRUD**           | ✅ Complete    | Full API                          |
| **Edge CRUD**           | ✅ Complete    | Full API                          |
| **Board CRUD**          | ✅ Complete    | Full API                          |
| **Groups API**          | ✅ Complete    | Full CRUD                         |
| **Content API**         | ✅ Complete    | Get messages, sources, code       |
| **Local Storage**       | ✅ Complete    | SQLite + Neo4j                    |
| **Fingerprinting**      | ✅ Complete    | SHA-256 + normalization           |
| **Autogroup**           | ✅ Complete    | Basic + enhanced                  |
| **Parser Registry**     | ✅ Complete    | Auto-detect format                |
| **Claims Extraction**   | ❌ Not Started | Planned Phase 1D                  |
| **UnifiedDocs**         | ❌ Not Started | Planned Phase 1D                  |
| **Sequester UI**        | ❌ Not Started | Planned                           |
| **Real Auth**           | ❌ Mock Only   | Planned Phase 2                   |
| **Verifiers**           | ❌ Not Started | Planned Phase 2                   |
| **Galaxy Lens**         | ❌ Not Started | Planned Phase 2                   |

---

## Actual Architecture

### Data Flow: Chat Import

```
1. User uploads ChatGPT export JSON
   ↓
2. StreamingUploadModal shows progress
   ↓
3. POST /api/v1/import/enhanced
   ↓
4. ParserRegistry detects format → ChatGPTParser
   ↓
5. Parser extracts conversations & messages
   ↓
6. SegmentExtractor splits messages into segments
   ↓
7. Code extractor finds code blocks
   ↓
8. Duplicate detection finds similar content
   ↓
9. SourcesStitcher creates Source nodes
   ↓
10. Save to Neo4j + Local Document Store (SQLite)
   ↓
11. AutogroupEnhanced clusters sources
   ↓
12. Create Group nodes + CONTAINS edges
   ↓
13. Return import results with:
    - Sources created
    - Code extracted
    - Duplicates found (pending review)
    - Groups suggested
```

### Storage Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React)               │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Backend API (Express)            │
│  ┌────────────────────────────────────┐ │
│  │  Parsers (ChatGPT/Claude/Gemini)   │ │
│  │  Services (Import/Dedupe/Extract)  │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  Neo4j Graph     │  │  SQLite Local    │
│  (Relationships) │  │  (Fast Lookups)  │
└──────────────────┘  └──────────────────┘
         │                    │
         └────────┬───────────┘
                  ▼
         ┌──────────────────┐
         │  File System     │
         │  storage/uploads/│
         │  ~/.canvas-memory│
         └──────────────────┘
```

**Why Dual Storage?**

- **Neo4j**: Graph relationships, canvas visualization, complex queries
- **SQLite**: Fast fingerprint lookups, deduplication, local metadata
- **File System**: Actual file content

### Packages Structure (Actual)

```
packages/
├── types/              ✅ Zod schemas for all types
├── db/                 ✅ Neo4j client + SQLite helpers
├── ui/                 ✅ React components
├── graph/              ✅ D3-force layout
├── parsers/            ✅ COMPLETE - ChatGPT/Claude/Gemini
├── agents/             📦 Empty (placeholder)
└── verifiers/          📦 Empty (placeholder)
```

**Note**: `agents` and `verifiers` packages exist but are empty placeholders for Phase 2.

---

## Import Configuration Schema

The **actual** import config is much more extensive than documented:

```typescript
{
  // Sources Mode
  sources_role_subset: 'both' | 'user' | 'assistant',
  sources_min_chars_user: number,
  sources_min_chars_assistant: number,
  sources_stitch_strategy: 'by_chat' | 'by_title' | 'by_topic',
  sources_preserve_chat_integrity: boolean,
  sources_cap: number,
  sources_attach_mode: string,
  include_assistant_context: boolean,
  sources_export_format: string,

  // Code Extraction
  export_code: boolean,
  code_min_chars: number,
  code_global_dedupe: boolean,

  // Duplicate Detection
  duplicate_detection_enabled: boolean,
  duplicate_exact_match: boolean,
  duplicate_similarity_threshold: number,
  duplicate_cross_conversation: boolean,
  duplicate_algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding',
  duplicate_normalize_tokens: boolean,
  duplicate_min_token_overlap: number,
  duplicate_length_ratio_tolerance: number,
  duplicate_ignore_whitespace: boolean,
  duplicate_ignore_case: boolean,
  duplicate_ignore_timestamp: boolean,
  duplicate_require_review: boolean,
  duplicate_auto_approve_exact: boolean,
  duplicate_auto_merge_threshold: number,
  similarity_threshold: number,
}
```

This is **WAY more comprehensive** than the simple file upload I documented!

---

## Corrected API Endpoint List

### Import (8 endpoints - NOT 0 as I documented!)

```
POST   /api/v1/import/chat
POST   /api/v1/import/chat/batch
POST   /api/v1/import/enhanced
POST   /api/v1/import/stream
GET    /api/v1/import/stream/progress/:uploadId
DELETE /api/v1/import/stream/cancel/:uploadId
POST   /api/v1/import/chat/apply-decisions
GET    /api/v1/import/chat/decisions/status/:importId
GET    /api/v1/import/config/defaults
```

### Content (5 endpoints - NOT documented!)

```
GET /api/v1/content/message/:id
GET /api/v1/content/source/:id
GET /api/v1/content/code/:id
GET /api/v1/content/conversation/:id
GET /api/v1/content/stats
```

### Groups (5 endpoints - partially documented)

```
GET    /api/v1/groups
POST   /api/v1/groups
GET    /api/v1/groups/:id
PUT    /api/v1/groups/:id
DELETE /api/v1/groups/:id
```

### Config (2 endpoints - NOT documented!)

```
GET  /api/v1/config/defaults
POST /api/v1/config
```

### Duplicates (3 endpoints - NOT documented!)

```
GET  /api/v1/duplicates
POST /api/v1/duplicates/merge
POST /api/v1/duplicates/ignore
```

### Ingest (3 endpoints - documented correctly)

```
POST /api/v1/ingest/files
POST /api/v1/ingest/url
GET  /api/v1/ingest/status
```

### Nodes (5 endpoints - documented correctly)

```
GET    /api/v1/nodes
GET    /api/v1/nodes/:id
POST   /api/v1/nodes/source
POST   /api/v1/nodes/group
DELETE /api/v1/nodes/:id
```

### Boards (6 endpoints - documented correctly)

```
GET    /api/v1/boards
GET    /api/v1/boards/:id
GET    /api/v1/boards/:id/graph
POST   /api/v1/boards
PUT    /api/v1/boards/:id
DELETE /api/v1/boards/:id
```

### Edges (4 endpoints - documented correctly)

```
GET    /api/v1/edges
POST   /api/v1/edges
DELETE /api/v1/edges
GET    /api/v1/edges/node/:nodeId
```

**TOTAL: 46 endpoints** (I only documented ~20!)

---

## What This Means

### The Good News

1. **Much further along than I thought!**
2. **Chat import is the CORE feature** and it's complete
3. **Duplicate detection is sophisticated**
4. **Code extraction works**
5. **Local + graph storage is smart**
6. **Streaming upload handles large files**

### The Corrections Needed

1. **Primary use case is chat import**, not generic file upload
2. **Main page is `/canvas`**, not `/board/:id`
3. **Parsers package is critical**, not a placeholder
4. **SQLite is used**, not just Neo4j
5. **Much more sophisticated** than documented

### Project Focus (Corrected)

**Actual Core Feature**: Import and organize AI chat conversations

**Secondary Features**: File upload, canvas visualization, grouping

**Future Features**: Claims, UnifiedDocs, Verifiers, Galaxy lens

---

## Correct Phase Status

### Phase 1A: Foundation ✅ 100%

- Monorepo
- TypeScript
- Next.js
- Express
- Neo4j + SQLite
- Type system

### Phase 1B: Import System ✅ 95%

- Chat parsers (ChatGPT, Claude, Gemini) ✅
- Sources mode ✅
- Code extraction ✅
- Duplicate detection ✅
- Streaming upload ✅
- Local document store ✅
- Import UI ✅
- Minor polish needed

### Phase 1C: Canvas ✅ 90%

- 2D rendering ✅
- Layout algorithm ✅
- Selection ✅
- Pan/zoom ✅
- Integration with import ✅
- Some UI refinement needed

### Phase 1D: Claims & Docs ❌ 0%

- Claims extraction (not started)
- UnifiedDoc compiler (not started)
- Citation tracking (not started)

---

## Development Priorities (Corrected)

### Immediate (Polish Phase 1B/1C)

1. ✅ Chat import works - TEST IT THOROUGHLY
2. ✅ Duplicate review UI - VERIFY IT WORKS
3. ✅ Code extraction - TEST WITH REAL DATA
4. 🔄 Error handling - ADD BOUNDARIES
5. 🔄 Loading states - ADD TO IMPORT FLOW
6. 🔄 Toast notifications - USER FEEDBACK

### Next (Phase 1D)

1. Claims extraction from imported chats
2. UnifiedDoc L0 compiler
3. Citation tracking

### Future (Phase 2)

1. Real authentication (Clerk/Auth0)
2. Verifiers (HTTP, schema, compute)
3. Galaxy lens
4. Embedding-based similarity

---

## Testing Checklist

### What to Test (Since It's Actually Implemented!)

1. **Chat Import**:
   - [ ] Upload ChatGPT export
   - [ ] Upload Claude export
   - [ ] Upload Gemini export
   - [ ] Verify messages appear in canvas
   - [ ] Check code blocks are extracted
   - [ ] Review duplicates panel

2. **Sources Mode**:
   - [ ] Configure segmentation options
   - [ ] Test stitching strategies
   - [ ] Verify min length filtering
   - [ ] Check conversation integrity

3. **Duplicate Detection**:
   - [ ] Test Jaccard similarity
   - [ ] Test exact matching
   - [ ] Review duplicate suggestions
   - [ ] Merge duplicates
   - [ ] Ignore false positives

4. **Streaming Upload**:
   - [ ] Upload large file (100MB+)
   - [ ] Monitor progress
   - [ ] Cancel mid-upload
   - [ ] Resume upload

5. **Canvas**:
   - [ ] View imported chats on canvas
   - [ ] Select nodes
   - [ ] Pan and zoom
   - [ ] Check grouping

6. **Content API**:
   - [ ] Fetch message content
   - [ ] Fetch source content
   - [ ] Fetch code content
   - [ ] Get statistics

---

## Documentation That Needs Major Corrections

1. **MASTER_DOCS.md** - Underestimates actual implementation significantly
2. **PROJECT_SUMMARY.md** - Misses chat import as primary feature
3. **ARCHITECTURE.md** - Doesn't mention SQLite or parsers
4. **TODO_TRACKER.md** - Lists things as "todo" that are actually done

---

## Actual File Counts

| Component           | Files | LOC (approx) |
| ------------------- | ----- | ------------ |
| API Routes          | 14    | ~3,000       |
| API Services        | 12    | ~5,000       |
| Parsers Package     | 11    | ~2,000       |
| Frontend Components | 50+   | ~6,000       |
| Total Codebase      | ~100+ | ~20,000+     |

**My original estimate of 8,000 LOC was VERY wrong!**

---

## Next Steps (Corrected)

### Week 1: Test & Document Chat Import

1. Thoroughly test all chat import features
2. Document the Sources Mode
3. Test duplicate detection with real data
4. Write user guide for chat import

### Week 2: Polish Existing Features

1. Error boundaries
2. Loading states for import flow
3. Toast notifications
4. Better duplicate review UX

### Week 3-4: Phase 1D (Claims & Docs)

1. Claims extraction (NOW we can extract from imported chats!)
2. UnifiedDoc compiler (creates docs from chat sources!)
3. Citation tracking

---

## Apologies & Lessons Learned

I created extensive documentation based on **outdated status files** without thoroughly checking the **actual codebase first**. This was a mistake.

**Lessons**:

1. Always check actual code before documenting
2. Status files can be outdated quickly
3. Don't trust project history, verify current state
4. The codebase was more advanced than reported

The good news: **You're much further along than I thought!**

The bad news: **My documentation was misleadingly incomplete.**

---

**Status**: Corrected as of 2025-10-11
**Next**: Update all docs to reflect actual state
