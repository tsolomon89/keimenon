# Keimenon — Master Documentation

**Version**: 0.3.0
**Last Updated**: 2025-10-11
**Status**: Phase 1D 75% Complete, Chat Import System 90% Complete (MVP near completion)

---

## Executive Summary

**Keimenon** is a graph-native, keimenon-first knowledge management system designed to replace linear AI chat interfaces with a versioned, visual knowledge graph. The system treats all information as nodes (sources, messages, claims, documents, etc.) connected by typed edges with policy enforcement.

### Core Value Proposition

1. **Visual Knowledge Graph**: Everything lives on a spatial keimenon - files, chats, summaries, code, even the user
2. **Scope-Based Context**: Replace "vibes" with concrete, reproducible scope sets
3. **Objectivity Pipeline**: Transform subjective sources into verified objective claims
4. **Local-First**: Free/Pro tiers default to on-device processing with BYO keys
5. **Policy-Aware Edges**: Sequester, verify, derive, and scope relationships with explicit rules

---

## Table of Contents

1. [Project Vision & Philosophy](#project-vision--philosophy)
2. [System Architecture](#system-architecture)
3. [Current Implementation Status](#current-implementation-status)
4. [Node Types Reference](#node-types-reference)
5. [Edge Types Reference](#edge-types-reference)
6. [Feature Tier Matrix](#feature-tier-matrix)
7. [Technical Stack](#technical-stack)
8. [Development Guide](#development-guide)
9. [API Reference](#api-reference)
10. [Roadmap & Phases](#roadmap--phases)

---

## Project Vision & Philosophy

### Core Principles ("Canon")

1. **Identity is Sacred**
   - Content-addressed sources with fingerprints (SHA-256)
   - Bitemporal IDs (event-time vs system-time)
   - Immutable provenance tracking

2. **Scopes, Not Vibes**
   - Every AI interaction references a concrete scope set
   - Scope receipts enable reproducibility
   - No implicit "the whole graph" assumptions

3. **Verification is Tool-Only**
   - LLMs orchestrate, tools produce evidence
   - Claims never self-verify
   - HTTP checks, schema validation, compute verification

4. **Sequester as Edge Policy**
   - Hide content from models/tools/UI independently
   - Reasons: secret, noisy, untrusted, license, WIP
   - Policy flags: `hidden_from_llm`, `hidden_from_tools`, `ui_only`

5. **Lenses Morph Space**
   - Different metrics create different spatial views
   - 2D, 3D, nD, Galaxy (trust-warped space)
   - Stable seeds prevent layout jumping

### Product Thesis

Replace linear chat interfaces with a **versioned knowledge graph** you can see and control:

- **Edges are policy**: include/exclude, derive, verify, scope, duplicate, supports/refutes
- **UserAgent** helps ingest, group, verify, and consolidate into UnifiedDocs
- **Keimenon-first UI** with lenses revealing different "nearness" geometries
- **Receipt system** makes every answer reproducible

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Keimenon     │  │   Ingest     │  │   Docs       │      │
│  │   2D/3D/nD   │  │   Pipeline   │  │   Viewer     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend API (Express)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Ingest     │  │   Autogroup  │  │   Claims     │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Fingerprint │  │   Storage    │  │   Verifier   │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Neo4j Driver
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Neo4j Graph Database                      │
│  • Nodes: Source, Group, Folder, ObjectiveClaim, etc.       │
│  • Edges: CONTAINS, SEQUESTERS, DERIVES_FROM, etc.          │
│  • Constraints: node.id unique, fingerprint unique           │
│  • Indexes: kind, created_at, mime_type, status             │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
keimenon/
├── apps/
│   ├── web/                    # Next.js 14 frontend (port 3000)
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   │   ├── page.tsx              # Landing page
│   │   │   │   ├── ingest/page.tsx       # File upload UI
│   │   │   │   └── board/[id]/page.tsx   # Keimenon viewer
│   │   │   └── components/
│   │   │       ├── keimenon/Keimenon2D.tsx   # 2D graph renderer
│   │   │       ├── ingest/               # Upload components
│   │   │       └── layout/               # Layout components
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── api/                    # Express backend (port 3001)
│       ├── src/
│       │   ├── index.ts        # Main server entry
│       │   ├── routes/
│       │   │   ├── ingest.ts   # Upload endpoints
│       │   │   ├── nodes.ts    # Node CRUD
│       │   │   ├── edges.ts    # Edge CRUD
│       │   │   └── boards.ts   # Board management
│       │   └── services/
│       │       ├── fingerprint.ts    # SHA-256 hashing
│       │       ├── storage.ts        # File storage
│       │       └── autogroup.ts      # Clustering logic
│       └── package.json
│
├── packages/
│   ├── types/                  # Shared TypeScript types (Zod schemas)
│   │   └── src/
│   │       ├── nodes.ts        # Node type definitions
│   │       ├── edges.ts        # Edge type definitions
│   │       ├── policies.ts     # Policy types
│   │       ├── receipts.ts     # Scope & receipt types
│   │       └── plans.ts        # Workspace & entitlement types
│   │
│   ├── db/                     # Database clients
│   │   └── src/
│   │       ├── neo4j.ts            # Neo4j driver wrapper
│   │       ├── sqlite/             # SQLite implementation
│   │       │   ├── client.ts       # SQLite client
│   │       │   └── schema.sql      # SQLite schema
│   │       ├── database-factory.ts # Storage mode factory
│   │       └── schemas.ts          # Schema initialization
│   │
│   ├── ui/                     # React component library
│   │   └── src/
│   │       ├── components/     # Button, Card, Badge, etc.
│   │       ├── layouts/        # FourRegionLayout
│   │       └── utils/          # Utility functions
│   │
│   ├── graph/                  # Graph algorithms & layout
│   │   └── src/
│   │       ├── layout.ts       # D3-force layout
│   │       ├── operations.ts   # Graph queries
│   │       ├── clustering.ts   # Clustering algorithms
│   │       └── selection.ts    # Selection state
│   │
│   ├── parsers/                # Chat parsers (ChatGPT, Claude, Gemini) ✅
│   ├── agents/                 # Agent framework (placeholder)
│   └── verifiers/              # Verification tools (placeholder)
│
├── ai_context/                 # Specifications & documentation
│   ├── keimenon_living_spec_v_0.md
│   ├── mvp_vs_final_vision_roadmap_model_v_0.md
│   ├── plans_tiers_accounts_roles_and_phased_rollout_v_0.md
│   ├── ui_screens_layout_view_map_v_0.md
│   ├── groups_ai_nodes_ui_spec_v_0.md
│   ├── ai_chat_import_feature/
│   ├── mock_screenshots/
│   └── schemas/                # JSON schemas (to be created)
│
├── storage/                    # File storage (gitignored)
│   ├── uploads/                # Uploaded files
│   └── temp/                   # Temporary files
│
├── scripts/                    # Development scripts
│   ├── dev.js                  # Custom dev server launcher
│   ├── validate-env.js         # Environment validation
│   └── kill-port.js            # Port cleanup
│
├── package.json                # Root workspace config
├── turbo.json                  # Turborepo configuration
├── tsconfig.json               # Base TypeScript config
├── claude.md                   # Claude agent instructions
└── agents.md                   # Agent architecture spec
```

---

## Current Implementation Status

### ✅ Phase 1A: Foundation (COMPLETE)

- [x] Turborepo monorepo setup
- [x] TypeScript strict mode across all packages
- [x] Next.js 14 with App Router
- [x] Express API with middleware
- [x] Neo4j database client
- [x] Zod-based type system
- [x] UI component library

### ✅ Phase 1B: File Ingest & Autogroup (COMPLETE)

- [x] File upload endpoint with multer
- [x] SHA-256 fingerprinting
- [x] Deduplication by content hash
- [x] Local file storage service
- [x] Rule-based autogrouping (by MIME type, domain)
- [x] Source node persistence to Neo4j
- [x] Group node creation
- [x] CONTAINS edge creation
- [x] Upload UI with drag-and-drop
- [x] Results display with groups

### ✅ Phase 1B.5: Chat Import System (COMPLETE)

- [x] ChatGPT export parser (JSON/JSONL)
- [x] Claude export parser (JSON)
- [x] Gemini export parser (JSON)
- [x] Generic format parser with auto-detection
- [x] Streaming import with progress tracking
- [x] Sources mode: Extract meaningful segments from conversations
- [x] Code extraction service with deduplication
- [x] Similarity engine (jaccard, levenshtein, cosine, embedding)
- [x] Duplicate detection and decision system
- [x] Multiple stitching strategies (by chat, by title, by topic)
- [x] Batch import processing
- [x] Import decisions UI for handling duplicates
- [x] Content viewing routes
- [x] Local document store for embedded storage

### ✅ Phase 1C: 2D Keimenon Visualization (COMPLETE)

- [x] Keimenon2D component with HTML Keimenon API
- [x] D3-force layout algorithm
- [x] Pan & zoom controls
- [x] Node rendering (color-coded by type)
- [x] Edge rendering
- [x] Selection (click, Shift+click multi-select)
- [x] Hover effects
- [x] Board page with FourRegionLayout
- [x] Graph query endpoint
- [x] Selection inspector (RHS sidebar)

### 🔄 Phase 1D: Claims & Docs (75% COMPLETE)

- [x] Code extraction as "claims" (code blocks from chats)
- [x] Source segments with citation spans
- [x] Content persistence with fingerprinting
- [ ] UnifiedDoc L0 compiler (5k token limit)
- [ ] Markdown export with citations
- [ ] Citation hover tooltips in viewer UI
- [ ] UnifiedDoc viewer page

### 🔄 Additional Critical Features (IN PROGRESS)

- [x] Board CRUD operations (API complete)
- [x] Input validation middleware (Zod schemas)
- [x] Rate limiting (express-rate-limit)
- [x] Environment variable validation
- [x] Content validation and sanitization
- [ ] Sequester UI controls
- [ ] Error boundaries in React
- [ ] Loading states for all async operations
- [ ] Toast notifications
- [ ] Board management UI

---

## Node Types Reference

All nodes inherit from a base `Node` type with these common fields:

```typescript
{
  id: string;              // Unique ID (nanoid)
  kind: NodeKind;          // Discriminator field
  created_at: number;      // Unix timestamp
  updated_at: number;      // Unix timestamp
  board_id?: string;       // Optional board association
}
```

### Source Node

Represents an ingested file, URL, or other external content.

```typescript
{
  kind: "Source";
  fingerprint: string;           // SHA-256 content hash
  mime_type: string;             // MIME type
  title: string;                 // Display name
  url?: string;                  // Optional source URL
  storage_path?: string;         // Local file path
  size_bytes?: number;           // File size
  metadata?: Record<string, any>;
  status: "pending" | "ready" | "error";
}
```

**Use Cases**: PDFs, code files, images, JSON data, web pages, chat exports

### Group Node

A named collection or cluster of related nodes.

```typescript
{
  kind: "Group";
  name: string;                  // Display name
  description?: string;          // Optional description
  color?: string;                // UI color hint
  metadata?: {
    member_count?: number;
    auto_created?: boolean;
    cluster_method?: string;
  };
}
```

**Use Cases**: "API Documentation", "Images", "Code Snippets", "Research Papers"

### Folder Node

Like a Group but with stronger containment semantics; can be sequestered.

```typescript
{
  kind: "Folder";
  name: string;
  path?: string;                 // Hierarchical path
  permissions?: string[];        // Access control
  metadata?: Record<string, any>;
}
```

**Use Cases**: "Secrets", "Private Notes", "Archive"

### ObjectiveClaim Node

A verified, testable factual statement.

```typescript
{
  kind: "ObjectiveClaim";
  claim_text: string;            // The assertion
  claim_type: "fact" | "endpoint" | "parameter" | "definition" | "metric" | "config";
  status: "unverified" | "verified" | "contested" | "stale";
  confidence: number;            // 0.0 to 1.0
  half_life_days?: number;       // Staleness metric
  metadata?: {
    supports?: string[];         // Claim IDs this supports
    contradicts?: string[];      // Claim IDs this contradicts
  };
}
```

**Use Cases**: "API endpoint /v1/users returns 200", "Max upload size is 10MB"

### UnifiedDoc Node

A consolidated, structured document with rings (L0-L3) and citations.

```typescript
{
  kind: "UnifiedDoc";
  title: string;
  ring: "L0" | "L1" | "L2" | "L3";
  content_markdown: string;
  token_count: number;
  status: "draft" | "published" | "stale";
  metadata?: {
    claims_index?: string[];     // Referenced claim IDs
    version?: number;
    last_refresh?: number;
  };
}
```

**Rings**:

- **L0** (≤5k tokens): Bullet ledger of atomic facts
- **L1** (≤20k tokens): Stitched exposition with paragraphs
- **L2** (≤50k tokens): Examples, tests, code samples
- **L3**: Full narrative documentation

### ChatThread Node

A conversation container (Pro+ feature).

```typescript
{
  kind: "ChatThread";
  title: string;
  system_prompt?: string;
  participants: string[];        // UserNode IDs
  message_count: number;
  status: "active" | "archived";
  metadata?: Record<string, any>;
}
```

### Message Node

A single utterance within a ChatThread.

```typescript
{
  kind: "Message";
  thread_id: string;             // ChatThread ID
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    tokens?: number;
    attachments?: string[];      // Source IDs
  };
}
```

### Constellation Node

A zoom-to-reveal cluster (visual optimization).

```typescript
{
  kind: "Constellation";
  name: string;
  member_ids: string[];          // Collapsed node IDs
  centroid?: [number, number];   // Spatial position
  radius?: number;
  metadata?: Record<string, any>;
}
```

### UserNode (Pro+)

Represents a user with preferences and policies.

```typescript
{
  kind: "UserNode";
  email: string;
  name: string;
  workspace_id: string;
  entitlement_plan: "free" | "pro" | "business";
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
}
```

### BusinessNode (Business tier)

Organization-level entity.

```typescript
{
  kind: "BusinessNode";
  org_name: string;
  products: string[];
  markets: string[];
  systems?: {
    crm?: string;
    email?: string;
    erp?: string;
  };
  policies?: Record<string, any>;
}
```

---

## Edge Types Reference

Edges define typed relationships between nodes with optional policy flags.

### Base Edge Schema

```typescript
{
  from: string;                  // Source node ID
  to: string;                    // Target node ID
  kind: EdgeKind;                // Relationship type
  created_at: number;
  metadata?: Record<string, any>;
}
```

### CONTAINS

Group/Folder → {Source | Message | ObjectiveClaim | UnifiedDoc}

```typescript
{
  kind: "CONTAINS";
  from: string;  // Group or Folder ID
  to: string;    // Contained node ID
  rank?: number; // Optional ordering
}
```

### SEQUESTERS

{Group | Folder} → Node (with policy flags)

```typescript
{
  kind: "SEQUESTERS";
  from: string;  // Sequestering container ID
  to: string;    // Sequestered node ID
  hidden_from_llm: boolean;
  hidden_from_tools: boolean;
  ui_only?: boolean;
  reason?: "secret" | "noisy" | "untrusted" | "license" | "wip";
  until?: number;  // Optional expiry timestamp
}
```

### DERIVES_FROM

{Message | ObjectiveClaim | UnifiedDoc} → {Source | Message | ObjectiveClaim}

```typescript
{
  kind: "DERIVES_FROM";
  from: string;  // Derived node ID
  to: string;    // Source node ID
  span?: string; // Citation (e.g., "p3:s12-34", "line:42-58")
  confidence?: number;
}
```

### IN_SCOPE_FOR

{Group | Folder | Source} → ChatThread

```typescript
{
  kind: "IN_SCOPE_FOR";
  from: string;  // Node ID
  to: string;    // ChatThread ID
  rank?: number;
  policy_chips?: string[];  // ["include", "exclude", "prioritize"]
}
```

### EQUIVALENT_TO / DUP_OF

Symmetric relationship between duplicate nodes.

```typescript
{
  kind: "EQUIVALENT_TO" | "DUP_OF";
  from: string;
  to: string;
  similarity_score?: number;
  canonical?: string;  // ID of canonical node
}
```

### SUPPORTS / REFUTES

Claim ↔ Claim argument edges.

```typescript
{
  kind: "SUPPORTS" | "REFUTES";
  from: string;  // Claim ID
  to: string;    // Claim ID
  strength?: number;
}
```

### VERIFIED_BY

ObjectiveClaim → VerifierRun

```typescript
{
  kind: "VERIFIED_BY";
  from: string;  // Claim ID
  to: string;    // VerifierRun ID
  result: "pass" | "fail" | "inconclusive";
  verified_at: number;
  expires_at?: number;
}
```

### OWNED_BY

{Board | Group | UnifiedDoc} → {UserNode | BusinessNode}

```typescript
{
  kind: "OWNED_BY";
  from: string;
  to: string;
  role?: "owner" | "admin" | "editor" | "viewer";
}
```

---

## Feature Tier Matrix

| Capability                                    | Free (MVP)      | Pro             | Business       |
| --------------------------------------------- | --------------- | --------------- | -------------- |
| **Ingest & Storage**                          |
| File upload (PDF, TXT, MD, images, JSON, CSV) | ✅              | ✅              | ✅             |
| URL ingest                                    | ✅              | ✅              | ✅             |
| Chat import (ChatGPT, Claude, Gemini exports) | ✅ Full         | ✅ Full         | ✅ Full        |
| Streaming import with progress                | ✅              | ✅              | ✅             |
| Code extraction from chats                    | ✅              | ✅              | ✅             |
| Duplicate detection & decisions               | ✅              | ✅              | ✅ Advanced    |
| Storage quota                                 | 5 GB            | 50 GB           | Unlimited      |
| Max sources                                   | 500             | 10,000          | Unlimited      |
| Storage mode                                  | SQLite or Neo4j | SQLite or Neo4j | Hybrid + Cloud |
| **Organization**                              |
| Autogroup (rule-based)                        | ✅              | ✅              | ✅             |
| Autogroup (embedding-based)                   | ❌              | ✅              | ✅             |
| Groups & Folders                              | ✅              | ✅              | ✅             |
| Constellations                                | ✅              | ✅              | ✅             |
| Sequester controls                            | ✅              | ✅              | ✅ Advanced    |
| **Visualization**                             |
| 2D keimenon                                   | ✅              | ✅              | ✅             |
| 3D keimenon                                   | ❌              | ✅              | ✅             |
| Galaxy lens (trust-warped)                    | ❌              | ✅              | ✅             |
| nD lens                                       | ❌              | ✅              | ✅             |
| Custom lenses                                 | ❌              | ❌              | ✅             |
| **Claims & Verification**                     |
| Manual claim extraction                       | ✅              | ✅              | ✅             |
| AI claim extraction                           | ❌              | ✅              | ✅             |
| Verifiers (HTTP, Schema, Compute)             | ❌              | ✅              | ✅             |
| Proof assistants (Lean, Coq)                  | ❌              | ❌              | ✅             |
| **Documentation**                             |
| UnifiedDoc L0 (5k tokens)                     | ✅              | ✅              | ✅             |
| UnifiedDoc L1 (20k tokens)                    | ❌              | ✅              | ✅             |
| UnifiedDoc L2/L3 (50k+ tokens)                | ❌              | ✅              | ✅             |
| Citation tracking                             | ✅              | ✅              | ✅             |
| **AI Features**                               |
| Chat with scope                               | ❌              | ✅              | ✅             |
| Archetype nodes (Summarizer, etc.)            | ❌              | ✅              | ✅             |
| BYO API keys                                  | ✅              | ✅              | ✅             |
| Included model quota                          | ❌              | ✅              | ✅             |
| Scope receipts                                | 🔸 Session      | ✅ Persist      | ✅ Persist     |
| **Collaboration**                             |
| Seats                                         | 1               | 5               | Unlimited      |
| SSO/SAML                                      | ❌              | ❌              | ✅             |
| Roles (Owner/Admin/Editor/Viewer)             | ❌              | ❌              | ✅             |
| **Workflows & Actions**                       |
| CRM integration                               | ❌              | ❌              | ✅             |
| Email send                                    | ❌              | ❌              | ✅             |
| Webhooks                                      | ❌              | ✅              | ✅             |
| Scheduled agents                              | ❌              | ❌              | ✅             |
| **Data & Compliance**                         |
| Retention period                              | 30 days         | 90 days         | Custom         |
| Audit logs                                    | Basic           | Advanced        | Enterprise     |
| PII redaction                                 | ❌              | ✅              | ✅ Custom      |

Legend: ✅ Full support | 🔸 Partial/Limited | ❌ Not available

---

## Technical Stack

### Frontend (`apps/web`)

- **Framework**: Next.js 14.2.5 (App Router)
- **Language**: TypeScript 5.3.3 (strict mode)
- **Styling**: Tailwind CSS 3.4.3
- **UI Components**: Radix UI primitives
- **State Management**: Zustand 4.5.2
- **3D Rendering**: Three.js + React Three Fiber + Drei
- **2D Graph**: D3-force 3.0.0
- **Drag & Drop**: @dnd-kit
- **Icons**: Lucide React

### Backend (`apps/api`)

- **Framework**: Express 4.19.2
- **Language**: TypeScript 5.3.3
- **Database**: Neo4j 5.19 (via neo4j-driver)
- **Runtime**: tsx (TypeScript execution)
- **File Upload**: Multer 1.4.5-lts.1
- **Validation**: Zod 3.23.6
- **Security**: Helmet, CORS
- **ID Generation**: nanoid 5.0.7

### Packages

- **types**: Zod schemas for all data models
- **db**: Neo4j driver wrapper with schema management
- **ui**: Shared React components (Button, Card, Badge, Layout)
- **graph**: D3-force layout, clustering, graph operations
- **parsers**: Chat & file parsers (placeholder)
- **agents**: Agent framework (placeholder)
- **verifiers**: Verification tools (placeholder)

### Infrastructure

- **Database**: Neo4j 5.19 (Docker or Aura)
- **File Storage**: Local filesystem (S3 planned for production)
- **Build Tool**: Turborepo 1.13.4
- **Package Manager**: npm 9+
- **Node Version**: 18+

---

## Development Guide

### Prerequisites

- Node.js 18+
- npm 9+
- Neo4j 5.x (Docker or cloud)

### Initial Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start Neo4j** (Docker):

   ```bash
   docker run --name neo4j \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/testpassword \
     neo4j:5.19
   ```

3. **Configure environment**:

   Backend (`apps/api/.env`):

   ```env
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=testpassword
   STORAGE_PATH=./storage
   PORT=3001
   ```

   Frontend (`apps/web/.env.local`):

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

4. **Start development servers**:

   ```bash
   npm run dev
   ```

   This starts:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001

### Development Workflow

**File Upload Flow**:

1. Visit http://localhost:3000/ingest
2. Drag & drop files
3. Files fingerprinted (SHA-256)
4. Auto-grouped by type/domain
5. Persisted to Neo4j
6. View on keimenon at `/board/default_board`

**Building Packages**:

```bash
# Build all
npm run build

# Type check all
npm run type-check

# Lint all
npm run lint
```

**Database Management**:

- Neo4j Browser: http://localhost:7474
- Schema auto-initializes on API startup
- View all nodes: `MATCH (n) RETURN n LIMIT 25`
- View all edges: `MATCH ()-[r]->() RETURN r LIMIT 25`

### Project Scripts

```bash
npm run dev              # Start all services
npm run dev:clean        # Start with clean build
npm run build            # Build all packages
npm run type-check       # TypeScript validation
npm run lint             # ESLint check
npm run validate         # Validate environment
npm run kill-ports       # Kill ports 3000, 3001
npm run check-ports      # Check if ports available
```

---

## API Reference

### Base URL

`http://localhost:3001/api/v1`

### Health & Info

**GET** `/health`

Returns API health status and Neo4j connection.

```json
{
  "status": "ok",
  "timestamp": "2025-10-11T...",
  "service": "keimenon-api",
  "neo4j": "connected"
}
```

**GET** `/api/v1`

Returns API documentation with all endpoints.

### Ingest

**POST** `/api/v1/ingest/files`

Upload files with automatic fingerprinting and grouping.

**Request**: `multipart/form-data`

- `files`: File[] (max 10 files, 10MB each)
- `board_id`: string (optional)

**Response**:

```json
{
  "success": true,
  "sources": [...],
  "groups": [...],
  "duplicates": [...]
}
```

**GET** `/api/v1/ingest/status`

Get storage usage statistics.

### Import (Chat Conversations)

**POST** `/api/v1/import/chat`

Import AI chat conversations from JSON/JSONL files.

**Request**: `multipart/form-data`

- `file`: File (ChatGPT, Claude, or Gemini export)
- `config`: JSON string with import configuration

**Response**:

```json
{
  "success": true,
  "import_id": "imp_...",
  "stats": {
    "conversations_found": 10,
    "messages_processed": 250,
    "sources_created": 45,
    "code_blocks_extracted": 12
  }
}
```

**POST** `/api/v1/import/enhanced`

Advanced import with streaming, code extraction, and duplicate detection.

**POST** `/api/v1/import-stream`

Streaming import with real-time progress updates.

**POST** `/api/v1/import/chat/batch`

Batch import multiple files at once.

**GET** `/api/v1/import/config/defaults`

Get default import configuration.

**POST** `/api/v1/import/chat/apply-decisions`

Apply duplicate merge/skip decisions.

**GET** `/api/v1/import/chat/decisions/status/:import_id`

Get status of duplicate decisions for an import.

### Nodes

**GET** `/api/v1/nodes`

List nodes with optional filters.

**Query Params**:

- `kind`: NodeKind (optional)
- `board_id`: string (optional)
- `limit`: number (default: 100)
- `offset`: number (default: 0)

**GET** `/api/v1/nodes/:id`

Get single node by ID.

**POST** `/api/v1/nodes/source`

Create a new Source node.

**Body**:

```json
{
  "title": "Example.pdf",
  "fingerprint": "sha256_hash",
  "mime_type": "application/pdf",
  "url": "https://example.com/doc.pdf",
  "board_id": "default_board"
}
```

**POST** `/api/v1/nodes/group`

Create a new Group node.

**DELETE** `/api/v1/nodes/:id`

Delete a node by ID.

### Edges

**GET** `/api/v1/edges`

List edges with optional filters.

**Query Params**:

- `from`: string (source node ID)
- `to`: string (target node ID)
- `kind`: EdgeKind
- `limit`: number

**POST** `/api/v1/edges`

Create a new edge.

**Body**:

```json
{
  "from": "src_abc123",
  "to": "grp_xyz789",
  "kind": "CONTAINS",
  "metadata": {}
}
```

**DELETE** `/api/v1/edges`

Delete an edge.

**Query Params**:

- `from`: string (required)
- `to`: string (required)
- `kind`: EdgeKind (required)

**GET** `/api/v1/edges/node/:nodeId`

Get all edges for a node (incoming + outgoing).

### Boards

**GET** `/api/v1/boards`

List all boards.

**GET** `/api/v1/boards/:id`

Get board details.

**GET** `/api/v1/boards/:id/graph`

Get full graph (nodes + edges) for a board.

**Response**:

```json
{
  "nodes": [...],
  "edges": [...],
  "stats": {
    "node_count": 42,
    "edge_count": 87
  }
}
```

**POST** `/api/v1/boards`

Create a new board.

**PUT** `/api/v1/boards/:id`

Update board properties.

**DELETE** `/api/v1/boards/:id`

Delete a board (optional cascade).

---

## Roadmap & Phases

### Phase 1: MVP (Free Tier) — 8-12 weeks

**Goal**: Basic ingest, organize, visualize workflow

#### Phase 1A: Foundation ✅ COMPLETE

- Monorepo setup
- TypeScript configuration
- Next.js frontend
- Express backend
- Neo4j client
- Type system
- UI components

#### Phase 1B: Ingest & Autogroup ✅ COMPLETE

- File upload endpoint
- Fingerprinting service
- Storage service
- Rule-based autogrouping
- Neo4j persistence
- Upload UI

#### Phase 1C: Keimenon ✅ COMPLETE

- 2D keimenon rendering
- D3-force layout
- Pan & zoom
- Node selection
- Board page
- Graph query API

#### Phase 1D: Claims & Docs 🔄 IN PROGRESS

- Manual claim extraction
- ObjectiveClaim persistence
- Citation tracking
- UnifiedDoc L0 compiler
- Markdown export
- Sequester UI

**Acceptance Criteria**:

- Upload mixed files → see grouped on keimenon
- Toggle sequester on nodes
- Extract 10-50 claims manually
- Compose L0 doc with citations
- Export to Markdown

### Phase 2: Pro Features — 4-6 weeks

**Goal**: AI-powered features and verification

- [ ] Archetype nodes (Summarizer, Extractor, Planner, etc.)
- [ ] Chat with scope + receipts
- [ ] Verifiers (HTTP_CHECK, SCHEMA_MATCH, COMPUTE)
- [ ] Galaxy lens with trust warping
- [ ] UnifiedDocs L0/L1 (5k/20k/50k)
- [ ] Embedding-based clustering
- [ ] Scope algebra + query language

### Phase 3: Business Features — 6-8 weeks

**Goal**: Organization features and workflows

- [ ] BusinessNode & ProductGraph
- [ ] Action nodes (email, webhook, CRM)
- [ ] Multi-seat + roles
- [ ] SSO/SAML integration
- [ ] Scheduled agents
- [ ] PII governance
- [ ] Audit logs
- [ ] Admin console

### Phase 4: Polish & Scale — 4-6 weeks

**Goal**: Production readiness and performance

- [ ] Proof verifiers (Lean, Coq)
- [ ] Cross-board references
- [ ] Mobile UI
- [ ] Performance optimizations (LOD, edge sampling)
- [ ] CRDT for collaboration
- [ ] Advanced lenses (nD, Matrix, Timeline)

---

## Key Differences from Linear Chat Systems

| Aspect              | Traditional Chat                  | Keimenon                           |
| ------------------- | --------------------------------- | ---------------------------------- |
| **Context**         | Implicit conversation history     | Explicit scope sets with receipts  |
| **Organization**    | Linear threads                    | Spatial graph with typed edges     |
| **Verification**    | Trust the model                   | Tool-based verification required   |
| **Reproducibility** | Impossible (temperature, context) | Full via scope receipts            |
| **Privacy**         | All-or-nothing                    | Per-node sequester policies        |
| **Claims**          | Mixed with prose                  | Extracted, tracked, verified       |
| **Documentation**   | Regenerate each time              | Versioned UnifiedDocs with lineage |
| **Collaboration**   | Shared thread                     | Multi-lens graph views             |

---

## Glossary

**Board**: Top-level workspace container for nodes and edges

**Keimenon**: Visual spatial interface for graph exploration

**Claim**: Testable factual statement (ObjectiveClaim node)

**Constellation**: Collapsed cluster of nodes (zoom-to-reveal)

**Edge**: Typed relationship between nodes with policy

**Fingerprint**: SHA-256 content hash for deduplication

**Lens**: Spatial view with different distance metrics (2D, 3D, Galaxy, nD)

**Node**: Fundamental graph entity (Source, Group, Claim, etc.)

**POR (Point of Reference)**: Canonical UnifiedDoc for a topic

**Receipt**: Serialized scope + lens + ranker for reproducibility

**Ring**: UnifiedDoc detail level (L0-L3)

**Scope**: Concrete set of nodes used as context

**ScopeSet**: First-class object representing active scope

**Sequester**: Edge policy to hide content from models/tools/UI

**UnifiedDoc**: Consolidated document with citations and rings

**Verifier**: Tool that produces evidence (HTTP, schema, compute, proof)

---

## Contributing & Development

### Adding a New Node Type

1. Add Zod schema to `packages/types/src/nodes.ts`
2. Update database schema in `packages/db/src/schemas.ts`
3. Add API endpoints in `apps/api/src/routes/nodes.ts`
4. Create UI component in `apps/web/src/components/`
5. Update keimenon renderer to handle new type

### Adding a New Edge Type

1. Add to EdgeKind enum in `packages/types/src/edges.ts`
2. Update edge CRUD in `apps/api/src/routes/edges.ts`
3. Add policy validation if needed
4. Update keimenon edge rendering

### Testing

**Manual Testing**:

1. Upload files at `/ingest`
2. Verify in Neo4j Browser
3. Check keimenon rendering
4. Test selection and zoom

**Automated Testing** (TODO):

- Unit tests: Jest/Vitest
- E2E tests: Playwright
- API tests: Supertest

### Architecture Decisions

See `ai_context/` for detailed specifications:

- [keimenon_living_spec_v_0.md](ai_context/keimenon_living_spec_v_0.md) - Core concepts
- [mvp_vs_final_vision_roadmap_model_v_0.md](ai_context/mvp_vs_final_vision_roadmap_model_v_0.md) - Roadmap
- [plans_tiers_accounts_roles_and_phased_rollout_v_0 (1).md](ai_context/plans_tiers_accounts_roles_and_phased_rollout_v_0 (1).md) - Tiering
- [ui_screens_layout_view_map_v_0.md](ai_context/ui_screens_layout_view_map_v_0.md) - UI layout

---

## Support & Resources

- **Documentation**: `ai_context/` folder
- **Neo4j Browser**: http://localhost:7474
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

---

**Last Updated**: 2025-10-11
**Version**: 0.2.0
**Maintainers**: Keimenon Team
