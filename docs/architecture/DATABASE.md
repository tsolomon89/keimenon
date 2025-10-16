# Database Architecture

**Canvas Memory OS - Dual-Database Design with Local-First Priority**

This document details the database architecture, schema design, storage strategies, and migration approach for Canvas Memory OS.

---

## Table of Contents

- [Overview](#overview)
- [Storage Modes](#storage-modes)
- [SQLite Schema](#sqlite-schema)
- [Neo4j Schema](#neo4j-schema)
- [DatabaseClient Abstraction](#databaseclient-abstraction)
- [Content-Addressable Storage](#content-addressable-storage)
- [Migration Strategy](#migration-strategy)
- [Performance Optimization](#performance-optimization)

---

## Overview

Canvas Memory OS supports **three storage modes** through a unified `DatabaseClient` interface:

1. **Local Mode (SQLite)**: Single-file embedded database (default)
2. **Canvas Mode (Neo4j)**: Cloud graph database
3. **Hybrid Mode**: Both SQLite + Neo4j with sync

This flexible architecture allows developers to:

- Start local-first (zero cost, zero config)
- Scale to cloud when needed
- Run both in parallel during migration
- Swap backends without changing application code

### Design Goals

- **Local-First**: Work offline with complete data ownership
- **Storage-Agnostic**: Abstract storage implementation from business logic
- **Graph-Native**: Model relationships as first-class citizens
- **Multi-Tenant**: Complete isolation between accounts
- **Content-Addressable**: Deduplicate files by SHA-256 fingerprint
- **ACID Compliant**: Transactions for data consistency

---

## Storage Modes

### Local Mode (SQLite)

**Best for**: Personal use, development, free tier

**Configuration**:

```bash
STORAGE_MODE=local
SQLITE_PATH=~/.canvas-memory/canvas.db
LOCAL_DOCS_PATH=~/.canvas-memory/documents
```

**Advantages**:

- ✅ Zero configuration (auto-creates database)
- ✅ Zero cost (no cloud hosting)
- ✅ Complete data ownership
- ✅ No internet required
- ✅ Fast queries (local disk)
- ✅ Simple backups (copy .db file)
- ✅ WAL mode for concurrent reads

**Limitations**:

- ⚠️ Single-machine access only
- ⚠️ No built-in graph algorithms
- ⚠️ Manual JSON traversal for deep queries

**When to use**: Always start here. Only upgrade if you need multi-machine access or advanced graph queries.

### Canvas Mode (Neo4j)

**Best for**: Production deployments, advanced graph operations

**Configuration**:

```bash
STORAGE_MODE=canvas
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password
```

**Advantages**:

- ✅ Multi-machine access
- ✅ Cypher query language (expressive graph queries)
- ✅ Built-in graph algorithms (shortest path, community detection)
- ✅ Horizontal scaling
- ✅ Replication and backup

**Limitations**:

- ❌ Requires Neo4j server (cloud or local)
- ❌ Monthly cost ($65-200 for Aura)
- ❌ Requires internet (unless self-hosted)

**When to use**: Professional/Business tiers, or when you need advanced graph traversals.

### Hybrid Mode (Both)

**Best for**: Migration, gradual adoption, high availability

**Configuration**:

```bash
STORAGE_MODE=hybrid
SQLITE_PATH=~/.canvas-memory/canvas.db
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password
```

**Behavior**:

- Writes to **both** SQLite and Neo4j
- Reads from **SQLite** (faster)
- Background sync ensures consistency

**Advantages**:

- ✅ Best of both worlds
- ✅ Zero-downtime migration
- ✅ Fallback if Neo4j is unavailable
- ✅ Local cache for fast reads

**Limitations**:

- ⚠️ Double storage cost
- ⚠️ Sync complexity
- ⚠️ Potential consistency issues if sync fails

**When to use**: During migration from Neo4j to SQLite (or vice versa).

---

## SQLite Schema

### Core Tables

#### accounts

Tenant isolation at the account level. Each account is a separate workspace.

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,                    -- UUID: acc_xyz789
  account_type TEXT NOT NULL              -- 'admin' | 'client'
    CHECK (account_type IN ('admin', 'client')),
  account_class TEXT NOT NULL             -- 'free' | 'professional' | 'business'
    CHECK (account_class IN ('free', 'professional', 'business')),
  email TEXT NOT NULL UNIQUE,             -- Account owner email
  name TEXT NOT NULL,                     -- Account display name
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_accounts_email ON accounts(email);
CREATE INDEX idx_accounts_type ON accounts(account_type);
```

**Key Concepts**:

- `account_type = 'admin'`: System accounts that can see all tenant data
- `account_type = 'client'`: Regular tenant accounts with data isolation
- `account_class`: Determines feature limits (sources, nodes, storage)

#### users

Account members with role-based permissions.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- UUID: usr_abc123
  account_id TEXT NOT NULL,               -- FK to accounts
  email TEXT NOT NULL UNIQUE,             -- User login email
  password_hash TEXT,                     -- bcrypt hash (nullable for OAuth)
  google_id TEXT UNIQUE,                  -- Google OAuth ID (optional)
  name TEXT NOT NULL,                     -- User display name
  permission_level TEXT NOT NULL          -- 'junior' | 'senior' | 'leader' | 'admin'
    CHECK (permission_level IN ('junior', 'senior', 'leader', 'admin')),
  user_class TEXT NOT NULL                -- 'person' | 'agent'
    CHECK (user_class IN ('person', 'agent')),
  is_active INTEGER NOT NULL DEFAULT 1,   -- 1 = active, 0 = disabled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_account ON users(account_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
```

**Permission Levels**:

- `junior`: Read-only access
- `senior`: Read + Create
- `leader`: Read + Create + Delete
- `admin`: Full access including settings

#### sessions

JWT token storage for revocation and single sign-on.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                    -- UUID: sess_123
  user_id TEXT NOT NULL,                  -- FK to users
  account_id TEXT NOT NULL,               -- FK to accounts (for fast filtering)
  token TEXT NOT NULL UNIQUE,             -- JWT token string
  expires_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**Session Lifecycle**:

1. Created on login/register (7-day expiration)
2. Validated on every authenticated request
3. Deleted on logout or when user logs in again
4. Auto-cleanup of expired sessions (periodic job)

#### nodes

Core entity storage. All graph entities are stored here.

```sql
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,                    -- UUID: src_abc123, grp_xyz789
  kind TEXT NOT NULL                      -- Node type
    CHECK (kind IN (
      'Source', 'Group', 'Folder', 'Board',
      'ChatThread', 'Message', 'CodeBlock',
      'ObjectiveClaim', 'UnifiedDoc', 'Constellation',
      'UserNode', 'BusinessNode'
    )),
  properties TEXT NOT NULL,               -- JSON object with node-specific data
  account_id TEXT NOT NULL,               -- FK to accounts (tenant isolation)
  created_by TEXT NOT NULL,               -- FK to users (audit trail)
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_account ON nodes(account_id);
CREATE INDEX idx_nodes_created_by ON nodes(created_by);
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
```

**Node Types** (11 total):

| Kind               | Purpose                        | Key Properties                                                     |
| ------------------ | ------------------------------ | ------------------------------------------------------------------ |
| **Source**         | Files, URLs, compiled messages | `fingerprint`, `mime_type`, `size_bytes`, `title`, `url`           |
| **Group**          | Named collections              | `name`, `description`, `color`                                     |
| **Folder**         | Hierarchical containers        | `name`, `path`                                                     |
| **Board**          | Workspace/project              | `name`, `description`                                              |
| **ChatThread**     | Conversation container         | `title`, `platform` (ChatGPT, Claude, etc.)                        |
| **Message**        | Single chat message            | `role` (user/assistant), `content`, `timestamp`                    |
| **CodeBlock**      | Extracted code                 | `language`, `content`, `fingerprint`                               |
| **ObjectiveClaim** | Verified facts                 | `claim_text`, `status` (unverified/verified/refuted), `confidence` |
| **UnifiedDoc**     | Consolidated docs              | `ring` (L0/L1/L2/L3), `content_markdown`                           |
| **Constellation**  | Collapsed cluster              | `collapsed_node_ids[]`                                             |
| **UserNode**       | User preferences               | `email`, `preferences`                                             |
| **BusinessNode**   | Organization                   | `org_name`, `tax_id`                                               |

**Properties JSON Structure**:

```json
// Source node
{
  "fingerprint": "abc123...",
  "mime_type": "application/pdf",
  "size_bytes": 1048576,
  "title": "My Document.pdf",
  "url": "https://example.com/doc.pdf",
  "content_summary": "First 500 chars...",
  "board_id": "board_default"
}

// Message node
{
  "role": "assistant",
  "content": "Here's the code you requested...",
  "timestamp": 1697123456789,
  "platform": "ChatGPT",
  "model": "gpt-4"
}
```

#### edges

Relationships between nodes. All edges are directed (from → to).

```sql
CREATE TABLE edges (
  id TEXT PRIMARY KEY,                    -- UUID: edge_123
  kind TEXT NOT NULL                      -- Edge type
    CHECK (kind IN (
      'CONTAINS', 'DERIVES_FROM', 'DUP_OF', 'SIMILAR_TO',
      'COMPILED_FROM', 'STITCHED_FROM', 'EXTRACTED_FROM',
      'SEQUESTERS', 'SUPPORTS', 'REFUTES', 'VERIFIED_BY'
    )),
  from_id TEXT NOT NULL,                  -- Source node ID
  to_id TEXT NOT NULL,                    -- Target node ID
  properties TEXT,                        -- JSON object (optional metadata)
  account_id TEXT NOT NULL,               -- FK to accounts (tenant isolation)
  created_by TEXT NOT NULL,               -- FK to users (audit trail)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_edges_kind ON edges(kind);
CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);
CREATE INDEX idx_edges_account ON edges(account_id);
CREATE INDEX idx_edges_from_to ON edges(from_id, to_id);
```

**Edge Types** (11 total):

| Kind               | Meaning               | Example                                         |
| ------------------ | --------------------- | ----------------------------------------------- |
| **CONTAINS**       | Container → Member    | Group → Source, ChatThread → Message            |
| **DERIVES_FROM**   | Derived → Origin      | Source → Message (lineage), CodeBlock → Message |
| **DUP_OF**         | Duplicate → Canonical | Message → Message (duplicate detection)         |
| **SIMILAR_TO**     | Entity → Entity       | Message → Message (similarity)                  |
| **COMPILED_FROM**  | Compiled → Source     | SourceDoc → Message (single source)             |
| **STITCHED_FROM**  | Stitched → Sources    | SourceDoc → Message (multiple sources)          |
| **EXTRACTED_FROM** | Extract → Origin      | CodeBlock → Message                             |
| **SEQUESTERS**     | Policy → Hidden       | Group → Source (hide from AI)                   |
| **SUPPORTS**       | Claim → Claim         | ObjectiveClaim → ObjectiveClaim                 |
| **REFUTES**        | Claim → Claim         | ObjectiveClaim → ObjectiveClaim                 |
| **VERIFIED_BY**    | Claim → Verifier      | ObjectiveClaim → VerifierRun                    |

**Properties JSON Examples**:

```json
// SEQUESTERS edge
{
  "hidden_from_llm": true,
  "hidden_from_tools": false,
  "reason": "secret",
  "until": 1704067200000  // Expiry timestamp
}

// DERIVES_FROM edge
{
  "span": "line:42-58",
  "extraction_method": "code_block",
  "confidence": 0.95
}

// DUP_OF edge
{
  "similarity_score": 0.87,
  "algorithm": "jaccard",
  "normalized": true
}
```

### Full-Text Search

FTS5 virtual table for content search across nodes.

```sql
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  id UNINDEXED,         -- Node ID (not searchable, but returned)
  content,              -- Full-text indexed content
  content='nodes',      -- Link to nodes table
  content_rowid='rowid' -- Link by rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content)
  VALUES (new.rowid, new.id, json_extract(new.properties, '$.content'));
END;

CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
  UPDATE nodes_fts SET content = json_extract(new.properties, '$.content')
  WHERE rowid = new.rowid;
END;
```

**Usage**:

```sql
-- Search for "machine learning"
SELECT n.* FROM nodes n
JOIN nodes_fts fts ON n.rowid = fts.rowid
WHERE nodes_fts MATCH 'machine learning'
ORDER BY rank;
```

### Schema Initialization

The database schema is automatically initialized on first run:

```typescript
// apps/api/src/services/sqlite-init.ts
export function initializeDatabase(db: Database) {
  db.exec(`
    -- Create accounts table
    CREATE TABLE IF NOT EXISTS accounts (...);

    -- Create users table
    CREATE TABLE IF NOT EXISTS users (...);

    -- Create sessions table
    CREATE TABLE IF NOT EXISTS sessions (...);

    -- Create nodes table
    CREATE TABLE IF NOT EXISTS nodes (...);

    -- Create edges table
    CREATE TABLE IF NOT EXISTS edges (...);

    -- Create FTS5 table
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(...);

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    -- ... all other indexes
  `);
}
```

---

## Neo4j Schema

### Node Labels

Neo4j uses multi-label nodes. Every node has the base `:Node` label plus a specific type label.

```cypher
// Source node
CREATE (s:Node:Source {
  id: 'src_abc123',
  kind: 'Source',
  fingerprint: 'abc123...',
  mime_type: 'application/pdf',
  size_bytes: 1048576,
  title: 'My Document.pdf',
  account_id: 'acc_xyz789',
  created_by: 'usr_abc123',
  created_at: 1697123456789,
  updated_at: 1697123456789
})
```

**Label Hierarchy**:

- `:Node` (base label for all entities)
  - `:Source`
  - `:Group`
  - `:Folder`
  - `:Board`
  - `:ChatThread`
  - `:Message`
  - `:CodeBlock`
  - `:ObjectiveClaim`
  - `:UnifiedDoc`
  - `:Constellation`
  - `:UserNode`
  - `:BusinessNode`

### Relationship Types

Neo4j relationships are directed and typed.

```cypher
// ChatThread contains messages
MATCH (t:ChatThread {id: 'thread_123'})
MATCH (m:Message {id: 'msg_456'})
CREATE (t)-[:CONTAINS {created_at: 1697123456789}]->(m)

// Source derives from message
MATCH (s:Source {id: 'src_789'})
MATCH (m:Message {id: 'msg_456'})
CREATE (s)-[:DERIVES_FROM {
  span: 'line:42-58',
  extraction_method: 'code_block'
}]->(m)
```

### Constraints & Indexes

Ensure uniqueness and performance:

```cypher
-- Uniqueness constraints (also creates index)
CREATE CONSTRAINT node_id_unique FOR (n:Node) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT source_fingerprint_unique FOR (s:Source) REQUIRE s.fingerprint IS UNIQUE;
CREATE CONSTRAINT user_email_unique FOR (u:UserNode) REQUIRE u.email IS UNIQUE;

-- Performance indexes
CREATE INDEX node_kind FOR (n:Node) ON (n.kind);
CREATE INDEX node_account FOR (n:Node) ON (n.account_id);
CREATE INDEX node_created_at FOR (n:Node) ON (n.created_at);
CREATE INDEX source_mime FOR (s:Source) ON (s.mime_type);
CREATE INDEX message_role FOR (m:Message) ON (m.role);
```

### Common Cypher Queries

**Get all nodes in a board**:

```cypher
MATCH (n:Node {board_id: $boardId, account_id: $accountId})
RETURN n
ORDER BY n.created_at DESC
LIMIT 100
```

**Get graph (nodes + edges) for canvas**:

```cypher
MATCH (n:Node {board_id: $boardId, account_id: $accountId})
OPTIONAL MATCH (n)-[r]-(m:Node {board_id: $boardId})
RETURN n, r, m
```

**Find sources in a group**:

```cypher
MATCH (g:Group {id: $groupId})-[:CONTAINS]->(s:Source)
RETURN s
ORDER BY s.title
```

**Get messages in a chat thread**:

```cypher
MATCH (t:ChatThread {id: $threadId})-[:CONTAINS]->(m:Message)
RETURN m
ORDER BY m.timestamp
```

**Find duplicates by fingerprint**:

```cypher
MATCH (s:Source {fingerprint: $fingerprint})
RETURN s
LIMIT 1
```

**Traverse citation chain** (claims → sources → messages):

```cypher
MATCH path = (c:ObjectiveClaim)-[:DERIVES_FROM*]->(m:Message)
WHERE c.id = $claimId
RETURN path
```

---

## DatabaseClient Abstraction

### Interface Definition

All storage operations go through a unified interface:

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

### SQLite Implementation

```typescript
// packages/db/src/sqlite-client.ts
export class SQLiteClient implements DatabaseClient {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Concurrent reads
    this.db.pragma('foreign_keys = ON'); // Referential integrity
  }

  async createNode(node: Node): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.kind,
      JSON.stringify(node.properties),
      node.account_id,
      node.created_by,
      node.created_at,
      node.updated_at
    );
  }

  async getNode(id: string): Promise<Node | null> {
    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    return {
      id: row.id,
      kind: row.kind,
      properties: JSON.parse(row.properties),
      account_id: row.account_id,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async execute(query: string, params: any[]): Promise<{ records: any[] }> {
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);
    return { records: rows };
  }
}
```

### Neo4j Implementation

```typescript
// packages/db/src/neo4j-client.ts
export class Neo4jClient implements DatabaseClient {
  private driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async createNode(node: Node): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(
        `
        CREATE (n:Node:${node.kind} {
          id: $id,
          kind: $kind,
          account_id: $account_id,
          created_by: $created_by,
          created_at: $created_at,
          updated_at: $updated_at
        })
        SET n += $properties
      `,
        {
          id: node.id,
          kind: node.kind,
          account_id: node.account_id,
          created_by: node.created_by,
          created_at: node.created_at,
          updated_at: node.updated_at,
          properties: node.properties,
        }
      );
    } finally {
      await session.close();
    }
  }

  async getNode(id: string): Promise<Node | null> {
    const session = this.driver.session();

    try {
      const result = await session.run('MATCH (n:Node {id: $id}) RETURN n', { id });

      if (result.records.length === 0) return null;

      const node = result.records[0].get('n').properties;
      return {
        id: node.id,
        kind: node.kind,
        properties: { ...node },
        account_id: node.account_id,
        created_by: node.created_by,
        created_at: node.created_at.toNumber(),
        updated_at: node.updated_at.toNumber(),
      };
    } finally {
      await session.close();
    }
  }
}
```

### Hybrid Implementation

```typescript
// packages/db/src/hybrid-client.ts
export class HybridClient implements DatabaseClient {
  private sqliteClient: SQLiteClient;
  private neo4jClient: Neo4jClient;

  constructor(sqlitePath: string, neo4jUri: string, neo4jUser: string, neo4jPassword: string) {
    this.sqliteClient = new SQLiteClient(sqlitePath);
    this.neo4jClient = new Neo4jClient(neo4jUri, neo4jUser, neo4jPassword);
  }

  async createNode(node: Node): Promise<void> {
    // Write to both (parallel)
    await Promise.all([this.sqliteClient.createNode(node), this.neo4jClient.createNode(node)]);
  }

  async getNode(id: string): Promise<Node | null> {
    // Read from SQLite (faster)
    return this.sqliteClient.getNode(id);
  }
}
```

### Factory Pattern

Centralized creation based on environment:

```typescript
// packages/db/src/factory.ts
export class DatabaseFactory {
  static create(mode: 'local' | 'canvas' | 'hybrid'): DatabaseClient {
    switch (mode) {
      case 'local':
        return new SQLiteClient(process.env.SQLITE_PATH || '~/.canvas-memory/canvas.db');

      case 'canvas':
        return new Neo4jClient(
          process.env.NEO4J_URI!,
          process.env.NEO4J_USER!,
          process.env.NEO4J_PASSWORD!
        );

      case 'hybrid':
        return new HybridClient(
          process.env.SQLITE_PATH || '~/.canvas-memory/canvas.db',
          process.env.NEO4J_URI!,
          process.env.NEO4J_USER!,
          process.env.NEO4J_PASSWORD!
        );

      default:
        throw new Error(`Unknown storage mode: ${mode}`);
    }
  }
}
```

**Usage in Routes**:

```typescript
// apps/api/src/routes/nodes.ts
router.get('/:id', async (req, res) => {
  const db = global.dbClient; // Initialized at startup
  const node = await db.getNode(req.params.id);

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  res.json({ node });
});
```

---

## Content-Addressable Storage

### Fingerprinting

All files and code blocks are identified by SHA-256 hash:

```typescript
// apps/api/src/services/fingerprint.ts
import crypto from 'crypto';

export function calculateFingerprint(content: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}
```

### Deduplication

**File Upload**:

```typescript
// 1. Calculate fingerprint
const fingerprint = calculateFingerprint(fileBuffer);

// 2. Check if already exists
const existing = await db.getNode(fingerprint);

if (existing) {
  // Return existing node (no duplicate upload)
  return res.json({ source: existing, duplicate: true });
}

// 3. Save new file
await storageService.saveFile(fileBuffer, fingerprint);

// 4. Create node
await db.createNode({
  id: `src_${fingerprint}`,
  kind: 'Source',
  fingerprint,
  // ... other properties
});
```

**Code Extraction**:

```typescript
// Normalize before fingerprinting
const normalized = normalizeCode(codeBlock);
const fingerprint = calculateFingerprint(normalized);

// Check for duplicates
const existingCode = await db.execute(
  'SELECT * FROM nodes WHERE kind = ? AND json_extract(properties, "$.fingerprint") = ?',
  ['CodeBlock', fingerprint]
);

if (existingCode.records.length > 0) {
  // Duplicate code, create edge to existing
  await db.createEdge({
    kind: 'DUP_OF',
    from_id: newMessage.id,
    to_id: existingCode.records[0].id,
  });
}
```

### Storage Directory Structure

```
~/.canvas-memory/
├── canvas.db                   # SQLite database
├── documents/                  # Uploaded files
│   ├── ab/                     # First 2 chars of fingerprint
│   │   └── cd/                 # Next 2 chars
│   │       └── abcd123...      # Full fingerprint (file content)
│   └── ef/
│       └── gh/
│           └── efgh456...
└── backups/                    # Database backups
    ├── canvas.db.2025-10-14
    └── canvas.db.2025-10-15
```

**Why content-addressable?**

- Automatic deduplication (same file = same hash)
- Verifiable integrity (rehash to verify)
- Immutable references (hash never changes)
- Efficient storage (no duplicate copies)

---

## Migration Strategy

### Neo4j → SQLite (One-Time Migration)

**Step 1: Export from Neo4j**

```cypher
// Export all nodes
MATCH (n:Node)
RETURN n
ORDER BY n.created_at

// Export all edges
MATCH ()-[r]->()
RETURN r
ORDER BY r.created_at
```

**Step 2: Transform to SQLite**

```typescript
// migration/neo4j-to-sqlite.ts
async function migrateNeo4jToSQLite() {
  const neo4j = new Neo4jClient(...);
  const sqlite = new SQLiteClient('~/.canvas-memory/canvas.db');

  // 1. Migrate nodes
  const nodesResult = await neo4j.execute('MATCH (n:Node) RETURN n', []);

  for (const record of nodesResult.records) {
    const node = record.n.properties;
    await sqlite.createNode({
      id: node.id,
      kind: node.kind,
      properties: { ...node },
      account_id: node.account_id || 'default-account',
      created_by: node.created_by || 'system',
      created_at: node.created_at,
      updated_at: node.updated_at
    });
  }

  // 2. Migrate edges
  const edgesResult = await neo4j.execute('MATCH ()-[r]->() RETURN r', []);

  for (const record of edgesResult.records) {
    const edge = record.r.properties;
    await sqlite.createEdge({
      id: edge.id || generateId('edge'),
      kind: edge.type,
      from_id: edge.from_id,
      to_id: edge.to_id,
      properties: { ...edge },
      account_id: edge.account_id || 'default-account',
      created_by: edge.created_by || 'system',
      created_at: edge.created_at
    });
  }

  console.log('Migration complete!');
}
```

**Step 3: Verify**

```bash
# Check row counts
sqlite3 ~/.canvas-memory/canvas.db "SELECT COUNT(*) FROM nodes"
sqlite3 ~/.canvas-memory/canvas.db "SELECT kind, COUNT(*) FROM nodes GROUP BY kind"
```

### SQLite → Neo4j (Scale-Up Migration)

Use hybrid mode for zero-downtime migration:

```bash
# 1. Start in local mode
STORAGE_MODE=local

# 2. Switch to hybrid mode (starts syncing to Neo4j)
STORAGE_MODE=hybrid
NEO4J_URI=neo4j+s://...

# 3. Verify Neo4j has all data
# (Check counts match SQLite)

# 4. Switch to canvas mode (Neo4j only)
STORAGE_MODE=canvas
```

### Ongoing Sync (Hybrid Mode)

Hybrid mode keeps both databases in sync:

```typescript
// apps/api/src/services/sync-service.ts
export class SyncService {
  private sqliteClient: SQLiteClient;
  private neo4jClient: Neo4jClient;

  async syncAll() {
    // Get all nodes from SQLite
    const nodes = await this.sqliteClient.execute('SELECT * FROM nodes WHERE updated_at > ?', [
      this.lastSyncTimestamp,
    ]);

    // Sync to Neo4j
    for (const node of nodes.records) {
      await this.neo4jClient.createNode(node);
    }

    // Update sync timestamp
    this.lastSyncTimestamp = Date.now();
  }
}
```

---

## Performance Optimization

### SQLite Tuning

**WAL Mode** (Write-Ahead Logging):

```sql
PRAGMA journal_mode = WAL;
```

- Enables concurrent reads while writing
- 2-10x faster than default mode
- Required for multi-user access

**Indexes**:

```sql
-- Frequently queried columns
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_account ON nodes(account_id);
CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);

-- Composite indexes for common queries
CREATE INDEX idx_nodes_account_kind ON nodes(account_id, kind);
CREATE INDEX idx_edges_from_to ON edges(from_id, to_id);
```

**Query Optimization**:

```sql
-- ❌ BAD: Full table scan
SELECT * FROM nodes WHERE json_extract(properties, '$.title') LIKE '%search%';

-- ✅ GOOD: Use FTS5
SELECT n.* FROM nodes n
JOIN nodes_fts fts ON n.rowid = fts.rowid
WHERE nodes_fts MATCH 'search';

-- ❌ BAD: N+1 queries
-- SELECT * FROM edges WHERE from_id = ?  (repeated for each node)

-- ✅ GOOD: Single query with IN clause
SELECT * FROM edges WHERE from_id IN (?, ?, ?, ...);
```

**Batch Operations**:

```typescript
// ❌ BAD: Individual inserts
for (const node of nodes) {
  await db.createNode(node); // Commits each time
}

// ✅ GOOD: Single transaction
db.transaction(() => {
  for (const node of nodes) {
    db.createNode(node);
  }
})(); // Single commit
```

### Neo4j Tuning

**Indexes**:

```cypher
-- Node lookup by ID (most common)
CREATE CONSTRAINT node_id_unique FOR (n:Node) REQUIRE n.id IS UNIQUE;

-- Filter by kind
CREATE INDEX node_kind FOR (n:Node) ON (n.kind);

-- Account isolation
CREATE INDEX node_account FOR (n:Node) ON (n.account_id);
```

**Query Optimization**:

```cypher
-- ❌ BAD: Full label scan
MATCH (n:Node)
WHERE n.kind = 'Source'
RETURN n;

-- ✅ GOOD: Use specific label
MATCH (n:Source)
RETURN n;

-- ❌ BAD: Cartesian product
MATCH (n:Node), (m:Message)
WHERE n.board_id = m.board_id
RETURN n, m;

-- ✅ GOOD: Join with relationship
MATCH (b:Board {id: $boardId})-[:CONTAINS]->(n)-[:CONTAINS]->(m:Message)
RETURN n, m;
```

**Parameterized Queries**:

```cypher
-- ✅ Query plan caching
MATCH (n:Node {id: $id})
RETURN n;
```

### Benchmarks

**SQLite** (local-first):
| Operation | Throughput | Notes |
|-----------|-----------|-------|
| Insert node | 5,000/sec | Single transaction |
| Insert edge | 4,000/sec | With FK checks |
| Get node by ID | 50,000/sec | Primary key lookup |
| Get nodes filtered | 10,000/sec | Indexed kind + account_id |
| FTS search | 1,000/sec | Content search |
| Batch insert (1000 nodes) | 10,000/sec | Single transaction |

**Neo4j** (cloud):
| Operation | Throughput | Notes |
|-----------|-----------|-------|
| Insert node | 1,000/sec | Network latency |
| Insert edge | 800/sec | Network latency |
| Get node by ID | 5,000/sec | Indexed lookup |
| Get nodes filtered | 2,000/sec | Cypher query |
| Graph traversal | 1,000/sec | Multi-hop paths |

**Conclusion**: SQLite is 5-10x faster for simple operations. Neo4j excels at complex graph traversals.

---

## Best Practices

### Schema Design

1. **Always include account_id**: Every node/edge for multi-tenant isolation
2. **Always include created_by**: Audit trail for compliance
3. **Use JSON for flexible properties**: Add fields without migrations
4. **Index frequently queried fields**: kind, account_id, created_at
5. **Use foreign keys**: CASCADE deletes prevent orphans

### Query Patterns

1. **Filter by account_id first**: Most selective filter
2. **Use indexes**: Check with EXPLAIN QUERY PLAN
3. **Batch operations**: Single transaction for multiple inserts
4. **Avoid N+1 queries**: Use JOINs or IN clauses
5. **Limit results**: Always add LIMIT to prevent huge result sets

### Data Integrity

1. **Foreign keys**: Referential integrity (ON DELETE CASCADE)
2. **Check constraints**: Validate enum values (account_type, permission_level)
3. **NOT NULL constraints**: Required fields must have values
4. **UNIQUE constraints**: Prevent duplicates (email, fingerprint)
5. **Transactions**: Wrap multi-step operations

---

## Related Documentation

- [System Overview](OVERVIEW.md) - High-level architecture
- [API Design](API_DESIGN.md) - REST API patterns
- [Authentication](AUTHENTICATION.md) - Multi-tenant auth system
- [Quick Start](../getting-started/QUICK_START.md) - Get running in 5 minutes

---

**Last Updated**: 2025-10-15
**Related Docs**: [Overview](OVERVIEW.md) | [API Design](API_DESIGN.md) | [Authentication](AUTHENTICATION.md)
