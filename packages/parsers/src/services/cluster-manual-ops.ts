/**
 * Manual Cluster Operations
 *
 * Non-destructive merge/split operations with full audit trail.
 * Supports admin corrections to automatic clustering decisions.
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface ClusterMergeResult {
  new_cluster_id: string;
  merged_clusters: string[];
  total_members: number;
  operation_id: string;
}

export interface ClusterSplitResult {
  original_cluster_id: string;
  new_clusters: Array<{
    cluster_id: string;
    members: string[];
  }>;
  operation_id: string;
}

export interface ClusterOperation {
  operation_id: string;
  operation_type: 'merge' | 'split';
  performed_by: string;
  performed_at: number;
  affected_clusters: string[];
  result_clusters: string[];
  notes?: string;
  reversible: boolean;
}

export class ClusterManualOps {
  constructor(private db: Database.Database) {}

  /**
   * Merge multiple clusters into one
   * Non-destructive: old clusters marked superseded_by
   */
  mergeClusters(
    clusterIds: string[],
    performedBy: string,
    notes?: string
  ): ClusterMergeResult {
    if (clusterIds.length < 2) {
      throw new Error('Must provide at least 2 clusters to merge');
    }

    const now = Date.now();
    const operationId = `op_merge_${uuidv4()}`;

    // Get all clusters
    const clusters = clusterIds.map((id) => {
      const stmt = this.db.prepare('SELECT * FROM clusters WHERE cluster_id = ?');
      const cluster = stmt.get(id);
      if (!cluster) {
        throw new Error(`Cluster not found: ${id}`);
      }
      return cluster as any;
    });

    // Verify same level/modality
    const level = clusters[0].level;
    const modality = clusters[0].modality;

    for (const cluster of clusters) {
      if (cluster.level !== level || cluster.modality !== modality) {
        throw new Error('All clusters must have same level and modality');
      }
    }

    // Get all members from all clusters
    const allMembers: Array<{ node_id: string; similarity_score: number }> = [];

    for (const clusterId of clusterIds) {
      const stmt = this.db.prepare(`
        SELECT node_id, similarity_score
        FROM cluster_memberships
        WHERE cluster_id = ?
      `);
      const members = stmt.all(clusterId) as any[];
      allMembers.push(...members);
    }

    // Choose representative (node with lowest nodekey)
    const nodeKeys = allMembers.map((m) => {
      const stmt = this.db.prepare('SELECT node_key FROM node_spans WHERE node_id = ? LIMIT 1');
      const row = stmt.get(m.node_id) as any;
      return { node_id: m.node_id, node_key: row?.node_key || '' };
    });

    nodeKeys.sort((a, b) => a.node_key.localeCompare(b.node_key));
    const representativeNode = nodeKeys[0].node_id;

    // Create new cluster
    const newClusterId = `cluster_merged_${representativeNode}`;

    const createStmt = this.db.prepare(`
      INSERT INTO clusters (
        cluster_id, level, modality, representative_node,
        member_count, algorithm, threshold, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'manual_merge', 0.0, ?, ?)
    `);

    createStmt.run(
      newClusterId,
      level,
      modality,
      representativeNode,
      allMembers.length,
      Math.floor(now / 1000),
      Math.floor(now / 1000)
    );

    // Add all members to new cluster
    const memberStmt = this.db.prepare(`
      INSERT INTO cluster_memberships (
        cluster_id, node_id, level, modality, similarity_score, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const member of allMembers) {
      memberStmt.run(
        newClusterId,
        member.node_id,
        level,
        modality,
        member.similarity_score,
        Math.floor(now / 1000)
      );
    }

    // Mark old clusters as superseded
    const supersededStmt = this.db.prepare(`
      UPDATE clusters
      SET metadata = json_set(
        COALESCE(metadata, '{}'),
        '$.superseded_by', ?
      )
      WHERE cluster_id = ?
    `);

    for (const clusterId of clusterIds) {
      supersededStmt.run(newClusterId, clusterId);
    }

    // Audit log
    this.logOperation({
      operation_id: operationId,
      operation_type: 'merge',
      performed_by: performedBy,
      performed_at: now,
      affected_clusters: clusterIds,
      result_clusters: [newClusterId],
      notes,
      reversible: true,
    });

    return {
      new_cluster_id: newClusterId,
      merged_clusters: clusterIds,
      total_members: allMembers.length,
      operation_id: operationId,
    };
  }

  /**
   * Split a cluster into multiple clusters
   * Non-destructive: original cluster marked superseded_by
   */
  splitCluster(
    clusterId: string,
    memberGroups: string[][],
    performedBy: string,
    notes?: string
  ): ClusterSplitResult {
    if (memberGroups.length < 2) {
      throw new Error('Must provide at least 2 member groups for split');
    }

    const now = Date.now();
    const operationId = `op_split_${uuidv4()}`;

    // Get original cluster
    const clusterStmt = this.db.prepare('SELECT * FROM clusters WHERE cluster_id = ?');
    const cluster = clusterStmt.get(clusterId) as any;

    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`);
    }

    // Verify all members exist and belong to cluster
    const allMemberIds = memberGroups.flat();
    const memberSet = new Set(allMemberIds);

    if (memberSet.size !== allMemberIds.length) {
      throw new Error('Duplicate node IDs in member groups');
    }

    const verifyStmt = this.db.prepare(`
      SELECT node_id FROM cluster_memberships
      WHERE cluster_id = ? AND node_id = ?
    `);

    for (const nodeId of allMemberIds) {
      const exists = verifyStmt.get(clusterId, nodeId);
      if (!exists) {
        throw new Error(`Node ${nodeId} not in cluster ${clusterId}`);
      }
    }

    // Create new clusters for each group
    const newClusters: Array<{ cluster_id: string; members: string[] }> = [];

    for (let i = 0; i < memberGroups.length; i++) {
      const members = memberGroups[i];

      // Choose representative (lowest nodekey)
      const nodeKeys = members.map((nodeId) => {
        const stmt = this.db.prepare('SELECT node_key FROM node_spans WHERE node_id = ? LIMIT 1');
        const row = stmt.get(nodeId) as any;
        return { node_id: nodeId, node_key: row?.node_key || '' };
      });

      nodeKeys.sort((a, b) => a.node_key.localeCompare(b.node_key));
      const representative = nodeKeys[0].node_id;

      const newClusterId = `cluster_split_${i}_${representative}`;

      // Create cluster
      const createStmt = this.db.prepare(`
        INSERT INTO clusters (
          cluster_id, level, modality, representative_node,
          member_count, algorithm, threshold, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'manual_split', 0.0, ?, ?)
      `);

      createStmt.run(
        newClusterId,
        cluster.level,
        cluster.modality,
        representative,
        members.length,
        Math.floor(now / 1000),
        Math.floor(now / 1000)
      );

      // Add members
      const memberStmt = this.db.prepare(`
        INSERT INTO cluster_memberships (
          cluster_id, node_id, level, modality, similarity_score, joined_at
        ) VALUES (?, ?, ?, ?, 0.5, ?)
      `);

      for (const nodeId of members) {
        memberStmt.run(
          newClusterId,
          nodeId,
          cluster.level,
          cluster.modality,
          Math.floor(now / 1000)
        );
      }

      newClusters.push({
        cluster_id: newClusterId,
        members,
      });
    }

    // Mark original cluster as superseded
    const supersededStmt = this.db.prepare(`
      UPDATE clusters
      SET metadata = json_set(
        COALESCE(metadata, '{}'),
        '$.superseded_by', ?
      )
      WHERE cluster_id = ?
    `);

    const newClusterIds = newClusters.map((c) => c.cluster_id);
    supersededStmt.run(JSON.stringify(newClusterIds), clusterId);

    // Audit log
    this.logOperation({
      operation_id: operationId,
      operation_type: 'split',
      performed_by: performedBy,
      performed_at: now,
      affected_clusters: [clusterId],
      result_clusters: newClusterIds,
      notes,
      reversible: true,
    });

    return {
      original_cluster_id: clusterId,
      new_clusters: newClusters,
      operation_id: operationId,
    };
  }

  /**
   * Log operation to audit trail
   */
  private logOperation(operation: ClusterOperation): void {
    const stmt = this.db.prepare(`
      INSERT INTO cluster_operations (
        operation_id, operation_type, performed_by, performed_at,
        affected_clusters, result_clusters, notes, reversible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      operation.operation_id,
      operation.operation_type,
      operation.performed_by,
      operation.performed_at,
      JSON.stringify(operation.affected_clusters),
      JSON.stringify(operation.result_clusters),
      operation.notes || null,
      operation.reversible ? 1 : 0
    );
  }

  /**
   * Get operation history for a cluster
   */
  getOperationHistory(clusterId: string): ClusterOperation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM cluster_operations
      WHERE json_array_length(affected_clusters) > 0
      AND EXISTS (
        SELECT 1 FROM json_each(affected_clusters)
        WHERE json_each.value = ?
      )
      OR EXISTS (
        SELECT 1 FROM json_each(result_clusters)
        WHERE json_each.value = ?
      )
      ORDER BY performed_at DESC
    `);

    const rows = stmt.all(clusterId, clusterId) as any[];

    return rows.map((row) => ({
      operation_id: row.operation_id,
      operation_type: row.operation_type,
      performed_by: row.performed_by,
      performed_at: row.performed_at,
      affected_clusters: JSON.parse(row.affected_clusters),
      result_clusters: JSON.parse(row.result_clusters),
      notes: row.notes,
      reversible: row.reversible === 1,
    }));
  }

  /**
   * Check if cluster has been superseded
   */
  isSuperseded(clusterId: string): { superseded: boolean; superseded_by?: string | string[] } {
    const stmt = this.db.prepare(`
      SELECT metadata FROM clusters WHERE cluster_id = ?
    `);

    const row = stmt.get(clusterId) as any;

    if (!row || !row.metadata) {
      return { superseded: false };
    }

    const metadata = JSON.parse(row.metadata);

    if (metadata.superseded_by) {
      return {
        superseded: true,
        superseded_by: metadata.superseded_by,
      };
    }

    return { superseded: false };
  }

  /**
   * Get current (non-superseded) cluster for a node
   */
  getCurrentCluster(nodeId: string, level: string, modality: string): string | null {
    const stmt = this.db.prepare(`
      SELECT c.cluster_id
      FROM cluster_memberships cm
      JOIN clusters c ON cm.cluster_id = c.cluster_id
      WHERE cm.node_id = ?
      AND cm.level = ?
      AND cm.modality = ?
      AND (c.metadata IS NULL OR json_extract(c.metadata, '$.superseded_by') IS NULL)
      LIMIT 1
    `);

    const row = stmt.get(nodeId, level, modality) as any;

    return row ? row.cluster_id : null;
  }
}

/**
 * Factory function
 */
export function createClusterManualOps(db: Database.Database): ClusterManualOps {
  return new ClusterManualOps(db);
}
