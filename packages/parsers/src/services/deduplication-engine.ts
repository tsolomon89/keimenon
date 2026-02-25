/**
 * Deduplication Engine: Non-destructive canonicalization
 *
 * Contract:
 * - NEVER delete or merge nodes
 * - Create EXACT_DUP edges (many → one canonical)
 * - Populate canonical_map and canonical_stats
 * - Treat duplicates as evidence (frequency, diversity, recurrence)
 *
 * Two stable views:
 * - Instances view: every node (default for provenance)
 * - Unique view: canonicals with evidence stats (for overview)
 */

import Database from 'better-sqlite3';
import { NodeSignature } from './content-processor';
import { GroupingStorage } from './grouping-storage';

/**
 * Evidence weights configuration
 */
export interface EvidenceWeightsConfig {
  freq_weight: number; // log1p(instances_count)
  diversity_weight: number; // log1p(distinct_blobs)
  role_weight: number; // unique_roles / 3
  temporal_weight: number; // stability across time windows
  modality_weight: number; // bonus for cross-modality
}

const DEFAULT_WEIGHTS: EvidenceWeightsConfig = {
  freq_weight: 0.5,
  diversity_weight: 0.3,
  role_weight: 0.1,
  temporal_weight: 0.05,
  modality_weight: 0.05,
};

/**
 * Canonical stats with evidence weights
 */
export interface CanonicalStats {
  canonical_node_id: string;
  instances_count: number;
  distinct_blobs: number;
  distinct_roles: number;
  distinct_modalities: number;
  first_seen_at: number;
  last_seen_at: number;
  evidence_score: number;
  freq_weight: number;
  diversity_weight: number;
  role_weight: number;
  temporal_weight: number;
  modality_weight: number;
  updated_at: number;
}

/**
 * Instance with canonical reference
 */
export interface NodeInstance {
  node_id: string;
  canonical_node_id: string;
  is_duplicate: boolean;
  [key: string]: any;
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  exact_dups_found: number;
  canonicals_created: number;
  edges_created: number;
  stats_computed: number;
}

/**
 * Deduplication Engine
 */
export class DeduplicationEngine {
  private db: Database.Database;
  private storage: GroupingStorage;
  private weightsConfig: EvidenceWeightsConfig;

  constructor(
    db: Database.Database,
    storage: GroupingStorage,
    weightsConfig: EvidenceWeightsConfig = DEFAULT_WEIGHTS
  ) {
    this.db = db;
    this.storage = storage;
    this.weightsConfig = weightsConfig;
  }

  /**
   * Run full deduplication pipeline
   * 1. Find exact duplicates by content_id
   * 2. Pick canonical (smallest NodeKey)
   * 3. Create EXACT_DUP edges
   * 4. Populate canonical_map
   * 5. Compute canonical_stats with evidence weights
   *
  /**
   * Run full deduplication pipeline
   * 1. Find exact duplicates by content_id
   * 2. Pick canonical (smallest NodeKey)
   * 3. Create EXACT_DUP edges
   * 4. Populate canonical_map
   * 5. Compute canonical_stats with evidence weights
   *
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  async deduplicate(accountId: string): Promise<DeduplicationResult> {
    console.log('Starting non-destructive deduplication...');

    const result: DeduplicationResult = {
      exact_dups_found: 0,
      canonicals_created: 0,
      edges_created: 0,
      stats_computed: 0,
    };

    // Step 1: Find all content_id groups
    const contentIdGroups = this.findContentIdGroups(accountId);
    console.log(`Found ${contentIdGroups.length} content_id groups`);

    // Step 2: Process each group
    for (const group of contentIdGroups) {
      if (group.node_ids.length <= 1) continue; // No duplicates

      result.exact_dups_found += group.node_ids.length - 1;

      // Pick canonical: smallest NodeKey
      const canonical = this.pickCanonical(group.node_ids, accountId);
      result.canonicals_created++;

      // Create EXACT_DUP edges for all non-canonical nodes
      for (const nodeId of group.node_ids) {
        if (nodeId === canonical) continue;

        this.createExactDupEdge(nodeId, canonical, group.content_id);
        this.upsertCanonicalMap(nodeId, canonical);
        result.edges_created++;
      }

      // Compute canonical stats
      this.computeCanonicalStats(canonical, group.node_ids, accountId);
      result.stats_computed++;
    }

    console.log('Deduplication complete:', result);
    return result;
  }

  /**
   * Find groups of nodes with same content_id
   *
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  private findContentIdGroups(
    accountId: string
  ): Array<{ content_id: string; node_ids: string[] }> {
    const stmt = this.db.prepare(`
      SELECT content_id, GROUP_CONCAT(node_id) as node_ids, COUNT(*) as count
      FROM node_signatures
      WHERE content_id IS NOT NULL AND account_id = ?
      GROUP BY content_id
      HAVING count > 1
      ORDER BY count DESC
    `);
    const rows = stmt.all(accountId) as any[];

    return rows.map((row) => ({
      content_id: row.content_id,
      node_ids: row.node_ids.split(','),
    }));
  }

  /**
   * Pick canonical node: smallest NodeKey (deterministic)
   *
   * @param nodeIds - Array of node IDs to choose from
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  private pickCanonical(nodeIds: string[], accountId: string): string {
    // Get node_keys from node_spans
    const placeholders = nodeIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT DISTINCT node_id, node_key
      FROM node_spans
      WHERE node_id IN (${placeholders}) AND account_id = ?
      ORDER BY node_key ASC
      LIMIT 1
    `);
    const row = stmt.get(...nodeIds, accountId) as any;

    if (!row) {
      // Fallback: alphabetically smallest node_id
      return nodeIds.sort()[0];
    }

    return row.node_id;
  }

  /**
   * Create EXACT_DUP edge (non-destructive)
   */
  private createExactDupEdge(fromNodeId: string, toNodeId: string, contentId: string): void {
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO edges (
        id, from_node, to_node, kind, weight, metadata, created_at
      ) VALUES (?, ?, ?, 'EXACT_DUP', 1.0, ?, ?)
    `);

    const edgeId = `edge_${fromNodeId}_${toNodeId}_exactdup`;
    const metadata = JSON.stringify({
      canonical: toNodeId,
      content_id: contentId,
    });

    stmt.run(edgeId, fromNodeId, toNodeId, metadata, now);
  }

  /**
   * Upsert canonical_map entry
   */
  private upsertCanonicalMap(nodeId: string, canonicalNodeId: string): void {
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO canonical_map (
        node_id, canonical_node_id, kind, created_at
      ) VALUES (?, ?, 'EXACT_DUP', ?)
    `);

    stmt.run(nodeId, canonicalNodeId, now);
  }

// ... helper methods ...

  /**
   * Compute canonical_stats with evidence weights
   *
   * @param canonicalNodeId - Canonical node ID
   * @param allNodeIds - All node IDs in this canonical group
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  private computeCanonicalStats(
    canonicalNodeId: string,
    allNodeIds: string[],
    accountId: string
  ): void {
    const now = Math.floor(Date.now() / 1000);

    // Get instance metadata
    const placeholders = allNodeIds.map(() => '?').join(',');

    // Count distinct blobs (account-scoped)
    const blobStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT blob_hash) as count
      FROM node_spans
      WHERE node_id IN (${placeholders}) AND account_id = ?
    `);
    const blobRow = blobStmt.get(...allNodeIds, accountId) as any;

    // Count distinct modalities (account-scoped)
    const modalityStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT modality) as count
      FROM node_spans
      WHERE node_id IN (${placeholders}) AND account_id = ?
    `);
    const modalityRow = modalityStmt.get(...allNodeIds, accountId) as any;

    // Get time range (account-scoped)
    const timeStmt = this.db.prepare(`
      SELECT MIN(created_at) as first, MAX(created_at) as last
      FROM node_spans
      WHERE node_id IN (${placeholders}) AND account_id = ?
    `);
    const timeRow = timeStmt.get(...allNodeIds, accountId) as any;

    const distinctBlobs = blobRow?.count || 1;
    const distinctModalities = modalityRow?.count || 1;
    const firstSeenAt = timeRow?.first || now;
    const lastSeenAt = timeRow?.last || now;

    // Count distinct roles (schema doesn't have role column yet)
    // TODO(enhancement): Add role tracking to node_spans for better deduplication evidence
    const distinctRoles = 1;

    // Compute evidence weights
    const instancesCount = allNodeIds.length;
    const freqWeight = Math.log1p(instancesCount);
    const diversityWeight = Math.log1p(distinctBlobs);
    const roleWeight = distinctRoles / 3.0; // Max 3 roles: user, assistant, system
    const modalityWeight = Math.log1p(distinctModalities);

    // Temporal stability: how long content has been seen
    const timeSpanSeconds = lastSeenAt - firstSeenAt;
    const temporalWeight = Math.log1p(timeSpanSeconds / 86400); // Days

    // Total evidence score (weighted sum)
    const evidenceScore =
      this.weightsConfig.freq_weight * freqWeight +
      this.weightsConfig.diversity_weight * diversityWeight +
      this.weightsConfig.role_weight * roleWeight +
      this.weightsConfig.temporal_weight * temporalWeight +
      this.weightsConfig.modality_weight * modalityWeight;

    // Upsert canonical_stats
    const stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO canonical_stats (
        canonical_node_id, instances_count, distinct_blobs, distinct_roles,
        distinct_modalities, first_seen_at, last_seen_at, evidence_score,
        freq_weight, diversity_weight, role_weight, temporal_weight,
        modality_weight, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtInsert.run(
      canonicalNodeId,
      instancesCount,
      distinctBlobs,
      distinctRoles,
      distinctModalities,
      firstSeenAt,
      lastSeenAt,
      evidenceScore,
      freqWeight,
      diversityWeight,
      roleWeight,
      temporalWeight,
      modalityWeight,
      now
    );
  }

  /**
   * Refresh canonical stats for specific canonical node
   *
   * @param canonicalNodeId - Canonical node ID to refresh
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  async refreshCanonicalStats(canonicalNodeId: string, accountId: string): Promise<void> {
    // Get all instances for this canonical
    const stmt = this.db.prepare(`
      SELECT node_id FROM canonical_map WHERE canonical_node_id = ?
      UNION
      SELECT ? AS node_id
    `);

    const rows = stmt.all(canonicalNodeId, canonicalNodeId) as any[];
    const nodeIds = rows.map((r) => r.node_id);

    if (nodeIds.length > 0) {
      this.computeCanonicalStats(canonicalNodeId, nodeIds, accountId);
    }
  }

// ... getter methods ...

  /**
   * Get statistics
   *
   * @param accountId - Account ID for multi-tenant isolation (required)
   */
  getStats(accountId: string): {
    total_nodes: number;
    unique_nodes: number;
    duplicate_nodes: number;
    canonicals_with_dups: number;
    avg_instances_per_canonical: number;
  } {
    const totalStmt = this.db.prepare(
      'SELECT COUNT(DISTINCT node_id) as count FROM node_spans WHERE account_id = ?'
    );
    const totalRow = totalStmt.get(accountId) as any;

    const dupStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM canonical_map WHERE canonical_node_id IN (SELECT DISTINCT node_id FROM node_spans WHERE account_id = ?)'
    );
    const dupRow = dupStmt.get(accountId) as any;

    const canonStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM canonical_stats WHERE canonical_node_id IN (SELECT DISTINCT node_id FROM node_spans WHERE account_id = ?)'
    );
    const canonRow = canonStmt.get(accountId) as any;

    const avgStmt = this.db.prepare(
      'SELECT AVG(instances_count) as avg FROM canonical_stats WHERE canonical_node_id IN (SELECT DISTINCT node_id FROM node_spans WHERE account_id = ?)'
    );
    const avgRow = avgStmt.get(accountId) as any;

    const totalNodes = totalRow?.count || 0;
    const duplicateNodes = dupRow?.count || 0;
    const canonicalsWithDups = canonRow?.count || 0;
    const avgInstancesPerCanonical = avgRow?.avg || 0;

    return {
      total_nodes: totalNodes,
      unique_nodes: totalNodes - duplicateNodes,
      duplicate_nodes: duplicateNodes,
      canonicals_with_dups: canonicalsWithDups,
      avg_instances_per_canonical: avgInstancesPerCanonical,
    };
  }
}

/**
 * Helper: Create deduplication engine
 */
export function createDeduplicationEngine(
  db: Database.Database,
  storage: GroupingStorage,
  weightsConfig?: EvidenceWeightsConfig
): DeduplicationEngine {
  return new DeduplicationEngine(db, storage, weightsConfig);
}
