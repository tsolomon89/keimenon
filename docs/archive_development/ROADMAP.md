# Development Roadmap

## Phase 1A: Foundation ✅ COMPLETE

**Timeline**: Complete
**Status**: All tasks completed

- [x] Monorepo setup with Turborepo
- [x] TypeScript configuration across all packages
- [x] Next.js 14 frontend initialization
- [x] Express backend API setup
- [x] Neo4j database client wrapper
- [x] Shared type system with Zod validation
- [x] UI component library (Button, Card, Badge, Layout)
- [x] Documentation (README, SETUP, PROJECT_STATUS)

---

## Phase 1-5: Chat Import System ✅ COMPLETE

**Timeline**: Complete (Jan 2025)
**Status**: All phases completed

- [x] Phase 1: Streaming Infrastructure
- [x] Phase 2: Backend Services (sources, code extraction, similarity)
- [x] Phase 3: Frontend UI (upload modal, progress tracking)
- [x] Phase 4: Startup Orchestration (dev scripts, health checks)
- [x] Phase 5: Integration Testing (automated test framework)

See [ai_context/PHASE\*\_COMPLETE.md](.) for detailed documentation.

---

## Phase 6: Local-First Migration ✅ COMPLETE

**Timeline**: Oct 11-12, 2025 (2 sessions, ~4 hours)
**Status**: ✅ All tasks completed
**Achievement**: **Major architectural transformation** to local-first

### What Was Done

**Database Abstraction**:

- [x] Created DatabaseClient interface for multi-backend support
- [x] Implemented SQLiteClient with WAL mode and FTS5
- [x] Implemented HybridClient for dual-database operation
- [x] Created DatabaseFactory for mode selection
- [x] Migrated global database initialization

**API Routes Migration** (20+ endpoints):

- [x] import-enhanced.ts - Enhanced import with config
- [x] nodes.ts - Node CRUD operations (5 endpoints)
- [x] edges.ts - Edge CRUD operations (4 endpoints)
- [x] content.ts - Content retrieval (5 endpoints)
- [x] boards.ts - Board management (6 endpoints)
- [x] ingest.ts - File ingestion
- [x] import-stream.ts - Streaming import

**Testing & Documentation**:

- [x] Tested with real datasets (tiny.json, small.json, medium.json)
- [x] Performance testing (693 nodes, 935 edges)
- [x] Created comprehensive documentation (README, SESSION\_\*, PERFORMANCE_TESTING)
- [x] Updated all docs to reflect local-first architecture

**Developer Tools**:

- [x] dev:check - Check running servers
- [x] dev:stop - Stop all servers gracefully
- [x] backup/restore scripts - Database management
- [x] Updated npm scripts in package.json

### Key Achievements

✅ **$0/month cost** (vs $65-200/month Neo4j Aura)
✅ **100% offline capable** (no internet required)
✅ **Complete data ownership** (stays on user's machine)
✅ **Zero configuration** (works out of the box)
✅ **Backward compatible** (Neo4j mode still supported)
✅ **Production ready** (tested, documented, tooled)

See [ai_context/PHASE6_LOCAL_FIRST_COMPLETE.md](./PHASE6_LOCAL_FIRST_COMPLETE.md) for complete documentation.

---

## Phase 7: Frontend Connection ✅ COMPLETE

**Timeline**: Oct 12, 2025 (~15 minutes)
**Status**: ✅ All tasks completed
**Achievement**: Connected existing Next.js frontend to local-first backend

### What Was Done

**Frontend Integration**:

- [x] Fixed API URL configuration (apps/web/src/lib/api-client.ts)
- [x] Installed frontend dependencies (57 packages)
- [x] Started API server on port 4001
- [x] Started frontend server on port 3000
- [x] Verified full-stack integration
- [x] Updated documentation (README.md)

### Key Achievements

✅ **Complete Full-Stack Application** - Frontend + API + Database all running locally
✅ **60+ React Components** - Canvas2D, import UI, layout components already built
✅ **D3-Force Visualization** - Interactive 2D graph with pan/zoom/selection
✅ **Real-Time Import UI** - Streaming progress for chat file uploads
✅ **Zero New Code** - Discovered frontend was already complete
✅ **15-Minute Integration** - Only needed to fix API URL and install deps

**Frontend Features**:

- Interactive 2D graph visualization with D3-force layout
- Chat import UI with streaming progress tracking
- Node and edge CRUD operations via UI
- Real-time API integration with error handling
- State management with Zustand
- Responsive design with Tailwind CSS

**Access Points**:

- Web UI: http://localhost:3000
- Canvas: http://localhost:3000/canvas
- Import: http://localhost:3000/ingest
- API: http://localhost:4001/api/v1

See [ai_context/PHASE7_FRONTEND_CONNECTION.md](./PHASE7_FRONTEND_CONNECTION.md) for complete documentation.

---

## Phase 1B: File Ingest & Autogroup ✅ COMPLETE

**Timeline**: Complete (prior sessions)
**Status**: ✅ All core tasks completed
**Goal**: Users can upload files, which are fingerprinted and automatically grouped

### Backend Tasks ✅

- [x] Create file upload endpoint (`POST /api/v1/ingest/files`)
  - [x] Integrate multer for multipart uploads (ingest.ts)
  - [x] Validate file types (mime type whitelist - 7 types supported)
  - [x] Enforce size limits (10MB default)
  - [x] Store files to local storage
- [x] Implement fingerprinting service (fingerprint.ts)
  - [x] Content hash (SHA-256)
  - [x] Node ID generation based on fingerprints
  - [x] Deduplication check via fingerprints
- [x] Create Source node CRUD operations
  - [x] `POST /api/v1/nodes/source` - Create Source node (nodes.ts)
  - [x] `GET /api/v1/nodes/:id` - Retrieve any node including Source
  - [x] `DELETE /api/v1/nodes/:id` - Remove node
- [x] Build autogroup service (autogroup.ts + autogroup-enhanced.ts)
  - [x] Rule-based clustering (by mime type, domain)
  - [x] TF-IDF algorithm for message grouping
  - [x] Create Group nodes automatically
  - [x] Create CONTAINS edges (Group → Source)
  - [x] Return group assignments in response
  - [x] Recompute groups with new target count
- [x] Additional features implemented:
  - [x] Streaming upload service (streaming-upload.ts)
  - [x] Storage service with usage stats (storage.ts)
  - [x] Ingest status endpoint
- [ ] Rate limiting middleware (NOT YET IMPLEMENTED)
  - [ ] 5 uploads/min for Free tier
  - [ ] 50 uploads/day limit
- [ ] Circuit breaker for quota enforcement (NOT YET IMPLEMENTED)

### Frontend Tasks ✅

- [x] Create `/ingest` page (apps/web/src/app/ingest/)
  - [x] Drag-and-drop zone (FileUploadZone.tsx)
  - [x] File list with progress bars (StreamingUploadModal.tsx)
  - [x] Upload status (queued, uploading, complete, error)
  - [x] Streaming progress tracking
- [x] Build upload service (apps/web/src/lib/api-client.ts)
  - [x] Streaming upload with real-time progress
  - [x] Progress tracking (StreamingUploadModal)
  - [x] Error handling & retry (error-handler.ts)
- [x] Ingest results view (ChatImportModal.tsx)
  - [x] Show created conversations
  - [x] Show duplicate groups
  - [x] Stats display (messages, sources, code blocks)

### Database Tasks ✅

- [x] SQLite indexes optimized (idx_nodes_kind, idx_nodes_created)
- [x] Full-text search with FTS5 (nodes_fts table)
- [x] Composite indexes (idx_edges_from_to, idx_edges_created)

---

## Phase 1C: 2D Canvas Visualization ✅ MOSTLY COMPLETE

**Timeline**: Complete (prior sessions)
**Status**: ✅ Core visualization complete, ⚠️ some advanced features pending
**Goal**: Users can see their graph on an interactive 2D canvas

### Frontend Tasks ✅

- [x] Create `/canvas` page (apps/web/src/app/canvas/)
- [x] Build Canvas component (Canvas2D.tsx)
  - [x] Pan & zoom (trackpad/mousewheel)
  - [x] D3-force graph layout with calculateLayout()
  - [x] Stable layout with seed (seed: 42, iterations: 300)
  - [x] Node rendering (all node types supported)
  - [x] Edge rendering (all edge types supported)
  - [x] Selection support (click, multi-select)
  - [ ] Lasso selection tool (NOT YET IMPLEMENTED)
  - [ ] Context menu on right-click (NOT YET IMPLEMENTED)
- [x] Node component variants (multiple components)
  - [x] Generic node rendering with color coding
  - [x] Hover state handling
  - [x] Selection state (normal, hover, selected)
  - [ ] Advanced cards with thumbnails (PARTIAL)
- [x] Canvas Layout (CanvasLayout.tsx)
  - [x] Upload modal integration
  - [x] Chat import modal integration
  - [x] FirstTimeUploadModal for onboarding
  - [ ] Full FourRegionLayout (SIMPLIFIED VERSION)
- [ ] Selection Stack (RHS) (NOT YET IMPLEMENTED)
  - [ ] Multi-select support
  - [ ] Collapsible tiles per selected node
  - [ ] Quick actions (Add to Scope, Sequester, Open)
- [ ] Scope builder UI (NOT YET IMPLEMENTED)
  - [ ] Include/exclude toggles
  - [ ] Token estimate display
  - [ ] Save scope button

### Backend Tasks ✅

- [x] Board CRUD endpoints (boards.ts)
  - [x] `GET /api/v1/boards` - List boards
  - [x] `POST /api/v1/boards` - Create board
  - [x] `GET /api/v1/boards/:id` - Get board details
  - [x] `GET /api/v1/boards/:id/graph` - Get full graph for board
  - [x] `PUT /api/v1/boards/:id` - Update board
  - [x] `DELETE /api/v1/boards/:id` - Delete board
- [x] Graph query service
  - [x] Fetch nodes with relationships (nodes.ts, edges.ts)
  - [x] Filter by node types (getNodesByKind)
  - [x] Edge queries by node (getNodeEdges)
  - [ ] Pagination for large graphs (NOT YET IMPLEMENTED)
  - [ ] Layout hints/positions storage (NOT YET IMPLEMENTED)

### Graph Package

- [x] Layout algorithm utilities (apps/web/src/lib/layout/)
  - [x] D3-force wrapper (calculateLayout function)
  - [x] Stable seed-based positioning (seed: 42)
  - [x] Force simulation configuration
- [x] Basic node/edge utilities
  - [x] Transform handling (pan/zoom state)
  - [x] Canvas coordinate calculations
  - [ ] Distance calculations (PARTIAL)
  - [ ] Intersection detection for lasso (NOT YET IMPLEMENTED)
  - [ ] Collision detection (NOT YET IMPLEMENTED)

---

## Phase 1D: Claims & UnifiedDocs ❌ NOT STARTED

**Timeline**: Future (1-2 weeks estimated)
**Status**: ❌ Not yet implemented
**Goal**: Users can extract claims manually and generate L0 docs

### Backend Tasks

- [ ] Claims CRUD endpoints (NOT YET IMPLEMENTED)
  - [ ] `POST /api/v1/claims/extract` - Manual extraction (rule-based)
  - [ ] `GET /api/v1/claims` - List claims
  - [ ] `PUT /api/v1/claims/:id` - Update claim
  - [ ] `POST /api/v1/claims/:id/verify` - Queue verification (stub for Pro)
- [ ] UnifiedDoc endpoints (NOT YET IMPLEMENTED)
  - [ ] `POST /api/v1/docs/compose` - Generate L0 doc (rule-based stitching)
  - [ ] `GET /api/v1/docs/:id` - Retrieve doc
  - [ ] `GET /api/v1/docs/:id/citations` - Get citation graph
- [ ] Rule-based claim extraction (NOT YET IMPLEMENTED)
  - [ ] Parse structured data (JSON, CSV)
  - [ ] Extract code snippets as claims
  - [ ] Simple NLP rules for fact extraction
- [ ] L0 doc compiler (NOT YET IMPLEMENTED)
  - [ ] Aggregate claims into bullets
  - [ ] Add citations (node_id + span)
  - [ ] Enforce 5k token limit
  - [ ] Export to Markdown

### Frontend Tasks

- [ ] Claims panel UI (NOT YET IMPLEMENTED)
- [ ] UnifiedDoc viewer (NOT YET IMPLEMENTED)
- [ ] Sequester controls (NOT YET IMPLEMENTED)

### Database Tasks

- [x] Database supports claim node types (ObjectiveClaim in schema)
- [x] Database supports SUPPORTS, REFUTES edge types
- [x] Database supports DERIVES_FROM edges
- [ ] Claim-specific queries not yet implemented

---

## Phase 1E: Chat Import & Duplicate Detection ✅ COMPLETE

**Timeline**: Complete (prior sessions)
**Status**: ✅ All tasks completed
**Achievement**: Full chat import system with streaming, deduplication, and code extraction

### Backend Tasks ✅

- [x] Chat import endpoints (import.ts, import-enhanced.ts, import-stream.ts)
  - [x] `POST /api/v1/import/chat` - Basic chat import
  - [x] `POST /api/v1/import/chat/batch` - Batch import
  - [x] `POST /api/v1/import/enhanced` - Enhanced import with config
  - [x] `POST /api/v1/import/stream` - Streaming import
  - [x] `GET /api/v1/import/stream/progress/:id` - Progress tracking
  - [x] `DELETE /api/v1/import/stream/cancel/:id` - Cancel import
- [x] Duplicate detection service (duplicate-detection.ts)
  - [x] Multiple algorithms (jaccard, levenshtein, cosine, embedding)
  - [x] Configurable similarity thresholds
  - [x] Cross-conversation detection
  - [x] Duplicate grouping and candidate generation
  - [x] Manual review workflow
- [x] Code extraction service (code-extractor.ts)
  - [x] Extract code blocks from messages
  - [x] Language detection
  - [x] Global deduplication
  - [x] Min character threshold
- [x] Sources builder (sources-builder.ts)
  - [x] Stitch messages into sources
  - [x] Multiple strategies (by_chat, by_title, by_topic)
  - [x] Role-based filtering (user/assistant/both)
  - [x] Min character thresholds
  - [x] Markdown export
- [x] Similarity engine (similarity-engine.ts)
  - [x] Jaccard similarity
  - [x] Token-based comparison
  - [x] Configurable algorithms
- [x] Streaming JSON parsers (streaming-json-parser.ts, v2)
  - [x] Memory-efficient streaming
  - [x] Large file support (tested with 136MB files)
  - [x] Progress callbacks

### Frontend Tasks ✅

- [x] Chat import UI (ChatImportModal.tsx)
  - [x] File upload with drag-and-drop
  - [x] Platform detection (ChatGPT, Claude, etc.)
  - [x] Configuration options
  - [x] Import preview
- [x] Streaming upload modal (StreamingUploadModal.tsx)
  - [x] Real-time progress tracking
  - [x] File-by-file status
  - [x] Conversation count updates
  - [x] Error handling
  - [x] Cancel support
- [x] Duplicate resolution UI
  - [x] Duplicate group display
  - [x] Side-by-side comparison
  - [x] Decision interface (keep-primary, keep-duplicate, merge, keep-both)
  - [x] Bulk operations

### Database Tasks ✅

- [x] ChatThread, Message, Source, CodeBlock node types
- [x] CONTAINS, DERIVES_FROM, DUP_OF edge types
- [x] Efficient duplicate lookups
- [x] Streaming import support

---

## Phase 2: Pro Tier Features

**Timeline**: 4-6 weeks
**Goal**: Enable AI-powered features and verification

### Features

- [ ] Archetype nodes (Summarizer, Extractor, etc.)
- [ ] Agent runner framework
- [ ] Chat with scope + receipts
- [ ] HTTP/Schema verifiers
- [ ] Galaxy lens (3D WebGL)
- [ ] UnifiedDocs L0/L1 (5k/20k/50k)
- [ ] Vector embeddings for semantic clustering
- [ ] Scope algebra + query language

### Packages to Build

- [ ] `packages/agents` - Agent runner infrastructure
- [ ] `packages/verifiers` - Verification tools
- [ ] Embeddings service (Pinecone/Weaviate)
- [ ] Queue system (BullMQ + Redis)

---

## Phase 3: Business Tier Features

**Timeline**: 6-8 weeks
**Goal**: Enable org features and workflows

### Features

- [ ] BusinessNode + ProductGraph
- [ ] Action nodes (email, webhook, CRM)
- [ ] Multi-seat + SSO (Auth0/WorkOS)
- [ ] Scheduled agents
- [ ] PII governance + redacted-execute
- [ ] Audit logs
- [ ] Admin console (Instance Emulator + Config Registry)

### Infrastructure

- [ ] Email service (Resend/SendGrid)
- [ ] Webhook delivery system
- [ ] CRM integrations (HubSpot, Salesforce)
- [ ] Billing integration (Stripe)
- [ ] Monitoring (Sentry + PostHog)

---

## Phase 4: Polish & Scale

**Timeline**: 4-6 weeks

### Features

- [ ] Proof verifiers (Lean/Coq)
- [ ] Cross-board references
- [ ] Mobile-optimized UI
- [ ] Performance optimizations
  - [ ] LOD (level of detail)
  - [ ] Edge sampling
  - [ ] CRDT for collaboration
- [ ] Collaborative editing
- [ ] Advanced lenses (nD, Matrix, Timeline)

---

## Backlog / Future Enhancements

### Developer Experience

- [ ] Docker Compose for local dev
- [ ] CI/CD (GitHub Actions)
- [ ] Testing setup (Jest + React Testing Library)
- [ ] E2E tests (Playwright)
- [ ] Storybook for UI components
- [ ] API documentation (OpenAPI/Swagger)

### Features

- [ ] Real-time collaboration (WebSockets)
- [ ] Notebook sandbox (Jupyter kernel)
- [ ] Graph diffing across receipts
- [ ] Export to various formats (PDF, Notion, Obsidian)
- [ ] Import adapters (Slack, Notion, Confluence)
- [ ] Desktop app (Electron)
- [ ] Browser extension
- [ ] CLI tool

### Performance

- [ ] GraphQL API (alternative to REST)
- [ ] Server-side rendering optimization
- [ ] Edge caching (Vercel/Cloudflare)
- [ ] Database read replicas
- [ ] Horizontal scaling strategy

---

## Current Focus

**🎯 Next Phase: Phase 1D (Claims & UnifiedDocs) OR Phase 2 (Pro Features)**

### What's Complete ✅

- ✅ **Phase 1A**: Foundation (monorepo, TypeScript, Next.js, Express)
- ✅ **Phase 1-5**: Chat Import System (streaming, services, frontend, testing)
- ✅ **Phase 6**: Local-First Migration (SQLite, DatabaseClient, 20+ endpoints)
- ✅ **Phase 7**: Frontend Connection (60+ components, D3 visualization)
- ✅ **Phase 1B**: File Ingest & Autogroup (upload, fingerprinting, grouping)
- ✅ **Phase 1C**: 2D Canvas Visualization (mostly complete, some advanced features pending)
- ✅ **Phase 1E**: Chat Import & Duplicate Detection (full system with streaming)

### What's Pending ⚠️

- **Phase 1B**: Rate limiting and circuit breaker (quota enforcement)
- **Phase 1C**: Lasso selection, context menus, selection stack, scope builder
- ❌ **Phase 1D**: Claims extraction and UnifiedDocs (not started)
- ❌ **Phase 2**: Pro Tier Features (agents, verifiers, embeddings)
- ❌ **Phase 3**: Business Tier Features (actions, SSO, governance)

### Recommended Next Steps

1. **Option A: Complete Phase 1C Advanced Features**
   - Implement lasso selection tool
   - Build context menu on right-click
   - Create selection stack (RHS panel)
   - Build scope builder UI

2. **Option B: Start Phase 1D (Claims & UnifiedDocs)**
   - Create claims CRUD endpoints
   - Implement rule-based claim extraction
   - Build L0 doc compiler
   - Create claims panel UI

3. **Option C: Add Missing Phase 1B Features**
   - Implement rate limiting middleware
   - Add circuit breaker for quota enforcement
   - Add URL ingest support

4. **Option D: Begin Phase 2 (Pro Features)**
   - Create agent runner framework
   - Implement HTTP/Schema verifiers
   - Add vector embeddings for semantic search
   - Build 3D Galaxy lens

---

**Last Updated**: October 12, 2025
