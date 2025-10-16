import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { AnyNode, AnyEdge } from '@canvas-memory/types';

export interface SQLiteConfig {
  databasePath: string;
  readonly?: boolean;
  verbose?: boolean;
}

// Embedded SQL schema - eliminates file path issues!
const SQLITE_SCHEMA = `
-- Auth Tables
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('admin', 'client')),
  account_class TEXT NOT NULL CHECK(account_class IN ('free', 'professional', 'business')),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('junior', 'senior', 'leader', 'admin')),
  user_class TEXT NOT NULL CHECK(user_class IN ('person', 'agent')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Graph Tables
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation', 'UserNode'
  )),
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE'
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Auth Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_class ON accounts(account_class);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Graph Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_created_by ON nodes(created_by);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_account_tag ON nodes(account_id, data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_created_by ON edges(created_by);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_to ON edges(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_edges_created ON edges(created_at);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);
CREATE INDEX IF NOT EXISTS idx_edges_account_tag ON edges(account_id, data_tag);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, content, content=nodes, content_rowid=rowid);

CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.properties);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
  UPDATE nodes_fts SET content = new.properties WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.rowid;
END;

CREATE TABLE IF NOT EXISTS schema_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('version', '2.1');
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('created_at', datetime('now'));
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('updated_at', datetime('now'));
INSERT OR REPLACE INTO schema_metadata (key, value) VALUES ('features', 'data_tag_support');
`;

/**
 * SQLite client for local-first graph storage
 * Provides same API as Neo4jClient for easy swapping
 */
export class SQLiteClient {
  private db: Database.Database | null = null;
  private config: SQLiteConfig;

  constructor(config: SQLiteConfig) {
    this.config = config;
  }

  /**
   * Connect and initialize database
   */
  async connect(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.databasePath);
      await fs.mkdir(dir, { recursive: true });

      // Open database
      this.db = new Database(this.config.databasePath, {
        readonly: this.config.readonly || false,
        verbose: this.config.verbose ? console.log : undefined,
      });

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Initialize schema
      await this.initializeSchema();

      console.log(`✅ Connected to SQLite at: ${this.config.databasePath}`);
    } catch (error) {
      console.error('❌ Failed to connect to SQLite:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Use embedded schema - no file I/O required!
      this.db.exec(SQLITE_SCHEMA);

      console.log('✅ SQLite schema initialized');
    } catch (error) {
      console.error('❌ Failed to initialize schema:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('👋 Disconnected from SQLite');
    }
  }

  /**
   * Close database (alias for disconnect)
   */
  async close(): Promise<void> {
    return this.disconnect();
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  /**
   * Create a node
   */
  async createNode(node: AnyNode): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodeData: any = node;
    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      node.id,
      node.kind,
      JSON.stringify(node),
      nodeData.account_id,
      nodeData.created_by,
      node.created_at,
      node.updated_at,
      nodeData.data_tag || 'real'
    );
  }

  /**
   * Create multiple nodes in a transaction
   */
  async createNodes(nodes: AnyNode[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const insert = this.db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((nodes: AnyNode[]) => {
      for (const node of nodes) {
        const nodeData: any = node;
        insert.run(
          node.id,
          node.kind,
          JSON.stringify(node),
          nodeData.account_id,
          nodeData.created_by,
          node.created_at,
          node.updated_at,
          nodeData.data_tag || 'real'
        );
      }
    });

    transaction(nodes);
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<AnyNode | null> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return JSON.parse(row.properties) as AnyNode;
  }

  /**
   * Get nodes by kind
   */
  async getNodesByKind(kind: string): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT properties FROM nodes WHERE kind = ?');
    const rows = stmt.all(kind) as any[];

    return rows.map((row) => JSON.parse(row.properties) as AnyNode);
  }

  /**
   * Update a node
   */
  async updateNode(id: string, node: Partial<AnyNode>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Get existing node
    const existing = await this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    // Merge with updates
    const updated = { ...existing, ...node, updated_at: Date.now() };

    const stmt = this.db.prepare(`
      UPDATE nodes
      SET properties = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(updated), updated.updated_at, id);
  }

  /**
   * Delete a node
   */
  async deleteNode(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Create an edge
   */
  async createEdge(edge: AnyEdge): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const edgeData: any = edge;
    const stmt = this.db.prepare(`
      INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      edge.id,
      edge.kind,
      edge.from,
      edge.to,
      JSON.stringify(edge),
      edgeData.account_id,
      edgeData.created_by,
      edge.created_at,
      edgeData.data_tag || 'real'
    );
  }

  /**
   * Create multiple edges in a transaction
   */
  async createEdges(edges: AnyEdge[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const insert = this.db.prepare(`
      INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((edges: AnyEdge[]) => {
      for (const edge of edges) {
        const edgeData: any = edge;
        insert.run(
          edge.id,
          edge.kind,
          edge.from,
          edge.to,
          JSON.stringify(edge),
          edgeData.account_id,
          edgeData.created_by,
          edge.created_at,
          edgeData.data_tag || 'real'
        );
      }
    });

    transaction(edges);
  }

  /**
   * Get edges for a node
   */
  async getNodeEdges(
    nodeId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<AnyEdge[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    let query = '';
    if (direction === 'outgoing') {
      query = 'SELECT properties FROM edges WHERE from_id = ?';
    } else if (direction === 'incoming') {
      query = 'SELECT properties FROM edges WHERE to_id = ?';
    } else {
      query = 'SELECT properties FROM edges WHERE from_id = ? OR to_id = ?';
    }

    const stmt = this.db.prepare(query);
    const rows =
      direction === 'both'
        ? (stmt.all(nodeId, nodeId) as any[])
        : (stmt.all(nodeId) as any[]);

    return rows.map((row) => JSON.parse(row.properties) as AnyEdge);
  }

  /**
   * Get edges by kind
   */
  async getEdgesByKind(kind: string): Promise<AnyEdge[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('SELECT properties FROM edges WHERE kind = ?');
    const rows = stmt.all(kind) as any[];

    return rows.map((row) => JSON.parse(row.properties) as AnyEdge);
  }

  /**
   * Delete an edge
   */
  async deleteEdge(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM edges WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Execute raw SQL query
   */
  async execute(query: string, params: any = {}): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Simple query execution (no Cypher translation for now)
    const stmt = this.db.prepare(query);

    // Check if query is SELECT
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      return { records: stmt.all(params) };
    } else {
      return { records: [stmt.run(params)] };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    nodes: number;
    edges: number;
    nodesByKind: Record<string, number>;
    edgesByKind: Record<string, number>;
  }> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodeCount = this.db
      .prepare('SELECT COUNT(*) as count FROM nodes')
      .get() as any;
    const edgeCount = this.db
      .prepare('SELECT COUNT(*) as count FROM edges')
      .get() as any;

    const nodesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind')
      .all() as any[];

    const edgesByKind = this.db
      .prepare('SELECT kind, COUNT(*) as count FROM edges GROUP BY kind')
      .all() as any[];

    return {
      nodes: nodeCount.count,
      edges: edgeCount.count,
      nodesByKind: Object.fromEntries(
        nodesByKind.map((row) => [row.kind, row.count])
      ),
      edgesByKind: Object.fromEntries(
        edgesByKind.map((row) => [row.kind, row.count])
      ),
    };
  }

  /**
   * Full-text search on node properties
   */
  async search(query: string, limit: number = 50): Promise<AnyNode[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare(`
      SELECT n.properties
      FROM nodes n
      JOIN nodes_fts fts ON n.rowid = fts.rowid
      WHERE nodes_fts MATCH ?
      LIMIT ?
    `);

    const rows = stmt.all(query, limit) as any[];
    return rows.map((row) => JSON.parse(row.properties) as AnyNode);
  }

  /**
   * Delete nodes by data_tag
   * Useful for cleaning up test data
   */
  async deleteNodesByTag(dataTag: 'test' | 'automated' | 'manual' | 'real'): Promise<number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('DELETE FROM nodes WHERE data_tag = ?');
    const result = stmt.run(dataTag);
    return result.changes;
  }

  /**
   * Get statistics by data_tag
   */
  async getStatsByTag(): Promise<Record<string, { nodes: number; edges: number }>> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const nodesByTag = this.db
      .prepare('SELECT data_tag, COUNT(*) as count FROM nodes GROUP BY data_tag')
      .all() as any[];

    const edgesByTag = this.db
      .prepare('SELECT data_tag, COUNT(*) as count FROM edges GROUP BY data_tag')
      .all() as any[];

    const stats: Record<string, { nodes: number; edges: number }> = {};

    // Initialize with all possible tags
    ['test', 'real', 'automated', 'manual'].forEach(tag => {
      stats[tag] = { nodes: 0, edges: 0 };
    });

    // Fill in actual counts
    nodesByTag.forEach((row) => {
      if (stats[row.data_tag]) {
        stats[row.data_tag].nodes = row.count;
      }
    });

    edgesByTag.forEach((row) => {
      if (stats[row.data_tag]) {
        stats[row.data_tag].edges = row.count;
      }
    });

    return stats;
  }

  /**
   * Update data_tag for nodes
   */
  async updateNodeTag(nodeIds: string[], dataTag: 'test' | 'automated' | 'manual' | 'real'): Promise<number> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const stmt = this.db.prepare('UPDATE nodes SET data_tag = ? WHERE id = ?');
    const transaction = this.db.transaction((ids: string[], tag: string) => {
      let updated = 0;
      for (const id of ids) {
        const result = stmt.run(tag, id);
        updated += result.changes;
      }
      return updated;
    });

    return transaction(nodeIds, dataTag);
  }
}
