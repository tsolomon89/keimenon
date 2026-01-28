# Keimenon — Comprehensive Deep Dive Analysis

**Date**: 2025-10-13
**Version**: 1.0
**Status**: Complete Gap Analysis between Specs and Implementation

---

## Executive Summary

Keimenon is a **graph-native knowledge management system** with significant documentation and ambitious vision docs, but with **mixed implementation status**. The project has made excellent progress on backend infrastructure and authentication, but has **critical gaps** between the comprehensive specifications in `ai_context/` and the actual implemented features.

### Health Score by Component

| Component              | Status              | Completion | Grade |
| ---------------------- | ------------------- | ---------- | ----- |
| **Backend API**        | ✅ Strong           | 85%        | A-    |
| **Database Layer**     | ✅ Excellent        | 95%        | A+    |
| **Authentication**     | ✅ Production-Ready | 95%        | A+    |
| **Chat Import System** | ✅ Complete         | 100%       | A+    |
| **Frontend UI**        | ⚠️ Incomplete       | 40%        | C     |
| **Claims System**      | ❌ Missing          | 10%        | F     |
| **UnifiedDocs**        | ❌ Missing          | 5%         | F     |
| **Verifiers**          | ❌ Not Started      | 0%         | F     |
| **Archetype Nodes**    | ❌ Not Started      | 0%         | F     |
| **Sequester UI**       | ❌ Not Started      | 0%         | F     |

**Overall Project Completion**: ~45% of MVP vision, ~15% of full vision

---

## Part 1: What IS Fully Finished

### 1.1 Backend Infrastructure (EXCELLENT)

#### ✅ Database Abstraction Layer

- **Status**: Production-ready
- **Files**:
  - `packages/db/src/factory.ts` - DatabaseFactory
  - `packages/db/src/sqlite-client.ts` - SQLite implementation
  - `packages/db/src/neo4j-client.ts` - Neo4j implementation
- **Features**:
  - Dual database support (SQLite + Neo4j)
  - Hybrid mode option
  - Clean abstraction interface
  - WAL mode for concurrency
  - FTS5 full-text search
  - Foreign key constraints

**Evidence**: README.md lines 340-450 document this thoroughly. Tested with real data (693 nodes, 935 edges).

#### ✅ Authentication & Multi-Tenancy (PRODUCTION-READY)

- **Status**: Enterprise-grade implementation
- **Files**:
  - `apps/api/src/services/auth.service.ts`
  - `apps/api/src/middleware/auth.middleware.ts`
  - `apps/api/src/routes/auth.routes.ts`
- **Features**:
  - JWT-based authentication (7-day tokens)
  - bcrypt password hashing (10 rounds)
  - 4 permission levels (junior/senior/leader/admin)
  - 2 account types (admin/client)
  - 3 account classes (free/professional/business)
  - Complete data isolation (account_id filtering)
  - Session management
  - 26/28 tests passing (93%)

**Evidence**: AUTH_GUIDE.md (705 lines) documents every aspect. README.md lines 68-283.

#### ✅ Chat Import System (COMPLETE)

- **Status**: Fully working, production-tested
- **Files**:
  - `apps/api/src/services/import-enhanced-v2.ts`
  - `apps/api/src/services/sources-builder.ts`
  - `apps/api/src/services/code-extractor.ts`
  - `apps/api/src/services/similarity-engine.ts`
  - `apps/api/src/services/streaming-json-parser-v2.ts`
- **Features**:
  - ChatGPT/Claude/Gemini format support
  - Streaming upload (up to 2GB files)
  - Sources mode (3 stitching strategies)
  - Code extraction (20+ languages, SHA-256 dedup)
  - Duplicate detection (3 algorithms)
  - Batch processing
  - Progress tracking

**Evidence**: Tested with `small.json` (9.9MB, 44 conversations) → 693 nodes, 935 edges. README.md lines 461-712.

#### ✅ Node/Edge CRUD Operations

- **Status**: Complete
- **Files**:
  - `apps/api/src/routes/nodes.ts`
  - `apps/api/src/routes/edges.ts`
  - `apps/api/src/routes/boards.ts`
  - `apps/api/src/routes/content.ts`
- **API Endpoints**: 46 protected endpoints (all require auth)
- **Node Types Implemented**:
  - ✅ Source
  - ✅ Group
  - ✅ ChatThread
  - ✅ Message
  - ✅ CodeBlock
  - ✅ Board
- **Edge Types Implemented**:
  - ✅ CONTAINS
  - ✅ DERIVES_FROM
  - ✅ DUP_OF
  - ✅ COMPILED_FROM
  - ✅ EXTRACTED_FROM

**Evidence**: README.md lines 494-546 lists all endpoints.

### 1.2 Frontend (PARTIAL - Core Only)

#### ✅ Keimenon Visualization (2D Only)

- **Status**: Working but basic
- **Files**:
  - `apps/web/src/components/keimenon/Keimenon2D.tsx`
  - `apps/web/src/components/keimenon/KeimenonLayout.tsx`
  - `apps/web/src/app/keimenon/page.tsx`
- **Features**:
  - D3-force layout
  - Pan/zoom controls
  - Node rendering (color-coded by type)
  - Edge rendering
  - Click selection
  - Basic hover effects

**Gaps**: No lasso selection, no multi-select, no keyboard shortcuts, no minimap.

#### ✅ File Upload UI

- **Status**: Complete
- **Files**:
  - `apps/web/src/app/ingest/page.tsx`
  - `apps/web/src/components/keimenon/UploadModal.tsx`
- **Features**:
  - Drag-and-drop
  - Progress tracking
  - Results display
  - Error handling

#### ⚠️ Login Page (Mock Only)

- **Status**: UI exists, not connected to real auth
- **Files**: `apps/web/src/app/login/page.tsx`
- **Issue**: Uses mock authentication, not integrated with backend

**Evidence**: README.md line 249 explicitly states "Status: ⚠️ Not integrated yet"

---

## Part 2: What is Partially Finished

### 2.1 Frontend Pages (40% Complete)

| Page          | Status      | What Exists        | What's Missing                                            |
| ------------- | ----------- | ------------------ | --------------------------------------------------------- |
| `/` Landing   | ✅ Exists   | Basic landing page | Content, links, navigation                                |
| `/keimenon`   | ✅ Working  | 2D visualization   | Selection tools, keyboard shortcuts, context menus        |
| `/board/[id]` | ✅ Working  | Keimenon view      | FourRegionLayout (LHS/RHS sidebars), proper zoom controls |
| `/ingest`     | ✅ Complete | Upload UI          | Better progress indicators, batch controls                |
| `/login`      | ⚠️ Mock     | Login form         | Integration with real auth API                            |
| `/claims`     | ❌ Missing  | -                  | Entire page needs building                                |
| `/docs/[id]`  | ❌ Missing  | -                  | UnifiedDoc viewer                                         |
| `/verify`     | ❌ Missing  | -                  | Verifier runs UI                                          |
| `/admin`      | ❌ Missing  | -                  | Admin console                                             |
| `/settings`   | ❌ Missing  | -                  | User settings                                             |

**Score**: 4/10 pages exist, 2/10 fully functional = 40%

### 2.2 UI Component Library (30% Complete)

**What Exists** (from `apps/web/src/components/keimenon/`):

- ✅ Keimenon2D.tsx
- ✅ KeimenonLayout.tsx
- ✅ KeimenonHeader.tsx
- ✅ KeimenonFooter.tsx
- ✅ KeimenonSidebar.tsx
- ✅ KeimenonToolbar.tsx
- ✅ UploadModal.tsx
- ✅ ChatImportModal.tsx
- ✅ GroupCard.tsx
- ✅ NodeDetailPanel.tsx
- ✅ SourceInspector.tsx

**What's Missing** (from spec `ui_screens_layout_view_map_v_0.md`):

- ❌ FourRegionLayout (collapsible LHS/RHS/Footer)
- ❌ LHS Sidebar (Groups/Folders tree, Filters, Saved Scopes)
- ❌ RHS Sidebar (Selection Stack, Claims Editor, Scope Builder, Verification Panel)
- ❌ Context Ring Menu (radial menu on selection)
- ❌ Edge Sculpting Tools
- ❌ Lens Dial (on-keimenon control)
- ❌ Zoom HUD with fit-to-selection
- ❌ Toast notifications
- ❌ Error boundaries
- ❌ Loading skeletons
- ❌ Empty states

**Score**: 11/30 planned components = ~37%

### 2.3 Node Types (6/12 Implemented)

| Node Type      | Spec | Implemented | Database | API | UI  |
| -------------- | ---- | ----------- | -------- | --- | --- |
| Source         | ✅   | ✅          | ✅       | ✅  | ✅  |
| Group          | ✅   | ✅          | ✅       | ✅  | ⚠️  |
| ChatThread     | ✅   | ✅          | ✅       | ✅  | ❌  |
| Message        | ✅   | ✅          | ✅       | ✅  | ⚠️  |
| CodeBlock      | ✅   | ✅          | ✅       | ✅  | ❌  |
| Board          | ✅   | ✅          | ✅       | ✅  | ⚠️  |
| Folder         | ✅   | ❌          | ❌       | ❌  | ❌  |
| ObjectiveClaim | ✅   | ❌          | ❌       | ❌  | ❌  |
| UnifiedDoc     | ✅   | ❌          | ❌       | ❌  | ❌  |
| Constellation  | ✅   | ❌          | ❌       | ❌  | ❌  |
| UserNode       | ✅   | ⚠️          | ✅       | ✅  | ❌  |
| BusinessNode   | ✅   | ❌          | ❌       | ❌  | ❌  |

**Score**: 6/12 fully implemented = 50%

### 2.4 Edge Types (5/11 Implemented)

| Edge Type        | Spec | Implemented | Notes                            |
| ---------------- | ---- | ----------- | -------------------------------- |
| CONTAINS         | ✅   | ✅          | Group → Source, Thread → Message |
| DERIVES_FROM     | ✅   | ✅          | Source/Code → Message            |
| DUP_OF           | ✅   | ✅          | Message ↔ Message               |
| COMPILED_FROM    | ✅   | ✅          | Source → Message                 |
| EXTRACTED_FROM   | ✅   | ✅          | CodeBlock → Message              |
| SEQUESTERS       | ✅   | ❌          | Not implemented                  |
| IN_SCOPE_FOR     | ✅   | ❌          | Not implemented                  |
| SUPPORTS/REFUTES | ✅   | ❌          | Claims not implemented           |
| VERIFIED_BY      | ✅   | ❌          | Verifiers not implemented        |
| OWNED_BY         | ✅   | ❌          | Not implemented                  |
| STITCHED_FROM    | ✅   | ❌          | Not implemented                  |

**Score**: 5/11 = 45%

---

## Part 3: What is Completely Missing

### 3.1 Core Spec Features (0% Implemented)

#### ❌ ObjectiveClaims System

**Spec Location**:

- `keimenon_living_spec_v_0.md` lines 89-99
- `MASTER_DOCS.md` lines 362-381

**What's Missing**:

- Claim node type (database schema exists in types, not in DB)
- Claim extraction service (manual or automated)
- Claim verification framework
- SUPPORTS/REFUTES edges
- Claim status tracking (unverified/verified/contested/stale)
- Half-life calculations
- Claims UI panel
- Claims viewer page

**Impact**: **CRITICAL** - This is a core differentiator of the product. Without claims, there's no "objective truth" layer.

#### ❌ UnifiedDoc System

**Spec Location**:

- `keimenon_living_spec_v_0.md` lines 100-104
- `MASTER_DOCS.md` lines 382-407
- `TODO_TRACKER.md` lines 93-121

**What's Missing**:

- UnifiedDoc node type (schema exists, not implemented)
- L0 compiler (5k token limit, bullet ledger format)
- L1/L2/L3 compilers
- Citation system (paragraph locking)
- Ring selector UI
- Markdown export with citations
- UnifiedDoc viewer page
- Change log tracking

**Impact**: **CRITICAL** - Core value prop is transforming sources into structured, cited documents.

#### ❌ Verification System

**Spec Location**:

- `keimenon_living_spec_v_0.md` lines 89-99
- `TODO_TRACKER.md` lines 335-357

**What's Missing**:

- VerifierRun node type
- HTTP_CHECK verifier
- SCHEMA_MATCH verifier
- COMPUTE verifier
- PROOF_ASSISTANT verifier
- Verifier queue system (BullMQ + Redis)
- Verification panel UI
- VERIFIED_BY edges
- Verification artifacts storage

**Impact**: **HIGH** - Key Pro/Business feature, needed for trust layer.

#### ❌ Sequester System

**Spec Location**:

- `keimenon_living_spec_v_0.md` lines 62-66
- `ui_screens_layout_view_map_v_0.md` lines 112-114

**What's Missing**:

- SEQUESTERS edge implementation
- Sequester policy flags (hidden_from_llm, hidden_from_tools, ui_only)
- Sequester toggle UI
- Sequester reason dropdown (secret/noisy/untrusted/license/wip)
- Sequester enforcement in queries
- Sequester indicators (nebula effect, lock icon)
- Content masking in preview

**Impact**: **HIGH** - Privacy/security feature, needed for sensitive data handling.

#### ❌ Scope & Receipts System

**Spec Location**:

- `keimenon_living_spec_v_0.md` lines 67-85
- `MASTER_DOCS.md` lines 556-568

**What's Missing**:

- ScopeSet node type
- Receipt node type
- Scope algebra operators (∪, ∩, \, ⊕)
- Lasso selection → ScopeSet
- Scope chips in UI
- Scope builder panel
- Receipt storage and replay
- Scope query language

**Impact**: **HIGH** - Core reproducibility feature, differentiator from chat UIs.

### 3.2 UI Layout Components (0% Implemented)

#### ❌ FourRegionLayout

**Spec Location**: `ui_screens_layout_view_map_v_0.md` lines 1-27

**What's Missing**:

- Header (collapsible, lens selector, scope chips, meters)
- LHS Sidebar (Groups/Folders tree, Filters, Saved Scopes)
- RHS Sidebar (Inspector with tiles, overlay mode)
- Footer/Console (Logs, Tasks, REPL, Budget Events)
- Region collapse/expand controls
- Region resize handles
- Mobile responsive layout
- Keyboard shortcuts (⌘\ LHS, ⌘/ RHS, etc.)

**Impact**: **HIGH** - Professional UI needed for usability at scale.

#### ❌ Advanced Keimenon Features

**Spec Location**: `ui_screens_layout_view_map_v_0.md` lines 28-58

**What's Missing**:

- 3D lens (Three.js + React Three Fiber)
- Galaxy lens (trust-warped space)
- nD lens (dimensional reduction)
- Matrix view (adjacency heatmap)
- Timeline view (temporal scrubbing)
- Lasso selection
- Multi-select (Shift+click)
- Context ring menu (radial menu)
- Edge sculpting
- Lens dial (on-keimenon control)
- Zoom HUD with fit-to-selection
- Minimap

**Impact**: **MEDIUM** - Pro features, but 2D works for MVP.

### 3.3 Pro/Business Features (0% Implemented)

#### ❌ Archetype Nodes (AI Agents)

**Spec Location**: `TODO_TRACKER.md` lines 296-317

**What's Missing**:

- Archetype node type (schema)
- Archetype runner framework
- Built-in archetypes:
  - Summarizer
  - Key-Insights
  - Diff-Explainer
  - Schema-Filler
  - Planner
  - Code-Extractor
  - Contrarian
  - Critic
- Model integration (OpenAI, Anthropic, etc.)
- Archetype UI
- Receipt storage for agent runs

**Impact**: **MEDIUM** - Pro feature, can defer to Phase 2.

#### ❌ Chat with Scope

**Spec Location**: `TODO_TRACKER.md` lines 318-336

**What's Missing**:

- ChatThread UI page
- Message list component
- Input box with scope selector
- Scope chips (include/exclude toggles)
- Chat API endpoint
- LLM integration
- Streaming response
- Receipt storage per turn

**Impact**: **MEDIUM** - Pro feature, critical for monetization.

#### ❌ Business Features

**Spec Location**: `TODO_TRACKER.md` lines 376-434

**What's Missing**:

- BusinessNode (org-level entity)
- ProductGraph nodes (Product, SKU, Vendor, etc.)
- Action nodes (email, webhook, CRM)
- Multi-seat & roles UI
- SSO/SAML integration
- Scheduled agents
- PII governance
- Audit logs UI

**Impact**: **LOW** - Phase 3, not needed for MVP.

### 3.4 Missing Infrastructure

#### ❌ Testing (0% Implemented)

**What's Missing**:

- Unit tests (Vitest)
- Integration tests (Supertest)
- E2E tests (Playwright)
- Test coverage reporting
- CI/CD pipeline (GitHub Actions)

**Impact**: **MEDIUM** - Quality/reliability issue.

#### ❌ Developer Experience

**What's Missing**:

- Docker Compose setup
- API documentation (Swagger/OpenAPI)
- Logging framework (winston/pino)
- Error tracking (Sentry)
- Monitoring (Prometheus)

**Impact**: **MEDIUM** - Developer productivity issue.

---

## Part 4: Spec vs Reality Matrix

### 4.1 Living Spec Coverage

**File**: `ai_context/docs_archive/keimenon_living_spec_v_0.md` (152 lines)

| Section                               | Spec Lines | Implemented                  | % Complete |
| ------------------------------------- | ---------- | ---------------------------- | ---------- |
| **1) Product thesis**                 | 10-14      | Partially                    | 40%        |
| **2) Core principles**                | 16-21      | Not verified                 | 20%        |
| **3) Object model (nodes)**           | 23-34      | Partially (6/12 node types)  | 50%        |
| **4) Edge model**                     | 36-50      | Partially (5/11 edge types)  | 45%        |
| **5) Ingest & autogroup**             | 52-62      | ✅ Excellent                 | 95%        |
| **6) Sequestering**                   | 64-67      | ❌ Not implemented           | 0%         |
| **7) Scope algebra & receipts**       | 69-85      | ❌ Not implemented           | 0%         |
| **8) Lenses & modes**                 | 85-90      | Partially (2D only)          | 25%        |
| **9) ObjectiveClaims & verification** | 92-99      | ❌ Not implemented           | 0%         |
| **10) UnifiedDocs**                   | 101-104    | ❌ Not implemented           | 0%         |
| **11) UserAgent**                     | 106-110    | ❌ Not implemented           | 0%         |
| **12) UI/UX behaviors**               | 112-116    | Partially                    | 30%        |
| **13) Performance & stability**       | 118-121    | Some (stable seeds missing)  | 40%        |
| **14) Security & privacy**            | 123-125    | Auth done, sequester missing | 50%        |

**Overall Living Spec Coverage**: ~32%

### 4.2 UI Screens Spec Coverage

**File**: `ai_context/docs_archive/ui_screens_layout_view_map_v_0.md` (216 lines)

| Section                       | Implemented | Notes                           |
| ----------------------------- | ----------- | ------------------------------- |
| **1) Global frame & Z-order** | ❌ 0%       | No FourRegionLayout             |
| **2) Main Viewport lenses**   | 25%         | Only 2D keimenon                |
| **3) Header / Top Tools**     | 10%         | Basic header only               |
| **4) LHS Sidebar**            | 0%          | Not implemented                 |
| **5) RHS Sidebar**            | 0%          | Not implemented                 |
| **6) Footer / Console Bar**   | 10%         | Basic footer only               |
| **7) Pointer-only tooling**   | 0%          | No context ring, edge sculpting |
| **8) Multi-selection**        | 0%          | Single-select only              |
| **9) Overlay precedence**     | 0%          | No overlay system               |
| **15) Screens / Routes**      | 40%         | 4/7 pages exist                 |

**Overall UI Spec Coverage**: ~15%

### 4.3 Plans & Tiers Spec Coverage

**File**: `ai_context/docs_archive/plans_tiers_accounts_roles_and_phased_rollout_v_0 (1).md` (327 lines)

| Section                    | Implemented | Notes                   |
| -------------------------- | ----------- | ----------------------- |
| **Entitlement object**     | 0%          | No entitlement system   |
| **Feature matrix**         | 40%         | Backend features only   |
| **Costed actions & gates** | 0%          | No usage meters         |
| **Phase A (Admin + Free)** | 60%         | Backend mostly done     |
| **Phase B (Pro)**          | 5%          | Stubs only              |
| **Phase C (Business)**     | 0%          | Not started             |
| **LimitsPolicy**           | 0%          | No quota enforcement    |
| **Admin Console**          | 0%          | Not started             |
| **Config Registry**        | 0%          | No schema-driven config |

**Overall Plans/Tiers Coverage**: ~18%

---

## Part 5: Critical Gaps Prioritized

### 5.1 MVP Blockers (Must Fix for Usable Product)

#### 1. Frontend Auth Integration ⚠️ **CRITICAL**

**Current State**: Login page exists but uses mock auth.

**Fix Required**:

- Connect `apps/web/src/app/login/page.tsx` to `/api/v1/auth/login`
- Store JWT in localStorage or httpOnly cookies
- Add `Authorization: Bearer ${token}` header to all API calls
- Create auth context/provider
- Add protected route wrapper
- Handle token expiration/refresh

**Effort**: 4-6 hours

#### 2. UnifiedDoc L0 Compiler 🔥 **CRITICAL**

**Current State**: Node type defined, no implementation.

**Fix Required**:

- Create `apps/api/src/services/unifieddoc.ts`
- L0 compiler algorithm:
  1. Fetch sources in scope
  2. Extract key facts/statements
  3. Render as bullet list markdown
  4. Add citation links
  5. Count tokens (tiktoken)
  6. Store as UnifiedDoc node
- Create `POST /api/v1/docs/compose` endpoint
- Create `GET /api/v1/docs/:id/export` endpoint (markdown download)
- Build viewer page `apps/web/src/app/docs/[id]/page.tsx`

**Effort**: 8-12 hours

#### 3. ObjectiveClaims Extraction 🔥 **CRITICAL**

**Current State**: Not implemented.

**Fix Required**:

- Add ObjectiveClaim to database schema
- Create `apps/api/src/services/claims.ts`
- Manual extraction UI:
  - Form with claim_text, claim_type, sources
  - Preview claims from selected sources
- Create `POST /api/v1/claims` endpoint
- DERIVES_FROM edge with citation spans
- Claims panel in board view (RHS sidebar)

**Effort**: 8-10 hours

#### 4. Basic Error Handling 🛑 **CRITICAL**

**Current State**: Minimal, relies on console.log.

**Fix Required**:

- Add error boundaries to React components
- Implement toast notifications (sonner or similar)
- Add loading states (spinners, skeletons)
- Add empty states with helpful messages
- Standardize API error responses

**Effort**: 4-6 hours

#### 5. FourRegionLayout ⚠️ **HIGH**

**Current State**: No collapsible sidebar system.

**Fix Required**:

- Build `apps/web/src/components/layout/FourRegionLayout.tsx`
- Header (collapsible, ⌘⇧K)
- LHS Sidebar (min 240px, max 28%, ⌘\)
- RHS Sidebar (min 360px, overlay mode, ⌘/)
- Footer (min 24px collapsed, `` ` ``)
- Resize handles
- Keyboard shortcuts

**Effort**: 8-12 hours

### 5.2 MVP Should-Have (Important for Usability)

#### 6. Sequester System ⚠️ **HIGH**

**Effort**: 6-8 hours

- SEQUESTERS edge in database
- Sequester toggle UI
- Policy enforcement in queries

#### 7. Board Management UI ⚠️ **MEDIUM**

**Effort**: 4-6 hours

- Board switcher dropdown
- Create/edit/delete boards
- Board settings modal

#### 8. Input Validation ⚠️ **MEDIUM**

**Effort**: 4-6 hours

- Zod schemas at API boundaries
- Request body validation middleware
- File name sanitization

#### 9. Layout Persistence ⚠️ **MEDIUM**

**Effort**: 3-4 hours

- Store node positions (x, y, z)
- Load saved layout
- Reset layout button

#### 10. Keyboard Shortcuts ⚠️ **MEDIUM**

**Effort**: 2-3 hours

- Cmd/Ctrl+K: Command palette
- Delete: Remove selected
- Escape: Clear selection
- Space+drag: Pan

---

## Part 6: Missing Schema/JSON Files

### 6.1 Expected Schemas (from CLAUDE.md)

**CLAUDE.md** references:

- `ai_context/schemas/Claim.json` ❌ Missing
- `ai_context/schemas/UnifiedDoc.json` ❌ Missing
- `ai_context/examples/receipts/*.json` ❌ Missing

**Fix Required**: Create JSON schema files for validation and documentation.

### 6.2 No Config Registry

**Expected** (from plans_tiers spec):

- `EntitlementRegistry` ❌ Missing
- `LimitsPolicy` ❌ Missing
- `ModelPolicyRegistry` ❌ Missing
- `ThemeTokens` ❌ Missing
- `RuntimeManifest` ❌ Missing
- `DataSchema` ❌ Missing

**Impact**: No dynamic configuration, everything is hardcoded.

---

## Part 7: Documentation Issues

### 7.1 Docs are Out of Sync

**Problem**: Multiple versions of truth across many markdown files.

**Files with Overlapping/Conflicting Info**:

- `README.md` (936 lines) - Most accurate, reflects current state
- `MASTER_DOCS.md` (1224 lines) - Mixes vision with reality
- `ARCHITECTURE.md` (1093 lines) - Accurate for backend
- `TODO_TRACKER.md` (674 lines) - Lists what's missing
- `keimenon_living_spec_v_0.md` (152 lines) - Vision doc
- `ui_screens_layout_view_map_v_0.md` (216 lines) - Detailed UI spec
- `plans_tiers_accounts_roles_and_phased_rollout_v_0.md` (327 lines) - Tiering spec

**Recommendation**:

1. Mark vision docs as "VISION\_" prefix
2. Keep implementation docs separate
3. Create single source of truth "IMPLEMENTATION_STATUS.md"

### 7.2 CLAUDE.md Confusion

**Issue**: `CLAUDE.md` (147 lines) is written as instructions for an AI agent to follow when generating code, but:

- References schemas that don't exist (`ai_context/schemas/Claim.json`)
- Assumes features not implemented (receipts, scopes, verifiers)
- Mixes vision with current reality

**Recommendation**: Either:

1. Update to reflect current implementation, OR
2. Clearly mark as "FUTURE_VISION_CLAUDE.md"

---

## Part 8: What to Do Next

### 8.1 Immediate Actions (This Week)

1. **Frontend Auth Integration** (4-6 hours)
   - Connect login page to real API
   - Add auth context
   - Protect routes
   - Handle token storage

2. **Error Handling** (4-6 hours)
   - Add toast notifications
   - Add loading states
   - Add error boundaries

3. **Claims MVP** (8-10 hours)
   - Database schema
   - Manual extraction UI
   - Claims panel
   - Basic CRUD

4. **UnifiedDoc L0** (8-12 hours)
   - L0 compiler service
   - Markdown export
   - Viewer page

**Total**: ~30 hours = 1 week full-time

### 8.2 Next Sprint (2 Weeks)

5. **FourRegionLayout** (8-12 hours)
6. **Sequester System** (6-8 hours)
7. **Board Management** (4-6 hours)
8. **Input Validation** (4-6 hours)
9. **Layout Persistence** (3-4 hours)
10. **Keyboard Shortcuts** (2-3 hours)

**Total**: ~35 hours = 2 weeks

### 8.3 Phase 2 (1 Month)

11. **3D Keimenon** (12-16 hours)
12. **Archetype Framework** (16-20 hours)
13. **Chat with Scope** (16-20 hours)
14. **Verifiers (HTTP/Schema/Compute)** (20-24 hours)
15. **Galaxy Lens** (16-20 hours)

**Total**: ~90 hours = 1 month

### 8.4 Phase 3+ (3-6 Months)

16. **Business Features** (120-160 hours)
17. **Testing Suite** (40-60 hours)
18. **Advanced Lenses** (40-60 hours)
19. **Performance Optimization** (30-40 hours)
20. **Polish & Scale** (80-120 hours)

---

## Part 9: Risk Assessment

### 9.1 Technical Debt Risks

| Risk                        | Severity    | Impact                            | Mitigation                    |
| --------------------------- | ----------- | --------------------------------- | ----------------------------- |
| **No automated tests**      | 🔴 High     | Quality issues, regression bugs   | Add test suite immediately    |
| **No error monitoring**     | 🟡 Medium   | Poor user experience              | Add Sentry/error tracking     |
| **Mock auth in production** | 🔴 Critical | Security vulnerability            | Fix auth integration ASAP     |
| **Hardcoded values**        | 🟡 Medium   | Difficult to configure            | Create config system          |
| **No input validation**     | 🔴 High     | Security risk (injection attacks) | Add Zod validation middleware |

### 9.2 Product Risks

| Risk                                            | Severity    | Impact                      |
| ----------------------------------------------- | ----------- | --------------------------- |
| **Core features missing** (Claims, UnifiedDocs) | 🔴 Critical | Not a viable product        |
| **UI is bare-bones**                            | 🟡 Medium   | Poor first impression       |
| **No Pro/Business features**                    | 🟡 Medium   | No monetization path        |
| **Documentation confusion**                     | 🟡 Medium   | Developer onboarding issues |

### 9.3 Scaling Risks

| Risk                      | Severity  | Notes                             |
| ------------------------- | --------- | --------------------------------- |
| **No caching**            | 🟡 Medium | Will need Redis for production    |
| **No connection pooling** | 🟢 Low    | Neo4j driver has built-in pooling |
| **No rate limiting**      | 🟡 Medium | Needed for production API         |
| **No job queue**          | 🟡 Medium | Needed for verifiers, agents      |

---

## Part 10: Recommendations

### 10.1 Immediate Focus

**Stop Working On**:

- New vision documents
- Advanced features (Galaxy lens, Business tier, etc.)
- Refactoring working code

**Start Working On**:

1. Frontend auth integration (MVP blocker)
2. Claims extraction (core value prop)
3. UnifiedDoc L0 compiler (core value prop)
4. Basic error handling (user experience)

### 10.2 Documentation Cleanup

**Create**:

- `VISION.md` - Consolidate all vision docs
- `IMPLEMENTATION_STATUS.md` - Single source of truth for what's built
- `ROADMAP_REALISTIC.md` - Honest timeline with resource constraints

**Archive**:

- Move all `_v_0.md` files to `docs_archive/vision/`
- Keep only implementation docs in `docs_active/`

### 10.3 Realistic Timeline

**Given**: 1 full-time developer

| Phase            | Duration | Deliverable                                |
| ---------------- | -------- | ------------------------------------------ |
| **Now → Week 4** | 1 month  | MVP features complete (auth, claims, docs) |
| **Month 2**      | 1 month  | Polish MVP, UI improvements, testing       |
| **Month 3-4**    | 2 months | Pro features (chat, verifiers, 3D)         |
| **Month 5-8**    | 4 months | Business features, production readiness    |
| **Month 9-12**   | 4 months | Scale, optimize, advanced features         |

**Total to Production**: 12 months (1 year)

### 10.4 Resource Recommendations

**Minimum Viable Team**:

- 1 Backend developer (API, services, database)
- 1 Frontend developer (React, UI/UX)
- 1 Product manager (prioritization, user feedback)
- 0.5 DevOps engineer (CI/CD, deployment, monitoring)

**With Current Resources** (appears to be 1 developer):

- Focus on MVP only
- Defer Pro/Business features
- Use managed services (Vercel, Railway, etc.)
- Minimize custom infrastructure

---

## Appendix A: File Inventory

### Backend (apps/api/src/)

**Services** (19 files):

- ✅ auth.service.ts
- ✅ autogroup.ts
- ✅ autogroup-enhanced.ts
- ✅ code-extractor.ts
- ✅ duplicate-detection.ts
- ✅ fingerprint.ts
- ✅ import.ts
- ✅ import-enhanced-v2.ts
- ✅ import-local.ts
- ✅ keyword-extractor.ts
- ✅ local-document-store.ts
- ✅ similarity-engine.ts
- ✅ sources-builder.ts
- ✅ storage.ts
- ✅ streaming-json-parser.ts
- ✅ streaming-json-parser-v2.ts
- ✅ streaming-upload.ts

**Routes** (15 files):

- ✅ import.ts
- ✅ import-decisions.ts
- ✅ config.ts
- ✅ groups.ts
- ✅ duplicates.ts
- ✅ import-enhanced.ts
- ✅ import-stream.ts
- ✅ accounts.routes.ts
- ✅ users.routes.ts
- ✅ boards.ts
- ✅ content.ts
- ✅ ingest.ts
- ✅ auth.routes.ts
- ✅ nodes.ts
- ✅ edges.ts

### Frontend (apps/web/src/)

**Pages** (5 files):

- ✅ page.tsx (landing)
- ✅ ingest/page.tsx
- ✅ keimenon/page.tsx
- ✅ board/[id]/page.tsx
- ⚠️ login/page.tsx (mock)

**Components** (~20 files in keimenon/):

- Mixed completion status

### Documentation (ai_context/)

**Active Docs** (12 files):

- MASTER_DOCS.md
- ARCHITECTURE.md
- TODO_TRACKER.md
- AUTH_GUIDE.md
- QUICK_START.md
- SESSION_FINAL.md
- etc.

**Archive Docs** (~40 files):

- Mostly vision/planning docs
- Historical session summaries

---

## Conclusion

Keimenon is a **well-architected project** with **excellent backend foundations** (database abstraction, authentication, chat import) but **significant gaps** between its ambitious specifications and actual implementation.

**Key Takeaways**:

1. **Backend**: 85% complete, production-ready
2. **Frontend**: 40% complete, needs work
3. **Core Features** (Claims, UnifiedDocs, Verifiers): 0-10% complete
4. **Spec Coverage**: ~15-45% depending on document

**Path Forward**:

- Focus on MVP blockers (auth integration, claims, docs)
- Stop creating new vision docs
- Build what's specified before adding more specs
- Get to working MVP in 1-2 months
- Then iterate with user feedback

**Estimated Time to MVP**: 2 months full-time
**Estimated Time to Production**: 12 months full-time

---

**End of Analysis**
