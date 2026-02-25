import { SQLiteClient } from './sqlite/client';
import { AnyNode, AnyEdge } from '@keimenon/types';

/**
 * Storage modes
 * @deprecated Only 'local' is supported in the Desktop version
 */
export type StorageMode = 'local';

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
  getNodesByKind?(kind: string, options?: { limit?: number; offset?: number; accountId?: string }): Promise<AnyNode[]>;
  countNodesByKind?(kind: string, accountId?: string): Promise<number>;
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
}

/**
 * Database factory
 * Returns appropriate client based on storage mode
 */
export class DatabaseFactory {
  private static sqliteInstance: SQLiteClient | null = null;

  /**
   * Get database client for specified mode
   */
  static async getClient(config: DatabaseConfig): Promise<DatabaseClient> {
    // Force local mode
    return this.getSQLiteClient(config.local || { databasePath: ':memory:' });
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
   * Close all connections
   */
  static async closeAll(): Promise<void> {
    if (this.sqliteInstance) {
      await this.sqliteInstance.disconnect();
      this.sqliteInstance = null;
    }
  }
}

/**
 * Helper function for backward compatibility
 */
export async function getDatabaseClient(mode: StorageMode, config: any): Promise<DatabaseClient> {
  return DatabaseFactory.getClient({ mode: 'local', ...config });
}
