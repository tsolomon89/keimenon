# Keimenon — Architecture Guide

**Last Updated**: 2025-10-11
**For**: Developers joining the project
**Version**: 0.3.0 - Now includes Chat Import System & SQLite support

---

## System Overview

Keimenon is a **graph-native knowledge management system** with dual storage options (Neo4j or SQLite), a React frontend, and Express backend. Everything is a node, relationships are typed edges with policy.

```
User Interface (Next.js)
        ↓
   REST API (Express)
        ↓
  Graph Database (Neo4j OR SQLite)
        ↓
   File Storage (Local/S3)
```

**Key Feature:** Import and organize AI chat conversations (ChatGPT, Claude, Gemini) with automatic code extraction and duplicate detection.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Next.js     │  │  React       │  │  Keimenon2D    │         │
│  │  App Router  │  │  Components  │  │  (D3/Three)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                            │ HTTP/REST
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    API Server (Express)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Routes      │  │  Services    │  │  Middleware  │         │
│  │  /ingest     │  │  Fingerprint │  │  Auth/CORS   │         │
│  │  /nodes      │  │  Storage     │  │  Validation  │         │
│  │  /edges      │  │  Autogroup   │  │  Error       │         │
│  │  /boards     │  │  Claims      │  │  Rate Limit  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
                            │ Neo4j Driver
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    Neo4j Graph Database                         │
│  ┌──────────────────────────────────────────────────┐          │
│  │  Nodes                                            │          │
│  │  • Source (files, URLs)                          │          │
│  │  • Group (collections)                           │          │
│  │  • ObjectiveClaim (verified facts)               │          │
│  │  • UnifiedDoc (consolidated docs)                │          │
│  │  • ... (11 total types)                          │          │
│  └──────────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────────┐          │
│  │  Edges (Relationships)                            │          │
│  │  • CONTAINS (Group → Source)                     │          │
│  │  • SEQUESTERS (hiding policy)                    │          │
│  │  • DERIVES_FROM (citations)                      │          │
│  │  • ... (11 total types)                          │          │
│  └──────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Upload Flow

```
1. User drags file to browser
   ↓
2. FileUploadZone component captures file
   ↓
3. POST /api/v1/ingest/files (multipart)
   ↓
4. Multer middleware saves to temp
   ↓
5. Fingerprint service calculates SHA-256
   ↓
6. Storage service checks for duplicate
   ↓
7. If new: save to storage/uploads/
   ↓
8. Create Source node in Neo4j
   ↓
9. Autogroup service clusters sources
   ↓
10. Create Group nodes + CONTAINS edges
   ↓
11. Return JSON response with sources & groups
   ↓
12. Frontend displays results
```

### Keimenon Render Flow

```
1. User visits /board/:id
   ↓
2. Page component mounts
   ↓
3. Fetch GET /api/v1/boards/:id/graph
   ↓
4. API queries Neo4j:
   MATCH (n {board_id: $id})
   MATCH (n)-[r]->()
   RETURN n, r
   ↓
5. Return nodes[] + edges[] JSON
   ↓
6. Keimenon2D component receives data
   ↓
7. D3-force calculates layout
   ↓
8. Keimenon draws nodes + edges
   ↓
9. User can pan/zoom/select
```

### Chat Import Flow (Fully Implemented)

```
1. User uploads chat export file (JSON/JSONL)
   ↓
2. POST /api/v1/import/enhanced
   Body: FormData with file + config
   ↓
3. Import service:
   - Detect format (ChatGPT, Claude, Gemini)
   - Stream parse JSON (handle large files)
   - Extract conversations and messages
   ↓
4. Sources mode (if enabled):
   - Segment extractor identifies meaningful chunks
   - Stitcher combines by strategy (chat/title/topic)
   - Apply filters (min chars, role subset)
   ↓
5. Code extraction (if enabled):
   - Detect code blocks in messages
   - Extract with language metadata
   - Deduplicate across conversations
   ↓
6. Duplicate detection:
   - Similarity engine compares content
   - Apply algorithm (jaccard/levenshtein/cosine)
   - Flag potential duplicates
   ↓
7. Save to database:
   - Create ChatThread, Message, Source nodes
   - Create CONTAINS edges
   - Store code assets separately
   ↓
8. Return import results:
   - Stats (conversations, messages, sources, code blocks)
   - Duplicate decisions (if any)
   ↓
9. Frontend displays results + decision UI
```

---

## Monorepo Structure

### Turborepo Workspaces

```
keimenon/
├── apps/
│   ├── web/          # Frontend application
│   └── api/          # Backend API
└── packages/
    ├── types/        # Shared TypeScript types
    ├── db/           # Database client
    ├── ui/           # UI components
    ├── graph/        # Graph algorithms
    ├── parsers/      # File parsers
    ├── agents/       # Agent framework
    └── verifiers/    # Verification tools
```

### Dependency Graph

```
apps/web → packages/ui → packages/types
         → packages/graph → packages/types

apps/api → packages/db → packages/types
         → packages/types
         → packages/parsers → packages/types
         → packages/agents → packages/types
         → packages/verifiers → packages/types
```

### Build Order

1. `packages/types` (no dependencies)
2. `packages/db` (depends on types)
3. `packages/ui` (depends on types)
4. `packages/graph` (depends on types)
5. `packages/parsers` (depends on types)
6. `packages/agents` (depends on types, db)
7. `packages/verifiers` (depends on types)
8. `apps/api` (depends on db, types, parsers, agents, verifiers)
9. `apps/web` (depends on ui, types, graph)

---

## Frontend Architecture (apps/web)

### Next.js App Router Structure

```
app/
├── layout.tsx                    # Root layout (dark theme, fonts)
├── page.tsx                      # Landing page
├── globals.css                   # Global styles (Tailwind)
│
├── ingest/
│   └── page.tsx                  # File upload page
│
├── board/
│   └── [id]/
│       └── page.tsx              # Keimenon viewer (dynamic route)
│
├── claims/
│   └── page.tsx                  # Claims panel (future)
│
└── docs/
    └── [id]/
        └── page.tsx              # UnifiedDoc viewer (future)
```

### Component Hierarchy

```
RootLayout
├── Header (nav, breadcrumbs)
├── Page (route-specific)
│   ├── IngestPage
│   │   ├── FileUploadZone
│   │   ├── UploadProgress
│   │   └── IngestResults
│   │
│   └── BoardPage
│       └── FourRegionLayout
│           ├── Header (lens selector, scope chips)
│           ├── LHS (groups tree, filters)
│           ├── Main (Keimenon2D)
│           ├── RHS (selection inspector, claims panel)
│           └── Footer (console, collapsible)
│
└── Footer
```

### State Management

**Client Components** use:

- React `useState` for local state
- Zustand for global state (future)
- React Query for server state (future)

**Server Components** use:

- Direct fetch to API
- Props drilling (currently simple)

### Keimenon Rendering (Keimenon2D.tsx)

```typescript
// Simplified flow
function Keimenon2D({ nodes, edges }) {
  const keimenonRef = useRef<HTMLKeimenonElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // 1. Calculate layout
  useEffect(() => {
    const layout = calculateLayout(nodes, edges); // D3-force
    setNodePositions(layout);
  }, [nodes, edges]);

  // 2. Draw on keimenon
  useEffect(() => {
    const ctx = keimenonRef.current?.getContext('2d');
    drawNodes(ctx, nodes, transform);
    drawEdges(ctx, edges, transform);
  }, [nodes, edges, transform]);

  // 3. Handle interactions
  function handleMouseDown(e) { /* pan or select */ }
  function handleWheel(e) { /* zoom */ }

  return <keimenon ref={keimenonRef} onMouseDown={...} onWheel={...} />;
}
```

**Key Technologies**:

- HTML Keimenon API (2D rendering)
- D3-force (layout algorithm)
- React hooks (state & lifecycle)

---

## Backend Architecture (apps/api)

### Express Server Structure

```
src/
├── index.ts                      # Main server entry
│   ├── Express setup
│   ├── Middleware registration
│   ├── Route registration
│   ├── Neo4j initialization
│   └── Error handler
│
├── routes/
│   ├── ingest.ts                 # POST /ingest/files, GET /ingest/status
│   ├── nodes.ts                  # CRUD for nodes
│   ├── edges.ts                  # CRUD for edges
│   ├── boards.ts                 # CRUD for boards
│   └── claims.ts                 # Claims endpoints (future)
│
├── services/
│   ├── fingerprint.ts            # SHA-256 hashing
│   ├── storage.ts                # File storage
│   ├── autogroup.ts              # Rule-based clustering
│   ├── claims.ts                 # Claim extraction (future)
│   └── unifieddoc.ts             # Doc compilation (future)
│
└── middleware/
    ├── auth.ts                   # Authentication (future)
    ├── validation.ts             # Zod validation (future)
    └── rateLimit.ts              # Rate limiting (future)
```

### Request Flow

```
1. Request arrives
   ↓
2. CORS middleware (allow all origins in dev)
   ↓
3. Helmet middleware (security headers)
   ↓
4. Body parser (JSON + multipart)
   ↓
5. Rate limiter (future)
   ↓
6. Auth middleware (future)
   ↓
7. Route handler
   ↓
8. Validation (Zod schema) (future)
   ↓
9. Business logic (service layer)
   ↓
10. Database query (Neo4j)
   ↓
11. Response (JSON)
   ↓
12. Error handler (if exception)
```

### Service Layer Pattern

```typescript
// Example: storage.ts
export class StorageService {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async saveFile(file: Buffer, fingerprint: string): Promise<string> {
    // 1. Generate path
    const path = this.getPath(fingerprint);

    // 2. Check if exists (dedup)
    if (await this.exists(path)) {
      return path;
    }

    // 3. Write file
    await fs.writeFile(path, file);

    return path;
  }

  async getFile(fingerprint: string): Promise<Buffer> { ... }
  async deleteFile(fingerprint: string): Promise<void> { ... }
}
```

**Why service layer?**

- Separation of concerns (routes vs logic)
- Reusability (services used by multiple routes)
- Testability (mock services in tests)

---

## Database Architecture (Neo4j)

### Graph Schema

**Nodes** have:

- Labels: `Node`, `Source`, `Group`, etc. (multi-label)
- Properties: `id`, `kind`, `created_at`, `updated_at`, ...
- Constraints: `id` unique per label

**Edges** have:

- Type: `CONTAINS`, `SEQUESTERS`, `DERIVES_FROM`, ...
- Properties: `created_at`, `metadata`, ...

### Schema Visualization

```
(Source:Node)
    │
    │ CONTAINS
    ▼
(Group:Node)
    │
    │ SEQUESTERS
    ▼
(Folder:Node)

(ObjectiveClaim:Node)
    │
    │ DERIVES_FROM
    ▼
(Source:Node)

(UnifiedDoc:Node)
    │
    │ DERIVES_FROM
    ▼
(ObjectiveClaim:Node)
```

### Indexes & Constraints

```cypher
// Uniqueness constraints
CREATE CONSTRAINT node_id_unique FOR (n:Node) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT source_fingerprint_unique FOR (s:Source) REQUIRE s.fingerprint IS UNIQUE;
CREATE CONSTRAINT user_email_unique FOR (u:UserNode) REQUIRE u.email IS UNIQUE;

// Performance indexes
CREATE INDEX node_kind FOR (n:Node) ON (n.kind);
CREATE INDEX node_created_at FOR (n:Node) ON (n.created_at);
CREATE INDEX source_mime_type FOR (s:Source) ON (s.mime_type);
CREATE INDEX claim_status FOR (c:ObjectiveClaim) ON (c.status);
```

### Common Queries

**Get all nodes in a board** (Neo4j):

```cypher
MATCH (n:Node {board_id: $boardId})
RETURN n
ORDER BY n.created_at DESC
```

**Get all nodes in a board** (SQLite):

```sql
SELECT * FROM nodes
WHERE board_id = ?
ORDER BY created_at DESC
```

**Get graph (nodes + edges) for keimenon** (Neo4j):

```cypher
MATCH (n:Node {board_id: $boardId})
OPTIONAL MATCH (n)-[r]-(m:Node {board_id: $boardId})
RETURN n, r, m
```

**Find sources in a group** (Neo4j):

```cypher
MATCH (g:Group {id: $groupId})-[:CONTAINS]->(s:Source)
RETURN s
```

**Get messages in a chat thread** (Neo4j):

```cypher
MATCH (t:ChatThread {id: $threadId})-[:CONTAINS]->(m:Message)
RETURN m ORDER BY m.timestamp
```

**Check for duplicates by fingerprint** (Neo4j):

```cypher
MATCH (s:Source {fingerprint: $fingerprint})
RETURN s
```

**Find similar sources** (Similarity Engine):

```typescript
// Uses jaccard, levenshtein, or cosine similarity
const similar = await similarityEngine.findSimilar(
  sourceContent,
  threshold: 0.85,
  algorithm: 'jaccard'
);
```

---

## Type System (packages/types)

### Zod Schemas

All data models use Zod for:

1. **Runtime validation**: Ensure data matches schema
2. **Type inference**: TypeScript types derived from schemas
3. **API contracts**: Validate request/response bodies

**Example**:

```typescript
// Define schema
export const SourceNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('Source'),
  fingerprint: z.string(),
  mime_type: z.string(),
  title: z.string(),
  url: z.string().optional(),
  // ...
});

// Infer TypeScript type
export type SourceNode = z.infer<typeof SourceNodeSchema>;

// Use in API
app.post('/nodes/source', async (req, res) => {
  const source = SourceNodeSchema.parse(req.body); // Throws if invalid
  // ...
});
```

### Type Organization

```
packages/types/src/
├── index.ts              # Re-exports everything
├── nodes.ts              # All node types (11 schemas)
├── edges.ts              # All edge types (11 schemas)
├── policies.ts           # LimitsPolicy, Entitlement, ModelPolicy
├── receipts.ts           # ScopeSet, Receipt, AgentRun, VerifierRun
└── plans.ts              # Workspace, Board, UsageMeter, BudgetEvent
```

---

## Graph Algorithms (packages/graph)

### Layout Algorithm (D3-force)

```typescript
import * as d3 from 'd3-force';

export function calculateLayout(nodes, edges) {
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3.forceLink(edges).id((d) => d.id)
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(nodeRadius));

  // Run simulation to convergence
  simulation.tick(300);

  return {
    nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    edges: edges,
  };
}
```

**Forces**:

- **Link**: Pull connected nodes together
- **Charge**: Push all nodes apart (prevent overlap)
- **Center**: Keep graph centered in viewport
- **Collision**: Prevent nodes from overlapping

### Clustering (packages/graph/src/clustering.ts)

**By Type**:

```typescript
export function clusterByType(nodes: Node[]) {
  const groups = new Map<string, Node[]>();

  for (const node of nodes) {
    const kind = node.kind;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(node);
  }

  return Array.from(groups.entries()).map(([kind, members]) => ({
    name: kind,
    members: members.map((m) => m.id),
  }));
}
```

**By Property** (e.g., MIME type, domain):

```typescript
export function clusterByProperty(nodes: Node[], prop: string) {
  const groups = new Map<string, Node[]>();

  for (const node of nodes) {
    const value = node[prop];
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value)!.push(node);
  }

  return Array.from(groups.entries()).map(([value, members]) => ({
    name: value,
    members: members.map((m) => m.id),
  }));
}
```

---

## Security & Privacy

### Sequester System

**Purpose**: Hide sensitive content from models/tools/UI

**Implementation** (Edge-based):

```cypher
// Create sequester edge
CREATE (g:Group)-[:SEQUESTERS {
  hidden_from_llm: true,
  hidden_from_tools: false,
  reason: 'secret',
  until: timestamp() + 30 * 86400000  // 30 days
}]->(s:Source)
```

**Enforcement** (Query-time):

```cypher
// Get scope excluding sequestered nodes
MATCH (n:Node {board_id: $boardId})
WHERE NOT EXISTS {
  MATCH (n)<-[:SEQUESTERS {hidden_from_llm: true}]-()
}
RETURN n
```

### Authentication (Future)

**Planned approach**:

1. Use Clerk or Auth0 for identity
2. Store UserNode in Neo4j
3. JWT tokens in request headers
4. Middleware checks token validity
5. Attach user ID to request
6. Check OWNED_BY edges for access control

---

## Performance Considerations

### Frontend

**Keimenon Optimization**:

- Viewport culling (only render visible nodes)
- LOD (level of detail based on zoom)
- OffscreenKeimenon (future)
- Web Workers for layout (future)

**Bundle Optimization**:

- Code splitting (Next.js automatic)
- Tree shaking (eliminate unused code)
- Lazy loading (React.lazy for heavy components)

### Backend

**Query Optimization**:

- Indexes on frequently queried fields
- Parameterized queries (prevent injection)
- Batch fetches (reduce round-trips)
- Connection pooling (Neo4j driver built-in)

**Caching** (Future):

- Redis for frequently accessed data
- Graph query result caching
- Layout caching (save positions)

### Database

**Neo4j Tuning**:

- Increase heap size for large graphs
- Enable query logging for slow queries
- Use PROFILE to identify bottlenecks
- Periodic VACUUM and REINDEX

---

## Error Handling

### Current Approach

**Frontend**:

```typescript
try {
  const response = await fetch('/api/v1/nodes');
  const data = await response.json();
} catch (error) {
  console.error('Failed to fetch nodes', error);
  // TODO: Toast notification
}
```

**Backend**:

```typescript
app.get('/api/v1/nodes', async (req, res) => {
  try {
    const nodes = await neo4j.execute('MATCH (n) RETURN n');
    res.json(nodes);
  } catch (error) {
    console.error('Error fetching nodes', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Planned Improvements

**Error Boundaries** (React):

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

**Structured Errors** (API):

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number
  ) {
    super(message);
  }
}

// Usage
throw new AppError('NODE_NOT_FOUND', 'Node not found', 404);

// Middleware
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }
});
```

---

## Testing Strategy (Future)

### Unit Tests (Vitest)

**Packages** (`packages/*/src/*.test.ts`):

- Graph algorithms (layout, clustering)
- Type validation (Zod schemas)
- Utility functions

**Example**:

```typescript
import { describe, it, expect } from 'vitest';
import { clusterByType } from './clustering';

describe('clusterByType', () => {
  it('groups nodes by kind', () => {
    const nodes = [
      { id: '1', kind: 'Source' },
      { id: '2', kind: 'Source' },
      { id: '3', kind: 'Group' },
    ];

    const clusters = clusterByType(nodes);

    expect(clusters).toHaveLength(2);
    expect(clusters[0].members).toHaveLength(2);
  });
});
```

### Integration Tests (Supertest)

**API endpoints** (`apps/api/tests/*.test.ts`):

```typescript
import request from 'supertest';
import { app } from '../src/index';

describe('POST /api/v1/nodes/source', () => {
  it('creates a source node', async () => {
    const response = await request(app).post('/api/v1/nodes/source').send({
      title: 'Test',
      fingerprint: 'abc123',
      mime_type: 'text/plain',
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });
});
```

### E2E Tests (Playwright)

**User flows** (`tests/e2e/*.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test('upload and view on keimenon', async ({ page }) => {
  // 1. Go to ingest page
  await page.goto('http://localhost:3000/ingest');

  // 2. Upload file
  await page.setInputFiles('input[type="file"]', 'test.pdf');
  await page.click('button:has-text("Upload")');

  // 3. Wait for success
  await expect(page.locator('text=Upload Successful')).toBeVisible();

  // 4. Go to keimenon
  await page.click('text=View on Keimenon');

  // 5. Verify node appears
  await expect(page.locator('keimenon')).toBeVisible();
});
```

---

## Deployment (Future)

### Docker Compose

```yaml
version: '3.8'
services:
  neo4j:
    image: neo4j:5.19
    ports:
      - '7474:7474'
      - '7687:7687'
    environment:
      NEO4J_AUTH: neo4j/password

  api:
    build: ./apps/api
    ports:
      - '3001:3001'
    environment:
      NEO4J_URI: bolt://neo4j:7687
    depends_on:
      - neo4j

  web:
    build: ./apps/web
    ports:
      - '3000:3000'
    environment:
      NEXT_PUBLIC_API_URL: http://api:3001
    depends_on:
      - api
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - run: vercel deploy --prod
```

---

## Development Workflow

### Feature Development

1. **Create branch** from `main`
2. **Update TODO_TRACKER.md** with task
3. **Add types** in `packages/types` if needed
4. **Implement backend** in `apps/api`
5. **Implement frontend** in `apps/web`
6. **Test manually** (automated tests TODO)
7. **Update docs** (MASTER_DOCS.md, etc.)
8. **Create PR** with description
9. **Review & merge** to `main`

### Code Review Checklist

- [ ] TypeScript types are explicit (no `any`)
- [ ] Zod validation at API boundaries
- [ ] Error handling with try/catch
- [ ] No hardcoded values (use config)
- [ ] No console.log in production code
- [ ] Comments for complex logic
- [ ] No security vulnerabilities (SQL injection, XSS)
- [ ] Tests added/updated (future)

---

## Common Pitfalls & Solutions

### 1. "Module not found" errors

**Cause**: Package not built or dependency not declared

**Solution**:

```bash
cd packages/types && npm run build
cd packages/db && npm run build
# etc.
```

### 2. Neo4j connection timeout

**Cause**: Database not running or wrong credentials

**Solution**:

```bash
docker ps | grep neo4j  # Check running
docker logs neo4j       # Check logs
# Verify .env has correct NEO4J_URI, USER, PASSWORD
```

### 3. Keimenon not rendering nodes

**Cause**: No data in database or query error

**Solution**:

```bash
# Check Neo4j has nodes
curl http://localhost:7474
# Login and run: MATCH (n) RETURN count(n)

# Check API returns data
curl http://localhost:3001/api/v1/nodes
```

### 4. Type errors in frontend

**Cause**: Types package not built or outdated

**Solution**:

```bash
cd packages/types
npm run build
cd ../../apps/web
npm run type-check
```

---

## Key Design Decisions

### Why Neo4j + SQLite?

**Neo4j** (keimenon mode):

- Graph-native storage for relationships
- Relationships are first-class (not foreign keys)
- Traversals are O(1) per hop
- Flexible schema (add properties anytime)
- Cypher query language (expressive)
- Best for: Complex graph queries, large datasets, production

**SQLite** (local mode):

- Zero-configuration embedded database
- Single file, no server required
- Fast for small-to-medium datasets (<10k nodes)
- Perfect for: Local development, demos, Free tier
- Easy backup (copy one file)

**Hybrid mode**:

- Primary storage in SQLite
- Background sync to Neo4j for keimenon features
- Best of both worlds for Pro tier

**Alternatives considered**:

- PostgreSQL: Relational, harder to model graphs, requires server
- MongoDB: Document store, weak on relationships
- DGraph: Good but less mature ecosystem

### Why Next.js?

**Server & client in one framework**:

- Server components (reduce JS bundle)
- App Router (file-based routing)
- Built-in optimization (images, fonts)
- Vercel deployment (easy hosting)

**Alternatives considered**:

- Create React App: Client-only, less optimized
- Remix: Good but smaller ecosystem
- Vite + React: More manual setup

### Why Monorepo?

**Shared code without publishing**:

- Packages (types, db, ui) used by apps
- Single version of dependencies
- Turborepo caching (fast builds)
- Easier refactoring (cross-package changes)

**Alternatives considered**:

- Separate repos: Harder to keep in sync
- Single app: Would become too large

### Why Zod?

**Runtime validation + types**:

- Catch errors at API boundary
- TypeScript types inferred from schemas
- Better than manual validation
- Widely used in modern TypeScript

**Alternatives considered**:

- Joi: Node-first, no TS inference
- Yup: Similar to Joi
- TypeBox: JSON Schema-based

---

## Resources & References

### Documentation

- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [D3-force Documentation](https://github.com/d3/d3-force)
- [Zod Documentation](https://zod.dev/)
- [Turborepo Docs](https://turbo.build/repo/docs)

### Internal Docs

- [MASTER_DOCS.md](MASTER_DOCS.md) - Complete reference
- [TODO_TRACKER.md](TODO_TRACKER.md) - Work remaining
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Quick overview
- `ai_context/*.md` - Design specifications

---

**Last Updated**: 2025-10-11
**Maintainers**: Keimenon Team
