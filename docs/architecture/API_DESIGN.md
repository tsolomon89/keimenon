# API Design & Architecture

**Canvas Memory OS - REST API Design Patterns and Conventions**

This document describes the API architecture, design patterns, endpoint organization, error handling, and middleware stack for Canvas Memory OS.

---

## Table of Contents

- [API Overview](#api-overview)
- [Design Principles](#design-principles)
- [Endpoint Organization](#endpoint-organization)
- [Request/Response Patterns](#requestresponse-patterns)
- [DatabaseClient Abstraction](#databaseclient-abstraction)
- [Error Handling](#error-handling)
- [Middleware Stack](#middleware-stack)
- [Authentication & Authorization](#authentication--authorization)
- [Validation](#validation)
- [Performance & Caching](#performance--caching)

---

## API Overview

### Base URL

```
http://localhost:4001/api/v1
```

**Production**: Replace with your domain (e.g., `https://api.canvas-memory.com/api/v1`)

### Versioning

API is versioned in the URL path:

- `/api/v1` - Current version (production)
- `/api/v2` - Future version (beta)

**Why URL versioning?**

- Clear separation between versions
- Easy to route in reverse proxy
- No header parsing required

### Authentication

All endpoints except `/auth/*` require JWT authentication:

```http
GET /api/v1/nodes
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Content Type

All requests/responses use JSON:

```http
Content-Type: application/json
```

**Exception**: File uploads use `multipart/form-data`

---

## Design Principles

### 1. RESTful Design

Follow REST conventions for resource operations:

| HTTP Method | CRUD Operation   | Example                              |
| ----------- | ---------------- | ------------------------------------ |
| **GET**     | Read (retrieve)  | `GET /nodes` - List nodes            |
| **POST**    | Create           | `POST /nodes/source` - Create source |
| **PUT**     | Update (replace) | `PUT /boards/:id` - Update board     |
| **PATCH**   | Update (partial) | `PATCH /nodes/:id` - Patch node      |
| **DELETE**  | Delete           | `DELETE /nodes/:id` - Delete node    |

### 2. Resource-Oriented URLs

URLs represent resources, not actions:

```
✅ GOOD: GET /api/v1/boards/123/graph
❌ BAD:  GET /api/v1/getBoardGraph?boardId=123

✅ GOOD: POST /api/v1/nodes/source
❌ BAD:  POST /api/v1/createSourceNode

✅ GOOD: DELETE /api/v1/nodes/123
❌ BAD:  POST /api/v1/deleteNode?id=123
```

### 3. Consistent Response Format

All successful responses return:

```json
{
  "data": { ... },      // Single resource
  "items": [ ... ],     // Multiple resources
  "meta": { ... },      // Metadata (pagination, counts)
  "success": true
}
```

All error responses return:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... },
  "success": false
}
```

### 4. Stateless

Each request contains all information needed:

- JWT token for authentication
- Query parameters for filters
- Request body for data

No server-side session state (except JWT session storage).

### 5. Idempotent Operations

Safe to retry without side effects:

- `GET` - Always idempotent
- `PUT` - Idempotent (replace entire resource)
- `DELETE` - Idempotent (delete if exists, no-op if not)
- `POST` - Not idempotent (creates new resource)

### 6. Storage-Agnostic

All routes use `DatabaseClient` interface:

- No direct SQLite or Neo4j imports
- Swap database without changing routes
- Testable with mock client

---

## Endpoint Organization

### Route Modules

API routes are organized by resource:

```
apps/api/src/routes/
├── auth.ts              # Authentication & session management
├── nodes.ts             # Node CRUD operations
├── edges.ts             # Edge CRUD operations
├── boards.ts            # Workspace/board management
├── content.ts           # Content retrieval (messages, sources, code)
├── import-enhanced.ts   # Chat import with configuration
├── import-stream.ts     # Streaming upload (large files)
├── ingest.ts            # File upload and ingestion
├── duplicates.ts        # Duplicate detection and merging
├── groups.ts            # Group management
├── analytics.ts         # Statistics and metrics
└── health.ts            # Health checks and readiness
```

### Endpoint Categories

#### 1. Authentication (`/api/v1/auth`)

| Endpoint                | Method | Auth Required | Description                 |
| ----------------------- | ------ | ------------- | --------------------------- |
| `/auth/register`        | POST   | ❌ No         | Register new account        |
| `/auth/login`           | POST   | ❌ No         | Login to account            |
| `/auth/logout`          | POST   | ✅ Yes        | Logout (invalidate session) |
| `/auth/me`              | GET    | ✅ Yes        | Get current user info       |
| `/auth/register/google` | POST   | ❌ No         | Register with Google OAuth  |

#### 2. Nodes (`/api/v1/nodes`)

| Endpoint        | Method | Auth Required | Permission | Description               |
| --------------- | ------ | ------------- | ---------- | ------------------------- |
| `/nodes`        | GET    | ✅ Yes        | None       | List nodes (with filters) |
| `/nodes/:id`    | GET    | ✅ Yes        | None       | Get node by ID            |
| `/nodes/source` | POST   | ✅ Yes        | Senior+    | Create source node        |
| `/nodes/group`  | POST   | ✅ Yes        | Senior+    | Create group node         |
| `/nodes/board`  | POST   | ✅ Yes        | Senior+    | Create board node         |
| `/nodes/:id`    | PUT    | ✅ Yes        | Senior+    | Update node               |
| `/nodes/:id`    | DELETE | ✅ Yes        | Leader+    | Delete node               |

#### 3. Edges (`/api/v1/edges`)

| Endpoint              | Method | Auth Required | Permission | Description               |
| --------------------- | ------ | ------------- | ---------- | ------------------------- |
| `/edges`              | GET    | ✅ Yes        | None       | List edges (with filters) |
| `/edges`              | POST   | ✅ Yes        | Senior+    | Create edge               |
| `/edges`              | DELETE | ✅ Yes        | Leader+    | Delete edge (by from/to)  |
| `/edges/node/:nodeId` | GET    | ✅ Yes        | None       | Get edges for node        |

#### 4. Boards (`/api/v1/boards`)

| Endpoint            | Method | Auth Required | Permission | Description                            |
| ------------------- | ------ | ------------- | ---------- | -------------------------------------- |
| `/boards`           | GET    | ✅ Yes        | None       | List boards                            |
| `/boards/:id`       | GET    | ✅ Yes        | None       | Get board by ID                        |
| `/boards/:id/graph` | GET    | ✅ Yes        | None       | Get board graph (nodes + edges)        |
| `/boards`           | POST   | ✅ Yes        | Senior+    | Create board                           |
| `/boards/:id`       | PUT    | ✅ Yes        | Senior+    | Update board                           |
| `/boards/:id`       | DELETE | ✅ Yes        | Leader+    | Delete board (optional: with contents) |

#### 5. Content (`/api/v1/content`)

| Endpoint                    | Method | Auth Required | Permission | Description                               |
| --------------------------- | ------ | ------------- | ---------- | ----------------------------------------- |
| `/content/message/:id`      | GET    | ✅ Yes        | None       | Get message content                       |
| `/content/source/:id`       | GET    | ✅ Yes        | None       | Get source content                        |
| `/content/code/:id`         | GET    | ✅ Yes        | None       | Get code block                            |
| `/content/conversation/:id` | GET    | ✅ Yes        | None       | Get full conversation (thread + messages) |
| `/content/stats`            | GET    | ✅ Yes        | None       | Database statistics                       |

#### 6. Import (`/api/v1/import`)

| Endpoint           | Method | Auth Required | Permission | Description                            |
| ------------------ | ------ | ------------- | ---------- | -------------------------------------- |
| `/import/enhanced` | POST   | ✅ Yes        | Senior+    | Enhanced chat import with config       |
| `/import/stream`   | POST   | ✅ Yes        | Senior+    | Streaming upload for large files (2GB) |

#### 7. Ingest (`/api/v1/ingest`)

| Endpoint         | Method | Auth Required | Permission | Description          |
| ---------------- | ------ | ------------- | ---------- | -------------------- |
| `/ingest/files`  | POST   | ✅ Yes        | Senior+    | Upload files         |
| `/ingest/status` | GET    | ✅ Yes        | None       | Get ingestion status |

#### 8. Analytics (`/api/v1/analytics`)

| Endpoint             | Method | Auth Required | Permission | Description               |
| -------------------- | ------ | ------------- | ---------- | ------------------------- |
| `/analytics/summary` | GET    | ✅ Yes        | None       | Summary statistics        |
| `/analytics/usage`   | GET    | ✅ Yes        | None       | Usage metrics for account |

---

## Request/Response Patterns

### List Resources (GET /nodes)

**Request**:

```http
GET /api/v1/nodes?kind=Source&limit=10&offset=0
Authorization: Bearer <token>
```

**Response**:

```json
{
  "success": true,
  "nodes": [
    {
      "id": "src_abc123",
      "kind": "Source",
      "fingerprint": "abc123...",
      "title": "My Document.pdf",
      "account_id": "acc_xyz789",
      "created_at": 1697123456789
    },
    ...
  ],
  "meta": {
    "total": 42,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

**Query Parameters**:

- `kind` - Filter by node type (Source, Group, etc.)
- `limit` - Max results (default: 100, max: 1000)
- `offset` - Pagination offset (default: 0)
- `board_id` - Filter by board

### Get Single Resource (GET /nodes/:id)

**Request**:

```http
GET /api/v1/nodes/src_abc123
Authorization: Bearer <token>
```

**Response**:

```json
{
  "success": true,
  "node": {
    "id": "src_abc123",
    "kind": "Source",
    "fingerprint": "abc123...",
    "mime_type": "application/pdf",
    "size_bytes": 1048576,
    "title": "My Document.pdf",
    "account_id": "acc_xyz789",
    "created_by": "usr_xyz456",
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  }
}
```

### Create Resource (POST /nodes/source)

**Request**:

```http
POST /api/v1/nodes/source
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "src_abc123",
  "kind": "Source",
  "fingerprint": "abc123...",
  "mime_type": "application/pdf",
  "size_bytes": 1048576,
  "title": "My Document.pdf",
  "url": "https://example.com/doc.pdf",
  "created_at": 1697123456789,
  "updated_at": 1697123456789
}
```

**Response**:

```json
{
  "success": true,
  "node": {
    "id": "src_abc123",
    "kind": "Source",
    ...
  },
  "message": "Source node created successfully"
}
```

### Update Resource (PUT /boards/:id)

**Request**:

```http
PUT /api/v1/boards/board_123
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Board Name",
  "description": "New description"
}
```

**Response**:

```json
{
  "success": true,
  "board": {
    "id": "board_123",
    "name": "Updated Board Name",
    "description": "New description",
    "updated_at": 1697123500000
  }
}
```

### Delete Resource (DELETE /nodes/:id)

**Request**:

```http
DELETE /api/v1/nodes/src_abc123
Authorization: Bearer <token>
```

**Response**:

```json
{
  "success": true,
  "message": "Node deleted successfully",
  "id": "src_abc123"
}
```

### File Upload (POST /ingest/files)

**Request**:

```http
POST /api/v1/ingest/files
Authorization: Bearer <token>
Content-Type: multipart/form-data

files: [File, File, File]
board_id: board_123
```

**Response**:

```json
{
  "success": true,
  "sources": [
    {
      "id": "src_abc123",
      "title": "document.pdf",
      "fingerprint": "abc123...",
      "duplicate": false
    },
    {
      "id": "src_def456",
      "title": "image.png",
      "fingerprint": "def456...",
      "duplicate": false
    }
  ],
  "groups": [
    {
      "id": "grp_documents",
      "name": "Documents",
      "members": ["src_abc123"]
    },
    {
      "id": "grp_images",
      "name": "Images",
      "members": ["src_def456"]
    }
  ],
  "stats": {
    "uploaded": 2,
    "duplicates": 0,
    "groups_created": 2
  }
}
```

---

## DatabaseClient Abstraction

### Why Abstract the Database?

**Benefits**:

1. **Storage-agnostic routes**: Swap SQLite ↔ Neo4j without changing routes
2. **Easier testing**: Mock DatabaseClient in tests
3. **Hybrid mode**: Write to both databases simultaneously
4. **Future-proof**: Add new storage backends (e.g., PostgreSQL)

### Interface Definition

```typescript
// packages/db/src/types.ts
export interface DatabaseClient {
  // Core CRUD
  createNode(node: Node): Promise<void>;
  createEdge(edge: Edge): Promise<void>;
  getNode(id: string): Promise<Node | null>;
  getNodeEdges(id: string, direction?: 'in' | 'out' | 'both'): Promise<Edge[]>;

  // Query execution
  execute(query: string, params: any[]): Promise<{ records: any[] }>;

  // Batch operations
  createNodesBatch(nodes: Node[]): Promise<void>;
  createEdgesBatch(edges: Edge[]): Promise<void>;

  // Lifecycle
  close(): Promise<void>;
}
```

### Global Instance

Created at startup and shared across all routes:

```typescript
// apps/api/src/index.ts
import { DatabaseFactory } from '@canvas-memory/db';

const storageMode = process.env.STORAGE_MODE || 'local';
const dbClient = DatabaseFactory.create(storageMode);

// Make available globally
global.dbClient = dbClient;

// Start server
app.listen(4001, () => {
  console.log('Canvas Memory API running on port 4001');
  console.log(`Storage mode: ${storageMode}`);
});
```

### Usage in Routes

```typescript
// apps/api/src/routes/nodes.ts
import { Router } from 'express';

const router = Router();

router.get('/:id', async (req, res) => {
  try {
    // Access global database client
    const db = global.dbClient;

    // Storage-agnostic query
    const node = await db.getNode(req.params.id);

    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Node not found',
      });
    }

    // Account isolation check
    if (req.user.accountType !== 'admin' && node.account_id !== req.user.accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    res.json({
      success: true,
      node,
    });
  } catch (error) {
    console.error('Error fetching node:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
```

### Complex Queries

For database-specific queries, use `execute()`:

```typescript
// SQLite-specific query
const result = await db.execute('SELECT * FROM nodes WHERE kind = ? AND account_id = ? LIMIT ?', [
  'Source',
  accountId,
  100,
]);

// Neo4j-specific query (Cypher)
const result = await db.execute(
  'MATCH (n:Node {kind: $kind, account_id: $accountId}) RETURN n LIMIT $limit',
  [{ kind: 'Source', accountId, limit: 100 }]
);
```

**Note**: `execute()` returns normalized format regardless of backend.

---

## Error Handling

### Error Response Format

All errors return consistent structure:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "email",
    "reason": "Invalid email format"
  }
}
```

### HTTP Status Codes

| Status  | Meaning               | When to Use                             |
| ------- | --------------------- | --------------------------------------- |
| **200** | OK                    | Successful GET/PUT/DELETE               |
| **201** | Created               | Successful POST (new resource)          |
| **204** | No Content            | Successful DELETE (no body)             |
| **400** | Bad Request           | Invalid input (validation error)        |
| **401** | Unauthorized          | Missing or invalid auth token           |
| **403** | Forbidden             | Insufficient permissions                |
| **404** | Not Found             | Resource doesn't exist                  |
| **409** | Conflict              | Duplicate resource (e.g., email exists) |
| **422** | Unprocessable Entity  | Valid JSON but business logic error     |
| **500** | Internal Server Error | Server-side exception                   |

### Error Middleware

Centralized error handler at the end of middleware stack:

```typescript
// apps/api/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', err);

  // Zod validation error
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  }

  // Custom AppError
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code || 'ERROR',
    });
  }

  // Unknown error
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
```

### Throwing Errors in Routes

```typescript
// Custom error class
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

// Usage in route
router.get('/:id', async (req, res, next) => {
  try {
    const node = await db.getNode(req.params.id);

    if (!node) {
      throw new AppError(404, 'NODE_NOT_FOUND', 'Node not found');
    }

    if (node.account_id !== req.user.accountId) {
      throw new AppError(403, 'ACCESS_DENIED', 'Access denied');
    }

    res.json({ success: true, node });
  } catch (error) {
    next(error); // Pass to error middleware
  }
});
```

---

## Middleware Stack

### Request Flow

Every request goes through this middleware chain:

```
1. CORS              → Allow cross-origin requests
2. Helmet            → Security headers
3. Body Parser       → Parse JSON/form-data
4. Auth              → Verify JWT token
5. Permission        → Check RBAC level
6. Isolation         → Set account filter
7. Route Handler     → Execute business logic
8. Error Handler     → Catch exceptions
```

### Middleware Registration

```typescript
// apps/api/src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requireAuth, requirePermission, isolateByAccount } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import nodesRoutes from './routes/nodes';
import authRoutes from './routes/auth';

const app = express();

// 1. Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

// 2. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Public routes (no auth)
app.use('/api/v1/auth', authRoutes);

// 4. Protected routes (auth required)
app.use('/api/v1/nodes', requireAuth(authService), isolateByAccount, nodesRoutes);

// 5. Error handler (must be last)
app.use(errorHandler);

app.listen(4001);
```

### Auth Middleware

Verifies JWT and attaches user to request:

```typescript
// apps/api/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export function requireAuth(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Missing authorization token',
        });
      }

      const token = authHeader.substring(7);

      // Verify token
      const payload = await authService.verifyToken(token);

      // Attach user to request
      req.user = {
        userId: payload.userId,
        accountId: payload.accountId,
        email: payload.email,
        permissionLevel: payload.permissionLevel,
        accountType: payload.accountType,
        accountClass: payload.accountClass,
      };

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
  };
}
```

### Permission Middleware

Checks RBAC permission level:

```typescript
export function requirePermission(level: 'junior' | 'senior' | 'leader' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const hierarchy = { junior: 1, senior: 2, leader: 3, admin: 4 };

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (hierarchy[req.user.permissionLevel] < hierarchy[level]) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          required: level,
          current: req.user.permissionLevel,
        },
      });
    }

    next();
  };
}

// Usage
router.post(
  '/nodes/source',
  requireAuth(authService),
  requirePermission('senior'), // Only senior+ can create
  async (req, res) => {
    // Create source node
  }
);
```

### Isolation Middleware

Enforces multi-tenant data isolation:

```typescript
export function isolateByAccount(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  // Admin accounts can see all data
  if (req.user.accountType === 'admin') {
    req.accountFilter = null;
  } else {
    // Client accounts only see their own data
    req.accountFilter = req.user.accountId;
  }

  next();
}

// Usage in route
router.get('/', async (req, res) => {
  const db = global.dbClient;

  let query = 'SELECT * FROM nodes WHERE 1=1';
  const params: any[] = [];

  // Apply account filter
  if (req.accountFilter) {
    query += ' AND account_id = ?';
    params.push(req.accountFilter);
  }

  const result = await db.execute(query, params);
  res.json({ success: true, nodes: result.records });
});
```

---

## Authentication & Authorization

See [Authentication Guide](AUTHENTICATION.md) for complete details.

### Quick Reference

**Authentication**: Who are you?

- JWT tokens (7-day expiration)
- Database-backed sessions (revocable)
- bcrypt password hashing (10 rounds)

**Authorization**: What can you do?

- 4 permission levels: junior, senior, leader, admin
- 2 account types: admin (system), client (tenant)
- Multi-tenant isolation (account_id filter)

**Middleware**:

```typescript
// Require authentication
app.use(requireAuth(authService));

// Require permission level
app.use(requirePermission('senior'));

// Enforce account isolation
app.use(isolateByAccount);
```

---

## Validation

### Zod Schemas

All input validation uses Zod:

```typescript
// packages/types/src/nodes.ts
import { z } from 'zod';

export const SourceNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('Source'),
  fingerprint: z.string().length(64), // SHA-256 hash
  mime_type: z.string(),
  size_bytes: z.number().int().positive(),
  title: z.string().min(1).max(500),
  url: z.string().url().optional(),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
});

export type SourceNode = z.infer<typeof SourceNodeSchema>;
```

### Validation Middleware

```typescript
// apps/api/src/middleware/validation.middleware.ts
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      });
    }
  };
}

// Usage
router.post(
  '/nodes/source',
  requireAuth(authService),
  requirePermission('senior'),
  validateBody(SourceNodeSchema),
  async (req, res) => {
    // req.body is now validated
    await db.createNode(req.body);
    res.json({ success: true, node: req.body });
  }
);
```

---

## Performance & Caching

### Query Optimization

**Pagination**:

```typescript
// Always limit results
const limit = Math.min(req.query.limit || 100, 1000);
const offset = req.query.offset || 0;

const result = await db.execute('SELECT * FROM nodes LIMIT ? OFFSET ?', [limit, offset]);
```

**Indexed Filters**:

```typescript
// Use indexed columns first
const query = `
  SELECT * FROM nodes
  WHERE account_id = ?    -- Indexed (most selective)
    AND kind = ?          -- Indexed
    AND board_id = ?      -- Indexed
  ORDER BY created_at DESC
  LIMIT ?
`;
```

**Batch Operations**:

```typescript
// Wrap in transaction for speed
await db.createNodesBatch(nodes); // Single commit
```

### Caching (Future)

**Redis for hot data**:

```typescript
// Check cache first
let node = await redis.get(`node:${id}`);

if (!node) {
  // Cache miss - query database
  node = await db.getNode(id);
  await redis.setex(`node:${id}`, 3600, JSON.stringify(node));
}

return node;
```

**Cache Invalidation**:

```typescript
// On update/delete
await db.updateNode(id, updates);
await redis.del(`node:${id}`); // Invalidate cache
```

---

## Best Practices

### Route Organization

1. **Group related endpoints**: Keep related operations in same file
2. **Use sub-routers**: Break large routers into smaller modules
3. **Consistent naming**: Use plural nouns (`/nodes`, not `/node`)

### Error Handling

1. **Always use try/catch**: Wrap route logic in try/catch
2. **Pass errors to middleware**: Use `next(error)` for centralized handling
3. **Log with context**: Include request ID, user ID, timestamp

### Performance

1. **Limit result sets**: Always add LIMIT to queries
2. **Use indexes**: Query by indexed columns (account_id, kind, created_at)
3. **Batch operations**: Single transaction for multiple inserts
4. **Validate early**: Reject invalid input before database query

### Security

1. **Validate all input**: Use Zod schemas at API boundary
2. **Parameterized queries**: Never concatenate user input into SQL
3. **Account isolation**: Always filter by account_id (except admin)
4. **Rate limiting**: Prevent abuse (future)

---

## Related Documentation

- [System Overview](OVERVIEW.md) - High-level architecture
- [Database Architecture](DATABASE.md) - Database design and patterns
- [Authentication](AUTHENTICATION.md) - Auth system deep dive
- [Quick Start](../getting-started/QUICK_START.md) - Get running in 5 minutes

---

**Last Updated**: 2025-10-15
**Related Docs**: [Overview](OVERVIEW.md) | [Database](DATABASE.md) | [Authentication](AUTHENTICATION.md)
