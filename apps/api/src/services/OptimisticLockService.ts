/**
 * OptimisticLockService
 *
 * Purpose: Implement version-based optimistic locking for concurrent edit detection in M:N user-account architecture.
 *
 * Optimistic locking allows multiple users to read data simultaneously, but detects conflicts when
 * two users try to update the same resource. This is crucial for:
 * 1. Multi-user collaboration
 * 2. Preventing data loss from overwriting changes
 * 3. Providing better UX than pessimistic locking
 *
 * Implementation:
 * - Version column on nodes and edges tables (added in migration 014)
 * - Compare-and-swap semantics: update succeeds only if version matches
 * - Return conflict error if version mismatch
 * - Client must fetch latest version and retry
 */

import { SQLiteClient } from '@keimenon/db';

export interface OptimisticLockError extends Error {
  name: 'OptimisticLockError';
  resourceType: 'node' | 'edge';
  resourceId: string;
  expectedVersion: number;
  actualVersion: number;
  lastModifiedBy?: string;
}

export interface LockResult {
  success: boolean;
  newVersion?: number;
  error?: OptimisticLockError;
}

export interface ResourceVersion {
  id: string;
  version: number;
  lastModifiedBy?: string;
  updatedAt: number;
}

/**
 * Service for managing optimistic locks on nodes and edges
 */
export class OptimisticLockService {
  constructor(private db: SQLiteClient) {}

  /**
   * Update a node with optimistic lock check
   *
   * @param nodeId - ID of the node to update
   * @param expectedVersion - Expected version number (from client's cached data)
   * @param updates - Object with properties to update
   * @param userId - ID of user making the update
   * @returns LockResult indicating success or conflict
   */
  async updateNodeWithLock(
    nodeId: string,
    expectedVersion: number,
    updates: { properties?: string; [key: string]: any },
    userId: string
  ): Promise<LockResult> {
    const database = this.db.getDatabase();

    // 1. Get current version
    const current = database
      .prepare('SELECT version, last_modified_by, updated_at FROM nodes WHERE id = ?')
      .get(nodeId) as ResourceVersion | undefined;

    if (!current) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // 2. Check version match
    if (current.version !== expectedVersion) {
      const error: OptimisticLockError = {
        name: 'OptimisticLockError',
        message: `Optimistic lock conflict on node ${nodeId}. Expected version ${expectedVersion}, but current version is ${current.version}.`,
        resourceType: 'node',
        resourceId: nodeId,
        expectedVersion,
        actualVersion: current.version,
        lastModifiedBy: current.lastModifiedBy,
      };
      return { success: false, error };
    }

    // 3. Perform update with version increment (atomic)
    const newVersion = current.version + 1;
    const now = Date.now();

    // Build UPDATE query dynamically based on provided updates
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.properties !== undefined) {
      updateFields.push('properties = ?');
      updateValues.push(updates.properties);
    }

    // Add standard fields
    updateFields.push('version = ?');
    updateFields.push('last_modified_by = ?');
    updateFields.push('updated_at = ?');

    updateValues.push(newVersion, userId, now);

    // Add WHERE clause values
    updateValues.push(nodeId, expectedVersion);

    const query = `
      UPDATE nodes
      SET ${updateFields.join(', ')}
      WHERE id = ? AND version = ?
    `;

    const result = database.prepare(query).run(...updateValues);

    // 4. Check if update succeeded
    if (result.changes === 0) {
      // This shouldn't happen if we checked version correctly above,
      // but could occur in race condition
      const error: OptimisticLockError = {
        name: 'OptimisticLockError',
        message: `Optimistic lock conflict on node ${nodeId}. Version changed during update.`,
        resourceType: 'node',
        resourceId: nodeId,
        expectedVersion,
        actualVersion: current.version,
      };
      return { success: false, error };
    }

    console.log(
      `🔒 Successfully updated node ${nodeId} from version ${expectedVersion} to ${newVersion}`
    );

    return { success: true, newVersion };
  }

  /**
   * Update an edge with optimistic lock check
   *
   * @param edgeId - ID of the edge to update
   * @param expectedVersion - Expected version number
   * @param updates - Object with properties to update
   * @param userId - ID of user making the update
   * @returns LockResult indicating success or conflict
   */
  async updateEdgeWithLock(
    edgeId: string,
    expectedVersion: number,
    updates: { properties?: string; [key: string]: any },
    userId: string
  ): Promise<LockResult> {
    const database = this.db.getDatabase();

    // 1. Get current version
    const current = database
      .prepare('SELECT version, last_modified_by, updated_at FROM edges WHERE id = ?')
      .get(edgeId) as ResourceVersion | undefined;

    if (!current) {
      throw new Error(`Edge ${edgeId} not found`);
    }

    // 2. Check version match
    if (current.version !== expectedVersion) {
      const error: OptimisticLockError = {
        name: 'OptimisticLockError',
        message: `Optimistic lock conflict on edge ${edgeId}. Expected version ${expectedVersion}, but current version is ${current.version}.`,
        resourceType: 'edge',
        resourceId: edgeId,
        expectedVersion,
        actualVersion: current.version,
        lastModifiedBy: current.lastModifiedBy,
      };
      return { success: false, error };
    }

    // 3. Perform update with version increment (atomic)
    const newVersion = current.version + 1;
    const now = Date.now();

    // Build UPDATE query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.properties !== undefined) {
      updateFields.push('properties = ?');
      updateValues.push(updates.properties);
    }

    // Add standard fields
    updateFields.push('version = ?');
    updateFields.push('last_modified_by = ?');
    updateFields.push('updated_at = ?');

    updateValues.push(newVersion, userId, now);

    // Add WHERE clause values
    updateValues.push(edgeId, expectedVersion);

    const query = `
      UPDATE edges
      SET ${updateFields.join(', ')}
      WHERE id = ? AND version = ?
    `;

    const result = database.prepare(query).run(...updateValues);

    // 4. Check if update succeeded
    if (result.changes === 0) {
      const error: OptimisticLockError = {
        name: 'OptimisticLockError',
        message: `Optimistic lock conflict on edge ${edgeId}. Version changed during update.`,
        resourceType: 'edge',
        resourceId: edgeId,
        expectedVersion,
        actualVersion: current.version,
      };
      return { success: false, error };
    }

    console.log(
      `🔒 Successfully updated edge ${edgeId} from version ${expectedVersion} to ${newVersion}`
    );

    return { success: true, newVersion };
  }

  /**
   * Get current version of a node
   */
  getNodeVersion(nodeId: string): ResourceVersion | null {
    const database = this.db.getDatabase();

    const result = database
      .prepare('SELECT id, version, last_modified_by, updated_at FROM nodes WHERE id = ?')
      .get(nodeId) as ResourceVersion | undefined;

    return result || null;
  }

  /**
   * Get current version of an edge
   */
  getEdgeVersion(edgeId: string): ResourceVersion | null {
    const database = this.db.getDatabase();

    const result = database
      .prepare('SELECT id, version, last_modified_by, updated_at FROM edges WHERE id = ?')
      .get(edgeId) as ResourceVersion | undefined;

    return result || null;
  }

  /**
   * Acquire a lock on a resource (using the locks table from migration 013)
   *
   * This is used for longer operations where you need to hold a lock
   * beyond a single transaction.
   */
  async acquireLock(
    resourceType: 'node' | 'edge',
    resourceId: string,
    userId: string,
    expiresInMs: number = 30000 // 30 seconds default
  ): Promise<boolean> {
    const database = this.db.getDatabase();
    const now = Date.now();
    const expiresAt = now + expiresInMs;

    try {
      database
        .prepare(
          `INSERT INTO locks (resource_type, resource_id, locked_by, locked_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(resourceType, resourceId, userId, now, expiresAt);

      console.log(
        `🔒 Acquired lock on ${resourceType} ${resourceId} by user ${userId} (expires in ${expiresInMs}ms)`
      );

      return true;
    } catch (error: any) {
      // Lock already exists (UNIQUE constraint violation)
      if (error.code === 'SQLITE_CONSTRAINT') {
        // Check if lock is expired
        const existingLock = database
          .prepare('SELECT * FROM locks WHERE resource_type = ? AND resource_id = ?')
          .get(resourceType, resourceId) as any;

        if (existingLock && existingLock.expires_at < now) {
          // Lock expired - delete it and retry
          database
            .prepare('DELETE FROM locks WHERE resource_type = ? AND resource_id = ?')
            .run(resourceType, resourceId);

          // Retry acquisition
          return this.acquireLock(resourceType, resourceId, userId, expiresInMs);
        }

        console.log(
          `❌ Lock on ${resourceType} ${resourceId} is held by user ${existingLock?.locked_by}`
        );
        return false;
      }

      throw error;
    }
  }

  /**
   * Release a lock on a resource
   */
  async releaseLock(
    resourceType: 'node' | 'edge',
    resourceId: string,
    userId: string
  ): Promise<boolean> {
    const database = this.db.getDatabase();

    const result = database
      .prepare(
        `DELETE FROM locks
         WHERE resource_type = ? AND resource_id = ? AND locked_by = ?`
      )
      .run(resourceType, resourceId, userId);

    if (result.changes > 0) {
      console.log(`🔓 Released lock on ${resourceType} ${resourceId} by user ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Check if a resource is locked
   */
  isLocked(resourceType: 'node' | 'edge', resourceId: string): boolean {
    const database = this.db.getDatabase();
    const now = Date.now();

    const lock = database
      .prepare(
        `SELECT * FROM locks
         WHERE resource_type = ? AND resource_id = ? AND expires_at > ?`
      )
      .get(resourceType, resourceId, now) as any;

    return !!lock;
  }

  /**
   * Clean up expired locks
   */
  cleanupExpiredLocks(): number {
    const database = this.db.getDatabase();
    const now = Date.now();

    const result = database.prepare('DELETE FROM locks WHERE expires_at < ?').run(now);

    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} expired locks`);
    }

    return result.changes;
  }
}

// Singleton instance
let instance: OptimisticLockService | null = null;

/**
 * Get the singleton OptimisticLockService instance
 */
export function getOptimisticLockService(db: SQLiteClient): OptimisticLockService {
  if (!instance) {
    instance = new OptimisticLockService(db);

    // Set up periodic cleanup of expired locks (every 5 minutes)
    setInterval(
      () => {
        instance?.cleanupExpiredLocks();
      },
      5 * 60 * 1000
    );
  }
  return instance;
}
