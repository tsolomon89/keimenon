# Keimenon — Project Summary

**Date**: 2025-10-11
**Current Status**: Phase 1D Complete (75%), Chat Import System Complete (90%)
**Next Milestone**: Documentation & Testing, then MVP Release

---

## What Is Keimenon?

Keimenon is a **graph-native knowledge management system** that replaces linear AI chat interfaces with a visual, versioned knowledge graph. Instead of scrolling through chat history, users organize information spatially on a keimenon where everything—files, chats, claims, documents—exists as nodes connected by typed, policy-aware edges.

### Key Differentiators

1. **Visual Graph**: See your knowledge spatially, not linearly
2. **Scope-Based**: Explicit, reproducible context (not "vibes")
3. **Verification-First**: Claims must be tool-verified, not just LLM asserted
4. **Local-First**: Free/Pro tiers work on-device with BYO keys
5. **Policy Edges**: Sequester content from models/tools/UI independently

---

## Current State (What Works Right Now)

### ✅ Fully Functional

1. **File Upload & Storage**
   - Drag-and-drop file upload (PDF, TXT, MD, images, JSON, CSV)
   - SHA-256 fingerprinting for deduplication
   - Local file storage with content-addressable IDs
   - Up to 10 files per upload, 10MB each

2. **Chat Import System** 🆕
   - Full parsers for ChatGPT, Claude, Gemini exports (JSON/JSONL)
   - Streaming import with progress tracking
   - Sources mode: Extract meaningful segments from conversations
   - Code extraction: Auto-detect and extract code blocks
   - Multiple stitching strategies (by chat, by title, by topic)
   - Duplicate detection with 4 algorithms (jaccard, levenshtein, cosine, embedding)
   - Import decisions UI for handling duplicates
   - Batch import processing

3. **Automatic Organization**
   - Rule-based autogrouping by MIME type and domain
   - Group creation with suggested names
   - Duplicate detection by fingerprint AND content similarity
   - Advanced similarity engine with configurable thresholds

4. **2D Keimenon Visualization**
   - Interactive 2D graph with D3-force layout
   - Pan & zoom controls (drag + scroll)
   - Node selection (click, Shift+click for multi-select)
   - Color-coded by type (Sources blue, Groups purple, etc.)
   - Edge rendering between nodes

5. **Data Persistence**
   - Dual storage: Neo4j (keimenon mode) OR SQLite (local mode)
   - Hybrid mode support for sync between both
   - Constraints and indexes for performance
   - Full graph query API
   - Migration scripts between storage modes

6. **API Endpoints** (30+ endpoints)
   - Ingest: File upload, storage stats
   - Import: Chat import, streaming, decisions, batch
   - Nodes: CRUD operations
   - Edges: CRUD operations
   - Boards: CRUD + graph fetching
   - Content: View source content
   - Groups: Manage collections
   - Duplicates: Detection and merging
   - Config: System configuration

### 🔄 Partially Working

1. **Board Management**
   - API endpoints complete
   - UI hardcoded to "default_board"
   - Need: Board switcher, creation UI

2. **UnifiedDoc System**
   - Schema defined
   - L0 compiler not yet implemented
   - No viewer UI yet

3. **Sequester System**
   - Schema defined
   - No UI controls yet
   - Policy enforcement incomplete

---

## What's NOT Built Yet (For Full MVP)

### Remaining Polish Items (1-2 weeks)

**Must Have:**

1. **UnifiedDoc Generation**
   - L0 compiler (aggregate sources/claims into bullet list)
   - Token counting (≤5k limit for Free tier)
   - Markdown export with citations
   - Viewer UI with citation tooltips

2. **Sequester Controls**
   - Toggle UI in selection inspector
   - Policy chips (reason, expiry)
   - Visual indicators on keimenon
   - Full enforcement in scope queries

3. **UI Polish**
   - Error boundaries (prevent crashes)
   - Loading states for slow operations
   - Toast notifications (user feedback)
   - Empty states (helpful messages)
   - Board management UI

4. **Testing & Documentation**
   - Unit tests for parsers
   - Integration tests for import flows
   - Import guide documentation
   - Video tutorials

---

## Architecture Overview

### Tech Stack

**Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, D3-force, Three.js
**Backend**: Express, TypeScript, Neo4j driver, better-sqlite3, Multer, Zod, Busboy
**Database**: Neo4j 5.19 (graph database) OR SQLite (embedded) - switchable
**Parsers**: ChatGPT, Claude, Gemini, Generic format support
**Build**: Turborepo (monorepo), npm workspaces

### Monorepo Structure

```
keimenon/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # Express backend (port 3001)
├── packages/
│   ├── types/        # Zod schemas for all data models
│   ├── db/           # Neo4j + SQLite clients with factory
│   ├── ui/           # React component library
│   ├── graph/        # D3-force layout algorithms
│   ├── parsers/      # Chat parsers (ChatGPT, Claude, Gemini) ✅
│   ├── agents/       # Agent framework (placeholder)
│   └── verifiers/    # Verification tools (placeholder)
└── ai_context/       # Specifications & docs
```

### Key Files to Know

**Frontend**:

- `apps/web/src/app/page.tsx` - Landing page
- `apps/web/src/app/ingest/page.tsx` - File upload UI
- `apps/web/src/app/board/[id]/page.tsx` - Keimenon viewer
- `apps/web/src/components/keimenon/Keimenon2D.tsx` - Graph renderer

**Backend**:

- `apps/api/src/index.ts` - Main server
- `apps/api/src/routes/ingest.ts` - File upload endpoint
- `apps/api/src/routes/import.ts` - Chat import endpoint
- `apps/api/src/routes/import-enhanced.ts` - Advanced import with dedup
- `apps/api/src/routes/import-stream.ts` - Streaming import
- `apps/api/src/routes/import-decisions.ts` - Duplicate decisions
- `apps/api/src/routes/nodes.ts` - Node CRUD
- `apps/api/src/routes/edges.ts` - Edge CRUD
- `apps/api/src/routes/boards.ts` - Board management
- `apps/api/src/services/autogroup.ts` - Clustering logic
- `apps/api/src/services/import.ts` - Import orchestration
- `apps/api/src/services/code-extractor.ts` - Code block extraction
- `apps/api/src/services/similarity-engine.ts` - Duplicate detection
- `apps/api/src/services/sources-builder.ts` - Sources mode
- `apps/api/src/services/streaming-json-parser-v2.ts` - Streaming parser
- `apps/api/src/services/local-document-store.ts` - Embedded storage

**Schemas**:

- `packages/types/src/nodes.ts` - All node types
- `packages/types/src/edges.ts` - All edge types
- `packages/types/src/policies.ts` - Policy types
- `packages/types/src/receipts.ts` - Scope & receipt types

**Parsers**:

- `packages/parsers/src/parsers/chatgpt.ts` - ChatGPT export parser
- `packages/parsers/src/parsers/claude.ts` - Claude export parser
- `packages/parsers/src/parsers/gemini.ts` - Gemini export parser
- `packages/parsers/src/parsers/generic.ts` - Generic format parser
- `packages/parsers/src/sources/segment-extractor.ts` - Sources mode
- `packages/parsers/src/sources/stitcher.ts` - Content stitching
- `packages/parsers/src/utils/code-extractor.ts` - Code block extraction

---

## Node Types (What Can Exist on Keimenon)

| Type               | Purpose                         | Status              |
| ------------------ | ------------------------------- | ------------------- |
| **Source**         | File, URL, chat segment         | ✅ Implemented      |
| **Group**          | Named collection of nodes       | ✅ Implemented      |
| **Folder**         | Group with stronger containment | ✅ Schema only      |
| **ChatThread**     | Conversation container          | ✅ Implemented      |
| **Message**        | Single chat message             | ✅ Implemented      |
| **ObjectiveClaim** | Verified factual statement      | 🔄 Schema only      |
| **UnifiedDoc**     | Consolidated document (L0-L3)   | 🔄 Schema only      |
| **Constellation**  | Collapsed cluster               | ✅ Schema only      |
| **UserNode**       | User with preferences           | 📋 Pro feature      |
| **BusinessNode**   | Organization entity             | 📋 Business feature |

---

## Edge Types (How Nodes Relate)

| Type              | Meaning                     | Status         |
| ----------------- | --------------------------- | -------------- |
| **CONTAINS**      | Group → Member              | ✅ Implemented |
| **SEQUESTERS**    | Hide from models/tools      | 🔄 Schema only |
| **DERIVES_FROM**  | Citation link               | 🔄 Schema only |
| **IN_SCOPE_FOR**  | Include in chat context     | 📋 Pro feature |
| **EQUIVALENT_TO** | Duplicate detection         | ✅ Logic only  |
| **DUP_OF**        | Canonical duplicate         | ✅ Logic only  |
| **SUPPORTS**      | Claim → Claim (supports)    | 🔄 Schema only |
| **REFUTES**       | Claim → Claim (contradicts) | 🔄 Schema only |
| **VERIFIED_BY**   | Claim → VerifierRun         | 📋 Pro feature |
| **OWNED_BY**      | Ownership tracking          | 📋 Future      |

---

## Feature Tier System

### Free Tier (Current MVP Status)

**What You Can Do**:

- Upload files (5 GB storage, 500 sources max)
- Import chat conversations (ChatGPT, Claude, Gemini)
- Extract code blocks automatically
- Duplicate detection with similarity matching
- Auto-organize into groups
- View on 2D keimenon
- Pan, zoom, select nodes
- Sources mode: Extract meaningful segments
- Local SQLite storage (no server needed)
- Export to Markdown

**What You Can't Do**:

- Chat with AI about your data (Pro feature)
- AI-powered claim extraction (Pro feature)
- Run verifiers (HTTP checks, etc.)
- Use 3D or Galaxy lenses
- Generate UnifiedDocs (in progress)
- Schedule agents

### Pro Tier (Phase 2)

**Adds**:

- Chat with scope + receipts
- AI claim extraction
- HTTP/Schema/Compute verifiers
- Galaxy lens (trust-warped space)
- UnifiedDocs L0/L1 (up to 50k tokens)
- Embedding-based clustering
- Up to 5 seats

### Business Tier (Phase 3)

**Adds**:

- Organization features
- CRM/Email/Webhook actions
- Multi-seat + SSO
- Scheduled agents
- PII governance
- Audit logs
- Unlimited storage & seats

---

## Quick Start Guide

### Prerequisites

- Node.js 18+
- Neo4j 5.x (Docker recommended)

### Setup (5 minutes)

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start Neo4j**:

   ```bash
   docker run --name neo4j \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/testpassword \
     neo4j:5.19
   ```

3. **Configure environment**:
   - Copy `apps/api/.env.example` to `apps/api/.env`
   - Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

4. **Start dev servers**:

   ```bash
   npm run dev
   ```

5. **Test it out**:
   - Open http://localhost:3000
   - Click "Ingest Files"
   - Upload some files
   - Click "View on Keimenon"

---

## How to Use It (Current Functionality)

### 1. Upload Files

1. Go to http://localhost:3000/ingest
2. Drag & drop files or click to browse
3. Files are:
   - Fingerprinted (SHA-256)
   - Deduplicated
   - Auto-grouped by type
   - Saved to Neo4j

### 2. View on Keimenon

1. Go to http://localhost:3000/board/default_board
2. See nodes rendered spatially
3. Interactions:
   - **Pan**: Click & drag background
   - **Zoom**: Scroll wheel
   - **Select**: Click nodes (Shift+click for multi-select)
   - **Inspect**: Selected nodes appear in RHS sidebar

### 3. Organize (Auto)

- Files automatically grouped:
  - PDFs → "Documents"
  - Images → "Images"
  - JSON/CSV → "Data"
  - Same domain URLs → "example.com"

### 4. What's Missing (Can't Do Yet)

- ❌ Extract claims from content
- ❌ Generate documentation
- ❌ Hide sensitive content (sequester)
- ❌ Chat with AI about files
- ❌ Verify claims with tools
- ❌ Create custom boards

---

## Development Status Summary

| Component               | Status  | Notes                                           |
| ----------------------- | ------- | ----------------------------------------------- |
| **Infrastructure**      | ✅ 100% | Monorepo, TypeScript, build system              |
| **Database**            | ✅ 100% | Neo4j + SQLite clients, hybrid mode             |
| **File Ingest**         | ✅ 100% | Upload, fingerprint, storage, autogroup         |
| **Chat Import**         | ✅ 90%  | Parsers, streaming, decisions, batch processing |
| **Code Extraction**     | ✅ 85%  | Auto-detect, dedupe, export code blocks         |
| **Duplicate Detection** | ✅ 80%  | 4 algorithms, configurable thresholds           |
| **Sources Mode**        | ✅ 85%  | Segment extraction, stitching strategies        |
| **Keimenon 2D**         | ✅ 100% | Rendering, layout, selection, zoom              |
| **API Endpoints**       | ✅ 100% | 30+ endpoints across 12 route files             |
| **UnifiedDocs**         | 🔄 20%  | Schema done, no compiler or viewer              |
| **Sequester**           | 🔄 30%  | Schema done, partial enforcement                |
| **Board Management**    | 🔄 60%  | API done, UI hardcoded                          |
| **Error Handling**      | 🔄 50%  | Try/catch + middleware, no boundaries           |
| **Testing**             | 🔄 10%  | Test files exist, coverage low                  |
| **Documentation**       | 🔄 60%  | Extensive specs, major gaps in import docs      |

---

## What Needs Work (Prioritized)

### Critical (Do Next)

1. **Claims extraction** - Core MVP feature
2. **UnifiedDoc L0 compiler** - Core MVP feature
3. **Error boundaries** - Prevents crashes
4. **Loading states** - Better UX
5. **Input validation** - Security

### Important (Soon)

6. **Board management UI** - Remove hardcoded board
7. **Sequester UI** - Hide sensitive content
8. **Rate limiting** - Prevent abuse
9. **Layout persistence** - Save node positions
10. **Toast notifications** - User feedback

### Nice to Have (Later)

11. **Testing setup** - Quality assurance
12. **Docker Compose** - Easier setup
13. **Keyboard shortcuts** - Power user features
14. **Mobile responsive** - Phone/tablet support
15. **API docs** - OpenAPI/Swagger

---

## Timeline to MVP Release

**Estimated**: 2-3 weeks (40-60 hours)

**Week 1**: Claims extraction + UnifiedDoc compiler
**Week 2**: UI polish + error handling + sequester
**Week 3**: Testing + bug fixes + documentation

**After MVP**: Begin Phase 2 (Pro features)

---

## Key Metrics

- **Total Files**: ~80+ code files
- **Lines of Code**: ~8,000+
- **API Endpoints**: 20+
- **Node Types**: 11
- **Edge Types**: 11
- **Packages**: 7
- **Time Invested**: ~40+ hours

---

## How to Contribute

### Adding Features

1. **Add to TODO_TRACKER.md** with estimate
2. **Create schema** in `packages/types` if needed
3. **Implement backend** in `apps/api`
4. **Add API endpoint** in `routes/`
5. **Build frontend UI** in `apps/web`
6. **Test manually** (automated tests TODO)
7. **Update docs** (this file + MASTER_DOCS.md)

### Code Standards

- **TypeScript**: Strict mode, explicit types
- **Validation**: Zod schemas at API boundary
- **Errors**: Use try/catch, log with context
- **Formatting**: Prettier (auto on save)
- **Naming**: camelCase for variables, PascalCase for components

---

## Resources & Documentation

### Primary Docs (Start Here)

1. **[MASTER_DOCS.md](MASTER_DOCS.md)** - Complete reference (this doc!)
2. **[TODO_TRACKER.md](TODO_TRACKER.md)** - All remaining work
3. **[QUICK_START.md](QUICK_START.md)** - 5-minute setup guide
4. **[ROADMAP.md](ROADMAP.md)** - Phase-by-phase plan

### Design Specs

- `ai_context/keimenon_living_spec_v_0.md` - Core concepts
- `ai_context/mvp_vs_final_vision_roadmap_model_v_0.md` - Tier system
- `ai_context/ui_screens_layout_view_map_v_0.md` - UI layouts
- `ai_context/groups_ai_nodes_ui_spec_v_0.md` - AI features

### Historical Docs (Reference Only)

- `PROJECT_STATUS.md` - Outdated status (see MASTER_DOCS)
- `PROGRESS.md` - Outdated progress (see TODO_TRACKER)
- `GAPS_ANALYSIS.md` - Issues found (mostly fixed)
- `FIXES_APPLIED.md` - Critical fixes completed

---

## Common Tasks

### Start Development

```bash
npm run dev                   # Start all services
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

### Check Neo4j

```bash
# Neo4j Browser: http://localhost:7474
# Login: neo4j / testpassword

# View all nodes
MATCH (n) RETURN n LIMIT 25

# View all edges
MATCH ()-[r]->() RETURN r LIMIT 25

# Count nodes by type
MATCH (n) RETURN n.kind, count(n)
```

### Test API

```bash
# Health check
curl http://localhost:3001/health

# Upload file
curl -X POST http://localhost:3001/api/v1/ingest/files \
  -F "files=@test.pdf"

# List nodes
curl http://localhost:3001/api/v1/nodes

# Get board graph
curl http://localhost:3001/api/v1/boards/default_board/graph
```

### Build for Production

```bash
npm run build                 # Build all packages
npm run type-check            # Verify types
npm run lint                  # Check code style
```

---

## Troubleshooting

### "Can't connect to Neo4j"

1. Check Neo4j is running: `docker ps | grep neo4j`
2. Check .env file has correct credentials
3. Try: `curl http://localhost:7474`

### "Port already in use"

```bash
npm run kill-ports            # Kill ports 3000, 3001
```

### "Module not found"

```bash
npm run clean                 # Clean build cache
npm install                   # Reinstall
npm run build                 # Rebuild packages
```

### "Keimenon shows no nodes"

1. Upload files at `/ingest` first
2. Check Neo4j has nodes: `MATCH (n) RETURN count(n)`
3. Check browser console for errors
4. Verify API returns nodes: `curl localhost:3001/api/v1/nodes`

---

## Questions?

- **Setup Issues**: See [QUICK_START.md](QUICK_START.md)
- **Architecture**: See [MASTER_DOCS.md](MASTER_DOCS.md)
- **Next Steps**: See [TODO_TRACKER.md](TODO_TRACKER.md)
- **Roadmap**: See [ROADMAP.md](ROADMAP.md)

---

**Last Updated**: 2025-10-11
**Next Review**: After Phase 1D completion
**Status**: Ready for Phase 1D implementation

---

## TL;DR

**What works**: Upload files → auto-organize → view on 2D keimenon
**What's missing**: Claims extraction, docs generation, sequester UI
**Next milestone**: Complete Phase 1D (2-3 weeks)
**End goal**: Local-first knowledge graph with AI-powered features

🚀 **Ready to build the future of knowledge management!**
