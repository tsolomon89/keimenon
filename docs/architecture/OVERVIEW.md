# System Architecture Overview

**Canvas Memory OS - Local-First Knowledge Management System**

This document provides a comprehensive overview of the Canvas Memory OS architecture, design principles, and system components.

---

## Table of Contents

- [What is Canvas Memory OS?](#what-is-canvas-memory-os)
- [Design Principles](#design-principles)
- [High-Level Architecture](#high-level-architecture)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [Deployment Modes](#deployment-modes)
- [Key Design Decisions](#key-design-decisions)

---

## What is Canvas Memory OS?

Canvas Memory OS is a **graph-native, local-first knowledge management system** designed to replace linear AI chat interfaces with a visual, versioned knowledge graph. Instead of scrolling through endless chat histories, users organize information spatially on a canvas where everything—files, chats, claims, documents—exists as nodes connected by typed, policy-aware edges.

### Key Differentiators

1. **Visual Graph**: See your knowledge spatially, not linearly
2. **Scope-Based**: Explicit, reproducible context (not "vibes")
3. **Verification-First**: Claims must be tool-verified, not just LLM asserted
4. **Local-First**: Free/Pro tiers work on-device with BYO keys
5. **Policy Edges**: Sequester content from models/tools/UI independently
6. **Multi-Tenant**: Complete isolation between client accounts

### Core Capabilities

- Import and organize AI chat conversations (ChatGPT, Claude, Gemini)
- Automatic code extraction and deduplication
- Message stitching into source documents
- Duplicate detection with configurable algorithms
- Visual 2D canvas with force-directed layout
- Full-text search with FTS5
- Multi-tenant authentication with RBAC
- Complete data ownership (local SQLite storage)

---

## Design Principles

### 1. Local-First Architecture

**Philosophy**: Data lives on your machine by default. Cloud sync is optional.

**Benefits**:

- Zero ongoing costs ($0/month vs $65-200/month for cloud)
- Complete data ownership
- No internet required for core functionality
- Privacy by default
- Fast local queries
- Simple backups (copy .db file)

**Implementation**: SQLite with WAL mode, FTS5 full-text search, foreign key constraints.

### 2. Graph-Native Data Model

**Philosophy**: Everything is a node. Relationships are first-class citizens.

**Benefits**:

- Natural representation of knowledge
- Flexible schema (add properties anytime)
- Efficient graph traversals
- Policy-aware edges
- Clear provenance tracking

**Implementation**: Nodes and edges stored in SQLite with JSON properties. Optional Neo4j sync for advanced graph queries.

### 3. Scope-Based Context

**Philosophy**: Explicit, reproducible selection of what's in context.

**Benefits**:

- No "vibes-based" AI behavior
- Reproducible results
- Clear attribution
- Fine-grained control over what AI sees

**Implementation**: ScopeSet receipts track every node/edge in a selection.

### 4. Verification-First Claims

**Philosophy**: Facts must be tool-verified, not just LLM-asserted.

**Benefits**:

- Objective truth grounding
- Prevents hallucinations
- Auditable verification history
- Confidence scoring

**Implementation**: VerifierRuns (HTTP_CHECK, SCHEMA_MATCH, COMPUTE) mark claims as verified or refuted.

### 5. Multi-Tenant by Design

**Philosophy**: Complete data isolation between accounts from day one.

**Benefits**:

- Security by default
- Clean architecture for SaaS deployment
- Support for team collaboration
- Admin accounts can debug cross-tenant issues

**Implementation**: Every node/edge has `account_id` and `created_by` fields. Middleware enforces filtering.

---

## High-Level Architecture

### System Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Next.js     │  │  React       │  │  Canvas2D    │         │
│  │  App Router  │  │  Components  │  │  (D3/Three)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                            │ HTTP/REST + JWT
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    API Server (Express)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Routes      │  │  Services    │  │  Middleware  │         │
│  │  /ingest     │  │  Fingerprint │  │  Auth/CORS   │         │
│  │  /nodes      │  │  Storage     │  │  Validation  │         │
│  │  /edges      │  │  Autogroup   │  │  Error       │         │
│  │  /boards     │  │  Claims      │  │  Rate Limit  │         │
│  │  /import     │  │  Similarity  │  │  Isolation   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                            │ DatabaseClient Interface
                            ▼
┌────────────────────────────────────────────────────────────────┐
│              Storage Layer (Database Abstraction)               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  DatabaseClient Interface                         │          │
│  │  • execute(query, params)                        │          │
│  │  • createNode(node)                              │          │
│  │  • createEdge(edge)                              │          │
│  │  • getNode(id)                                   │          │
│  └──────────────────────────────────────────────────┘          │
│          │                    │                    │            │
│          ▼                    ▼                    ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ SQLiteClient │  │ Neo4jClient  │  │ HybridClient │         │
│  │ (local-first)│  │ (cloud mode) │  │ (sync both)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    Physical Storage                             │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │ SQLite Database  │              │ Neo4j Database   │        │
│  │ ~/.canvas-memory/│              │ (Optional Cloud) │        │
│  │ canvas.db        │              │                  │        │
│  └──────────────────┘              └──────────────────┘        │
└────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
1. User makes request (e.g., GET /api/v1/nodes)
   ↓
2. CORS middleware (allow origins)
   ↓
3. Helmet middleware (security headers)
   ↓
4. Auth middleware (verify JWT, attach req.user)
   ↓
5. Permission middleware (check RBAC level)
   ↓
6. Isolation middleware (set account filter)
   ↓
7. Route handler (execute business logic)
   ↓
8. DatabaseClient (storage-agnostic query)
   ↓
9. SQLite/Neo4j (physical storage)
   ↓
10. Response (JSON with filtered data)
    ↓
11. Error handler (if exception occurs)
```

---

## System Components

### Frontend Layer (apps/web)

**Technology**: Next.js 14, React 18, TypeScript, Tailwind CSS

**Key Components**:

- **App Router**: File-based routing with layouts
- **Canvas2D**: Interactive graph visualization with D3-force
- **File Upload**: Drag-and-drop interface with progress tracking
- **Inspector**: Right-hand sidebar for node/edge details
- **Auth**: Login/register forms with JWT token management

**Status**: Partially implemented. Canvas works, but auth integration pending.

### Backend Layer (apps/api)

**Technology**: Express.js, TypeScript, Node.js 20+

**Route Modules**:

- `auth.ts` - Registration, login, logout, session management
- `nodes.ts` - Node CRUD operations (Source, Group, ChatThread, etc.)
- `edges.ts` - Edge CRUD operations (CONTAINS, DERIVES_FROM, etc.)
- `boards.ts` - Workspace management
- `content.ts` - Content retrieval (messages, sources, code)
- `import-enhanced.ts` - Chat import with configuration
- `import-stream.ts` - Streaming upload for large files (2GB)
- `ingest.ts` - File upload and fingerprinting
- `duplicates.ts` - Duplicate detection and merging

**Service Modules**:

- `auth.service.ts` - JWT signing, bcrypt hashing, session storage
- `streaming-json-parser-v2.ts` - Large file parsing with backpressure
- `sources-builder.ts` - Message stitching into source documents
- `code-extractor.ts` - Code block extraction with 20+ languages
- `similarity-engine.ts` - 3 duplicate detection algorithms
- `autogroup.ts` - Rule-based clustering by type/domain

**Middleware**:

- `auth.middleware.ts` - JWT verification, user attachment
- `cors.middleware.ts` - Cross-origin resource sharing
- `error.middleware.ts` - Structured error responses

### Database Layer (packages/db)

**Technology**: better-sqlite3 (primary), neo4j-driver (optional)

**DatabaseClient Interface**:

```typescript
interface DatabaseClient {
  execute(query: string, params: any[]): Promise<{ records: any[] }>;
  createNode(node: Node): Promise<void>;
  createEdge(edge: Edge): Promise<void>;
  getNode(id: string): Promise<Node | null>;
  getNodeEdges(id: string, direction?: string): Promise<Edge[]>;
  close(): Promise<void>;
}
```

**Implementations**:

- **SQLiteClient**: Local-first, WAL mode, FTS5, foreign keys
- **Neo4jClient**: Cloud-based, Cypher queries, graph algorithms
- **HybridClient**: Writes to both, reads from SQLite (fastest)

**Factory Pattern**:

```typescript
const db = DatabaseFactory.create(process.env.STORAGE_MODE);
global.dbClient = db; // Shared across all routes
```

### Shared Packages

**packages/types**: Zod schemas for all data models

- `nodes.ts` - 11 node types (Source, Group, ChatThread, etc.)
- `edges.ts` - 11 edge types (CONTAINS, DERIVES_FROM, etc.)
- `policies.ts` - LimitsPolicy, Entitlement, ModelPolicy
- `receipts.ts` - ScopeSet, Receipt, AgentRun, VerifierRun

**packages/parsers**: Chat export parsers

- `chatgpt.ts` - ChatGPT export format
- `claude.ts` - Claude conversation format
- `gemini.ts` - Google Gemini format
- `generic.ts` - Fallback parser

**packages/graph**: Graph algorithms

- `layout.ts` - D3-force layout calculation
- `clustering.ts` - Node grouping algorithms

**packages/ui**: Shared React components (future)

---

## Data Flow

### Upload Flow (File Ingestion)

```
1. User drags file to browser
   ↓
2. FileUploadZone component captures file
   ↓
3. POST /api/v1/ingest/files (multipart/form-data)
   ↓
4. Multer middleware saves to temp directory
   ↓
5. Fingerprint service calculates SHA-256
   ↓
6. Storage service checks for duplicate
   ↓
7. If new: save to storage/uploads/ directory
   ↓
8. Create Source node in database (with account_id)
   ↓
9. Autogroup service clusters sources
   ↓
10. Create Group nodes + CONTAINS edges
    ↓
11. Return JSON response with sources & groups
    ↓
12. Frontend displays results in canvas
```

### Chat Import Flow (Enhanced Import)

```
1. User uploads chat export file (JSON/JSONL)
   ↓
2. POST /api/v1/import/enhanced (with config)
   ↓
3. StreamingJsonParserV2 parses in batches
   ↓
4. Format detection (ChatGPT, Claude, Gemini)
   ↓
5. Extract conversations and messages
   ↓
6. [Optional] Sources Mode:
   - Segment extractor finds meaningful chunks
   - Stitcher combines by strategy (chat/title/topic)
   - Apply filters (min chars, role subset)
   ↓
7. [Optional] Code Extraction:
   - Detect code blocks with language metadata
   - Normalize comments/whitespace
   - Deduplicate with SHA-256
   ↓
8. [Optional] Duplicate Detection:
   - Similarity engine compares content
   - Apply algorithm (jaccard/levenshtein/cosine)
   - Flag potential duplicates
   ↓
9. Save to database (in transaction):
   - Create ChatThread nodes (with account_id)
   - Create Message nodes (with account_id)
   - Create Source nodes (if sources mode)
   - Create CodeBlock nodes (if code extraction)
   - Create CONTAINS edges (thread → messages)
   - Create DERIVES_FROM edges (sources/code → messages)
   - Create DUP_OF edges (if duplicates found)
   ↓
10. Return import statistics
    ↓
11. Frontend displays results + decision UI
```

### Canvas Render Flow

```
1. User visits /board/:id
   ↓
2. Page component mounts (React)
   ↓
3. Fetch GET /api/v1/boards/:id/graph (with auth)
   ↓
4. Auth middleware verifies JWT
   ↓
5. Isolation middleware sets account filter
   ↓
6. Route handler queries database:
   - SELECT * FROM nodes WHERE board_id = ? AND account_id = ?
   - SELECT * FROM edges WHERE ... (join with nodes)
   ↓
7. Return nodes[] + edges[] JSON
   ↓
8. Canvas2D component receives data
   ↓
9. D3-force calculates layout positions
   ↓
10. Canvas API draws nodes + edges
    ↓
11. User can pan/zoom/select/inspect
```

---

## Technology Stack

### Frontend

| Technology       | Version  | Purpose                         |
| ---------------- | -------- | ------------------------------- |
| **Next.js**      | 14.x     | React framework with App Router |
| **React**        | 18.x     | UI library                      |
| **TypeScript**   | 5.x      | Type safety                     |
| **Tailwind CSS** | 3.x      | Utility-first styling           |
| **D3-force**     | 7.x      | Graph layout algorithm          |
| **Three.js**     | (future) | 3D visualization                |

### Backend

| Technology       | Version | Purpose                             |
| ---------------- | ------- | ----------------------------------- |
| **Node.js**      | 20+     | JavaScript runtime                  |
| **Express**      | 4.x     | Web framework                       |
| **TypeScript**   | 5.x     | Type safety                         |
| **Zod**          | 3.x     | Runtime validation + type inference |
| **bcrypt**       | 5.x     | Password hashing                    |
| **jsonwebtoken** | 9.x     | JWT signing/verification            |
| **Multer**       | 1.x     | File upload handling                |
| **Busboy**       | 1.x     | Streaming file uploads              |

### Database

| Technology         | Version | Purpose                         |
| ------------------ | ------- | ------------------------------- |
| **SQLite**         | 3.x     | Local-first relational database |
| **better-sqlite3** | 11.x    | Synchronous SQLite bindings     |
| **Neo4j**          | 5.19    | Optional cloud graph database   |
| **neo4j-driver**   | 5.x     | Neo4j connectivity              |

### Infrastructure

| Technology         | Version    | Purpose                     |
| ------------------ | ---------- | --------------------------- |
| **Turborepo**      | 1.x        | Monorepo build system       |
| **Docker**         | (optional) | Neo4j containerization      |
| **Docker Compose** | (optional) | Multi-service orchestration |

---

## Deployment Modes

### 1. Local-First (Default)

**Best for**: Personal use, development, free tier

**Configuration**:

```bash
STORAGE_MODE=local
SQLITE_PATH=~/.canvas-memory/canvas.db
LOCAL_DOCS_PATH=~/.canvas-memory
```

**Characteristics**:

- ✅ Zero ongoing costs
- ✅ Complete data ownership
- ✅ No internet required
- ✅ Fast local queries
- ✅ Simple backups
- ⚠️ Single-machine access only

### 2. Neo4j Cloud (Canvas Mode)

**Best for**: Production deployments, advanced graph queries

**Configuration**:

```bash
STORAGE_MODE=canvas
NEO4J_URI=neo4j+s://YOUR_INSTANCE.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

**Characteristics**:

- ✅ Multi-machine access
- ✅ Advanced graph algorithms
- ✅ Scalable storage
- ❌ Requires internet
- ❌ Monthly cost ($65-200)

### 3. Hybrid (Both SQLite + Neo4j)

**Best for**: Professional tier, gradual migration

**Configuration**:

```bash
STORAGE_MODE=hybrid
SQLITE_PATH=~/.canvas-memory/canvas.db
NEO4J_URI=neo4j+s://YOUR_INSTANCE.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

**Characteristics**:

- ✅ Writes to both databases
- ✅ Reads from SQLite (faster)
- ✅ Background sync to Neo4j
- ✅ Best of both worlds
- ⚠️ Complexity overhead

---

## Key Design Decisions

### Why SQLite + Neo4j (not PostgreSQL)?

**Decision**: Support both embedded (SQLite) and cloud (Neo4j) databases.

**Rationale**:

- SQLite: Zero-config, perfect for local-first, single file backups
- Neo4j: Graph-native, efficient traversals, Cypher query language
- PostgreSQL: Relational model, harder to represent graphs, requires server

**Trade-offs**:

- ✅ Best tool for each use case (local vs cloud)
- ✅ Flexible architecture (swap as needed)
- ⚠️ Dual implementation effort (SQLite + Neo4j clients)

### Why Monorepo (not separate repos)?

**Decision**: Use Turborepo monorepo with shared packages.

**Rationale**:

- Single version of dependencies across packages
- Shared types between frontend and backend
- Atomic cross-package refactoring
- Fast builds with caching

**Trade-offs**:

- ✅ Easier to maintain consistency
- ✅ No package publishing overhead
- ⚠️ Slightly larger repository size

### Why Zod (not TypeScript-only)?

**Decision**: Use Zod for runtime validation + type inference.

**Rationale**:

- TypeScript only validates at compile time
- Need runtime validation for API boundaries
- Zod infers TypeScript types from schemas (single source of truth)

**Trade-offs**:

- ✅ Catch errors at API boundary
- ✅ DRY (one schema for validation + types)
- ⚠️ Additional dependency

### Why JWT + Sessions (not sessions-only)?

**Decision**: JWT tokens stored in database sessions table.

**Rationale**:

- JWT: Stateless, can be decoded client-side
- Sessions: Server can revoke tokens, single sign-on enforcement
- Best of both worlds

**Trade-offs**:

- ✅ Stateless verification (fast)
- ✅ Revocable (secure)
- ⚠️ Database lookup on every request

### Why Multi-Tenant from Day One?

**Decision**: Every node/edge has `account_id` and `created_by` fields.

**Rationale**:

- Easier to add now than retrofit later
- Clean architecture for SaaS deployment
- Security by default (no cross-account data leaks)

**Trade-offs**:

- ✅ Future-proof for team/business tiers
- ✅ Simpler mental model (always isolated)
- ⚠️ Slightly more complex queries

---

## Performance Considerations

### Frontend Optimization

- **Viewport culling**: Only render visible nodes
- **LOD (Level of Detail)**: Simplify distant nodes
- **Web Workers**: Offload layout calculations
- **Code splitting**: Lazy load heavy components
- **Image optimization**: Next.js automatic optimization

### Backend Optimization

- **Database indexes**: Fast lookups on ID, kind, account_id
- **Parameterized queries**: Prevent SQL injection + query plan caching
- **Connection pooling**: Reuse database connections
- **Batch operations**: Multiple inserts in single transaction
- **Streaming uploads**: Handle 2GB files with constant memory

### Database Optimization

**SQLite**:

- WAL mode: Concurrent reads + single writer
- FTS5: Full-text search with ranking
- Foreign keys: Automatic cascade deletes
- JSON functions: Query inside properties

**Neo4j**:

- Indexes on `:Node(id)`, `:Source(fingerprint)`
- Constraints for uniqueness
- Cypher query profiling with PROFILE
- Periodic VACUUM and REINDEX

---

## Security Considerations

### Authentication

- ✅ bcrypt password hashing (10 rounds)
- ✅ JWT with 7-day expiration
- ✅ Database-backed sessions (revocable)
- ✅ Single sign-on (old sessions deleted)
- 🚀 TODO: Add refresh tokens for long-lived sessions
  // Related: apps/api/src/services/auth.service.ts (add refresh token generation)
  // See: packages/db/src/sqlite/schema.sql (add refresh_tokens table)
- 🚀 TODO: Implement MFA (TOTP/SMS) for enhanced security
  // Related: apps/api/src/routes/auth.ts (add MFA endpoints)
  // See: docs/features/MFA.md (needs creation)
- 🚀 TODO: Add rate limiting middleware
  // Related: apps/api/src/middleware/rate-limit.ts (needs creation)
  // See: docs/architecture/RATE_LIMITING.md (needs creation)

### Authorization

- ✅ 4 permission levels (junior, senior, leader, admin)
- ✅ Middleware enforces RBAC on every route
- ✅ Account-level data isolation (client accounts)
- ✅ Admin accounts can see all data (for support)

### Data Protection

- ✅ Parameterized queries (SQL injection prevention)
- ✅ Zod validation (input sanitization)
- ✅ CORS middleware (restrict origins)
- ✅ Helmet middleware (security headers)
- 🚀 TODO: Implement rate limiting per IP/user
  // Related: apps/api/src/middleware/rate-limit.ts (needs creation)
  // Requires: express-rate-limit or similar package
- 🚀 TODO: Enable HTTPS in production with Let's Encrypt
  // Related: deployment/nginx.conf (needs creation)
  // See: docs/deployment/HTTPS_SETUP.md (needs creation)

---

## Scalability

### Current Limits

**Free Tier**:

- 500 sources max
- 20,000 nodes max
- 50 groups max
- 5 GB storage

**Professional Tier**:

- 5,000 sources
- 200,000 nodes
- 500 groups
- 50 GB storage

**Business Tier**:

- Unlimited nodes/sources/groups
- Unlimited storage

### Performance Benchmarks

| Operation             | Throughput     | Notes                       |
| --------------------- | -------------- | --------------------------- |
| Node Insert           | ~5,000/sec     | Single SQLite transaction   |
| Edge Insert           | ~4,000/sec     | With foreign key checks     |
| Node Query (ID)       | ~50,000/sec    | Primary key lookup          |
| Node Query (filtered) | ~10,000/sec    | Kind + account_id           |
| Full-Text Search      | ~1,000/sec     | FTS5 content search         |
| Import (end-to-end)   | ~50 convos/sec | Including parsing + storage |

### Tested Scale

- **File Size**: Up to 136 MB (medium.json)
- **Conversations**: 44 conversations → 693 nodes, 935 edges
- **Database Size**: ~0.7x of JSON size (compression)
- **Memory**: Constant 100-500 MB (streaming parser)

---

## Future Architecture

### Phase 2 (Pro Features)

- [ ] UnifiedDoc generation (L0-L3 rings)
- [ ] Claim extraction with LLM
- [ ] Verifiers (HTTP_CHECK, SCHEMA_MATCH, COMPUTE)
- [ ] Galaxy lens (3D trust-warped visualization)
- [ ] Embedding-based similarity (vector search)
- [ ] Agent framework (scheduled runs)

### Phase 3 (Business Features)

- [ ] Multi-seat collaboration
- [ ] SSO integration (SAML, OAuth)
- [ ] Audit logs
- [ ] CRM/Email/Webhook actions
- [ ] PII governance
- [ ] Real-time sync between users

### Long-Term Vision

- [ ] Distributed graph (IPFS + CRDTs)
- [ ] Blockchain provenance (immutable citations)
- [ ] Federated knowledge graphs
- [ ] Cross-tenant knowledge sharing (with consent)

---

## Related Documentation

- [Database Architecture](DATABASE.md) - Detailed database design
- [API Design](API_DESIGN.md) - API patterns and conventions
- [Authentication](AUTHENTICATION.md) - Auth system deep dive
- [Quick Start](../getting-started/QUICK_START.md) - Get running in 5 minutes

---

**Last Updated**: 2025-10-15
**Related Docs**: [Database](DATABASE.md) | [API Design](API_DESIGN.md) | [Authentication](AUTHENTICATION.md)
