import { Neo4jClient } from './neo4j';
import { SQLiteClient } from './sqlite/client';
import { AnyNode, AnyEdge } from '@keimenon/types';

/**
 * Storage modes
 */
export type StorageMode = 'local' | 'keimenon' | 'hybrid';

/**
 * Unified database interface
 * Both SQLite and Neo4j clients implement this
 */
export interface DatabaseClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  close(): Promise<void>;

  createNode(node: AnyNode): Promise<void>;
  createNodes?(nodes: AnyNode[]): Promise<void>;
  getNode(id: string): Promise<AnyNode | null>;
  getNodesByKind?(kind: string): Promise<AnyNode[]>;
  updateNode?(id: string, node: Partial<AnyNode>): Promise<void>;
  deleteNode?(id: string): Promise<void>;

  createEdge(edge: AnyEdge): Promise<void>;
  createEdges?(edges: AnyEdge[]): Promise<void>;
  getNodeEdges?(nodeId: string, direction?: 'outgoing' | 'incoming' | 'both'): Promise<AnyEdge[]>;
  getEdgesByKind?(kind: string): Promise<AnyEdge[]>;
  deleteEdge?(id: string): Promise<void>;

  execute(query: string, params?: any): Promise<any>;
  getStats?(): Promise<any>;
  search?(query: string, limit?: number): Promise<AnyNode[]>;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  mode: StorageMode;

  // Local (SQLite) config
  local?: {
    databasePath: string;
    readonly?: boolean;
    verbose?: boolean;
  };

  // Keimenon (Neo4j) config
  keimenon?: {
    uri: string;
    user: string;
    password: string;
  };
}

/**
 * Database factory
 * Returns appropriate client based on storage mode
 */
export class DatabaseFactory {
  private static sqliteInstance: SQLiteClient | null = null;
  private static neo4jInstance: Neo4jClient | null = null;

  /**
   * Get database client for specified mode
   */
  static async getClient(config: DatabaseConfig): Promise<DatabaseClient> {
    switch (config.mode) {
      case 'local':
        return this.getSQLiteClient(config.local!);

      case 'keimenon':
        return this.getNeo4jClient(config.keimenon!) as any as DatabaseClient;

      case 'hybrid':
        // For hybrid mode, return SQLite as primary
        // Neo4j sync happens in background
        return this.getSQLiteClient(config.local!);

      default:
        throw new Error(`Unknown storage mode: ${config.mode}`);
    }
  }

  /**
   * Get SQLite client (singleton)
   */
  private static async getSQLiteClient(config: {
    databasePath: string;
    readonly?: boolean;
    verbose?: boolean;
  }): Promise<SQLiteClient> {
    if (!this.sqliteInstance) {
      this.sqliteInstance = new SQLiteClient(config);
      await this.sqliteInstance.connect();
      // Initialize schema automatically
      if (this.sqliteInstance.initializeSchema) {
        await this.sqliteInstance.initializeSchema();
      }
    }
    return this.sqliteInstance;
  }

  /**
   * Get Neo4j client (singleton)
   */
  private static async getNeo4jClient(config: {
    uri: string;
    user: string;
    password: string;
  }): Promise<Neo4jClient> {
    if (!this.neo4jInstance) {
      this.neo4jInstance = new Neo4jClient(config.uri, config.user, config.password);
      await this.neo4jInstance.connect();
    }
    return this.neo4jInstance;
  }

  /**
   * Close all connections
   */
  static async closeAll(): Promise<void> {
    if (this.sqliteInstance) {
      await this.sqliteInstance.disconnect();
      this.sqliteInstance = null;
    }

    if (this.neo4jInstance) {
      await this.neo4jInstance.disconnect();
      this.neo4jInstance = null;
    }
  }
}

/**
 * Helper function for backward compatibility
 */
export async function getDatabaseClient(mode: StorageMode, config: any): Promise<DatabaseClient> {
  return DatabaseFactory.getClient({ mode, ...config });
}
