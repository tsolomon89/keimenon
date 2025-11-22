/**
 * ChangeTracker - Tracks entity modifications for rollback/compensation
 *
 * Purpose:
 * - Record all database mutations during job execution
 * - Enable rollback of partial operations on failure
 * - Support compensation patterns for failed jobs
 *
 * Architecture:
 * - Stored in job.state_data.changeTracker (persisted)
 * - Updated incrementally during job execution
 * - Checkpointed every N batches to reduce write overhead
 * - Used by CompensateJob to reverse failed operations
 *
 * Related: Product Directive - "No orphaned data from failed imports"
 */

/**
 * Tracks changes made during job execution for potential rollback
 */
export interface ChangeTracker {
  /**
   * Node IDs created during this job
   * Used to delete created nodes on rollback
   */
  nodesCreated: string[];

  /**
   * Edge IDs created during this job
   * Used to delete created edges on rollback
   */
  edgesCreated: string[];

  /**
   * Node IDs deleted during this job
   * Future: Could restore from backup/shadow table
   */
  nodesDeleted: string[];

  /**
   * Edge IDs deleted during this job
   * Future: Could restore from backup/shadow table
   */
  edgesDeleted: string[];

  /**
   * Timestamp of last checkpoint save
   * Used to determine if checkpoint needs updating
   */
  checkpointAt: number;

  /**
   * Number of entities tracked since last checkpoint
   * Used for progressive checkpointing (save every N entities)
   */
  changesSinceCheckpoint: number;
}

/**
 * Create an empty ChangeTracker
 */
export function createChangeTracker(): ChangeTracker {
  return {
    nodesCreated: [],
    edgesCreated: [],
    nodesDeleted: [],
    edgesDeleted: [],
    checkpointAt: Date.now(),
    changesSinceCheckpoint: 0,
  };
}

/**
 * Add created node IDs to tracker
 */
export function trackNodesCreated(tracker: ChangeTracker, nodeIds: string[]): ChangeTracker {
  return {
    ...tracker,
    nodesCreated: [...tracker.nodesCreated, ...nodeIds],
    changesSinceCheckpoint: tracker.changesSinceCheckpoint + nodeIds.length,
  };
}

/**
 * Add created edge IDs to tracker
 */
export function trackEdgesCreated(tracker: ChangeTracker, edgeIds: string[]): ChangeTracker {
  return {
    ...tracker,
    edgesCreated: [...tracker.edgesCreated, ...edgeIds],
    changesSinceCheckpoint: tracker.changesSinceCheckpoint + edgeIds.length,
  };
}

/**
 * Add deleted node IDs to tracker
 */
export function trackNodesDeleted(tracker: ChangeTracker, nodeIds: string[]): ChangeTracker {
  return {
    ...tracker,
    nodesDeleted: [...tracker.nodesDeleted, ...nodeIds],
    changesSinceCheckpoint: tracker.changesSinceCheckpoint + nodeIds.length,
  };
}

/**
 * Add deleted edge IDs to tracker
 */
export function trackEdgesDeleted(tracker: ChangeTracker, edgeIds: string[]): ChangeTracker {
  return {
    ...tracker,
    edgesDeleted: [...tracker.edgesDeleted, ...edgeIds],
    changesSinceCheckpoint: tracker.changesSinceCheckpoint + edgeIds.length,
  };
}

/**
 * Mark checkpoint saved (reset changesSinceCheckpoint counter)
 */
export function markCheckpointSaved(tracker: ChangeTracker): ChangeTracker {
  return {
    ...tracker,
    checkpointAt: Date.now(),
    changesSinceCheckpoint: 0,
  };
}

/**
 * Check if checkpoint should be saved based on threshold
 * @param tracker Current change tracker
 * @param threshold Number of changes before checkpoint (default: 500)
 * @returns true if checkpoint should be saved
 */
export function shouldCheckpoint(tracker: ChangeTracker, threshold: number = 500): boolean {
  return tracker.changesSinceCheckpoint >= threshold;
}

/**
 * Get total entities tracked
 */
export function getTotalChanges(tracker: ChangeTracker): number {
  return (
    tracker.nodesCreated.length +
    tracker.edgesCreated.length +
    tracker.nodesDeleted.length +
    tracker.edgesDeleted.length
  );
}

/**
 * Serialize ChangeTracker for storage in state_data
 */
export function serializeChangeTracker(tracker: ChangeTracker): Record<string, unknown> {
  return {
    nodesCreated: tracker.nodesCreated,
    edgesCreated: tracker.edgesCreated,
    nodesDeleted: tracker.nodesDeleted,
    edgesDeleted: tracker.edgesDeleted,
    checkpointAt: tracker.checkpointAt,
    changesSinceCheckpoint: tracker.changesSinceCheckpoint,
  };
}

/**
 * Deserialize ChangeTracker from state_data
 */
export function deserializeChangeTracker(data: any): ChangeTracker {
  return {
    nodesCreated: Array.isArray(data.nodesCreated) ? data.nodesCreated : [],
    edgesCreated: Array.isArray(data.edgesCreated) ? data.edgesCreated : [],
    nodesDeleted: Array.isArray(data.nodesDeleted) ? data.nodesDeleted : [],
    edgesDeleted: Array.isArray(data.edgesDeleted) ? data.edgesDeleted : [],
    checkpointAt: typeof data.checkpointAt === 'number' ? data.checkpointAt : Date.now(),
    changesSinceCheckpoint:
      typeof data.changesSinceCheckpoint === 'number' ? data.changesSinceCheckpoint : 0,
  };
}
