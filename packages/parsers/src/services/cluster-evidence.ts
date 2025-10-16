/**
 * Cluster Evidence: Roll-up Phase-2 evidence + cluster coherence
 *
 * Combines:
 * - Phase-2 instance evidence (frequency, diversity, role, temporal)
 * - Cluster coherence (average edge scores within cluster)
 * - Monotone combination with policy weights
 */

import Database from 'better-sqlite3';
import { ClusteringPolicy } from '@canvas-memory/types';
import { CanonicalStats } from './deduplication-engine';

/**
 * Cluster evidence
 */
export interface ClusterEvidence {
  cluster_id: string;

  // Phase-2 instance evidence (inherited from canonicals)
  instances_count: number;
  distinct_blobs: number;
  distinct_roles: number;
  distinct_modalities: number;
  first_seen_at: number;
  last_seen_at: number;

  // Cluster-specific metrics
  member_count: number;
  avg_edge_score: number;
  min_edge_score: number;
  max_edge_score: number;
  coherence_score: number;

  // Evidence weights
  freq_weight: number;
  diversity_weight: number;
  role_weight: number;
  temporal_weight: number;
  modality_weight: number;
  coherence_weight: number;

  // Total evidence score
  evidence_score: number;

  updated_at: number;
}

/**
 * Cluster Evidence Computer
 */
export class ClusterEvidenceComputer {
  private db: Database.Database;
  private policy: ClusteringPolicy;

  constructor(db: Database.Database, policy: ClusteringPolicy) {
    this.db = db;
    this.policy = policy;
  }

  /**
   * Compute evidence for a cluster
   */
  computeEvidence(clusterId: string): ClusterEvidence {
    const now = Math.floor(Date.now() / 1000);

    // Get cluster members
    const members = this.getClusterMembers(clusterId);

    if (members.length === 0) {
      throw new Error(`Cluster ${clusterId} has no members`);
    }

    // Aggregate Phase-2 canonical evidence from members
    const instanceEvidence = this.aggregateInstanceEvidence(members);

    // Compute cluster coherence (avg edge scores)
    const coherence = this.computeCoherence(clusterId, members);

    // Compute evidence weights
    const freqWeight = Math.log1p(instanceEvidence.instances_count);
    const diversityWeight = Math.log1p(instanceEvidence.distinct_blobs);
    const roleWeight = instanceEvidence.distinct_roles / 3.0;
    const timeSpanDays = (instanceEvidence.last_seen_at - instanceEvidence.first_seen_at) / 86400;
    const temporalWeight = Math.log1p(timeSpanDays);
    const modalityWeight = Math.log1p(instanceEvidence.distinct_modalities);
    const coherenceWeight = coherence.avg_score;

    // Total evidence score (weighted combination)
    const evidenceScore =
      this.policy.evidence.freq_weight * freqWeight +
      this.policy.evidence.diversity_weight * diversityWeight +
      this.policy.evidence.role_weight * roleWeight +
      this.policy.evidence.temporal_weight * temporalWeight +
      this.policy.evidence.modality_weight * modalityWeight +
      this.policy.evidence.coherence_weight * coherenceWeight;

    return {
      cluster_id: clusterId,
      instances_count: instanceEvidence.instances_count,
      distinct_blobs: instanceEvidence.distinct_blobs,
      distinct_roles: instanceEvidence.distinct_roles,
      distinct_modalities: instanceEvidence.distinct_modalities,
      first_seen_at: instanceEvidence.first_seen_at,
      last_seen_at: instanceEvidence.last_seen_at,
      member_count: members.length,
      avg_edge_score: coherence.avg_score,
      min_edge_score: coherence.min_score,
      max_edge_score: coherence.max_score,
      coherence_score: coherence.avg_score,
      freq_weight: freqWeight,
      diversity_weight: diversityWeight,
      role_weight: roleWeight,
      temporal_weight: temporalWeight,
      modality_weight: modalityWeight,
      coherence_weight: coherenceWeight,
      evidence_score: evidenceScore,
      updated_at: now,
    };
  }

  /**
   * Persist evidence to database
   */
  saveEvidence(evidence: ClusterEvidence): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cluster_evidence (
        cluster_id, instances_count, distinct_blobs, distinct_roles, distinct_modalities,
        first_seen_at, last_seen_at, member_count, avg_edge_score, min_edge_score, max_edge_score,
        coherence_score, freq_weight, diversity_weight, role_weight, temporal_weight,
        modality_weight, coherence_weight, evidence_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evidence.cluster_id,
      evidence.instances_count,
      evidence.distinct_blobs,
      evidence.distinct_roles,
      evidence.distinct_modalities,
      evidence.first_seen_at,
      evidence.last_seen_at,
      evidence.member_count,
      evidence.avg_edge_score,
      evidence.min_edge_score,
      evidence.max_edge_score,
      evidence.coherence_score,
      evidence.freq_weight,
      evidence.diversity_weight,
      evidence.role_weight,
      evidence.temporal_weight,
      evidence.modality_weight,
      evidence.coherence_weight,
      evidence.evidence_score,
      evidence.updated_at
    );
  }

  /**
   * Get evidence for a cluster
   */
  getEvidence(clusterId: string): ClusterEvidence | null {
    const stmt = this.db.prepare(`
      SELECT * FROM cluster_evidence WHERE cluster_id = ?
    `);

    const row = stmt.get(clusterId) as any;
    if (!row) return null;

    return this.rowToEvidence(row);
  }

  /**
   * Compute and save evidence for all clusters
   */
  computeAllEvidence(): number {
    const stmt = this.db.prepare('SELECT cluster_id FROM clusters');
    const clusters = stmt.all() as any[];

    let count = 0;
    for (const cluster of clusters) {
      try {
        const evidence = this.computeEvidence(cluster.cluster_id);
        this.saveEvidence(evidence);
        count++;
      } catch (error) {
        console.error(`Failed to compute evidence for ${cluster.cluster_id}:`, error);
      }
    }

    return count;
  }

  /**
   * Get top clusters by evidence score
   */
  getTopClusters(limit: number = 100, minMembers: number = 2): ClusterEvidence[] {
    const stmt = this.db.prepare(`
      SELECT * FROM cluster_evidence
      WHERE member_count >= ?
      ORDER BY evidence_score DESC
      LIMIT ?
    `);

    const rows = stmt.all(minMembers, limit) as any[];
    return rows.map(this.rowToEvidence);
  }

  /**
   * Aggregate instance evidence from members
   */
  private aggregateInstanceEvidence(memberNodeIds: string[]): {
    instances_count: number;
    distinct_blobs: number;
    distinct_roles: number;
    distinct_modalities: number;
    first_seen_at: number;
    last_seen_at: number;
  } {
    if (memberNodeIds.length === 0) {
      throw new Error('No members to aggregate');
    }

    // Get canonical stats for each member
    const placeholders = memberNodeIds.map(() => '?').join(',');

    // Count instances (sum of canonical instances for all members)
    const instancesStmt = this.db.prepare(`
      SELECT COALESCE(SUM(cs.instances_count), ${memberNodeIds.length}) as total
      FROM canonical_stats cs
      WHERE cs.canonical_node_id IN (${placeholders})
    `);
    const instancesRow = instancesStmt.get(...memberNodeIds) as any;
    const instancesCount = instancesRow?.total || memberNodeIds.length;

    // Count distinct blobs
    const blobsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT blob_hash) as count
      FROM node_spans
      WHERE node_id IN (${placeholders})
    `);
    const blobsRow = blobsStmt.get(...memberNodeIds) as any;
    const distinctBlobs = blobsRow?.count || 1;

    // Count distinct modalities
    const modalityStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT modality) as count
      FROM node_spans
      WHERE node_id IN (${placeholders})
    `);
    const modalityRow = modalityStmt.get(...memberNodeIds) as any;
    const distinctModalities = modalityRow?.count || 1;

    // Get time range
    const timeStmt = this.db.prepare(`
      SELECT MIN(created_at) as first, MAX(created_at) as last
      FROM node_spans
      WHERE node_id IN (${placeholders})
    `);
    const timeRow = timeStmt.get(...memberNodeIds) as any;
    const now = Math.floor(Date.now() / 1000);
    const firstSeenAt = timeRow?.first || now;
    const lastSeenAt = timeRow?.last || now;

    // Count distinct roles (from nodes metadata)
    const roleStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT json_extract(metadata, '$.role')) as count
      FROM nodes
      WHERE id IN (${placeholders})
      AND json_extract(metadata, '$.role') IS NOT NULL
    `);
    const roleRow = roleStmt.get(...memberNodeIds) as any;
    const distinctRoles = roleRow?.count || 1;

    return {
      instances_count: instancesCount,
      distinct_blobs: distinctBlobs,
      distinct_roles: distinctRoles,
      distinct_modalities: distinctModalities,
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
    };
  }

  /**
   * Compute cluster coherence (average edge scores)
   */
  private computeCoherence(clusterId: string, memberNodeIds: string[]): {
    avg_score: number;
    min_score: number;
    max_score: number;
  } {
    if (memberNodeIds.length <= 1) {
      return { avg_score: 1.0, min_score: 1.0, max_score: 1.0 };
    }

    // Get all edges between members
    const placeholders = memberNodeIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT AVG(weight) as avg, MIN(weight) as min, MAX(weight) as max
      FROM edges
      WHERE kind = 'NEAR_DUP'
      AND from_node IN (${placeholders})
      AND to_node IN (${placeholders})
    `);

    const row = stmt.get(...memberNodeIds, ...memberNodeIds) as any;

    return {
      avg_score: row?.avg || 0,
      min_score: row?.min || 0,
      max_score: row?.max || 0,
    };
  }

  /**
   * Get cluster members
   */
  private getClusterMembers(clusterId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT node_id FROM cluster_members WHERE cluster_id = ?
    `);

    const rows = stmt.all(clusterId) as any[];
    return rows.map(r => r.node_id);
  }

  /**
   * Convert row to evidence
   */
  private rowToEvidence(row: any): ClusterEvidence {
    return {
      cluster_id: row.cluster_id,
      instances_count: row.instances_count,
      distinct_blobs: row.distinct_blobs,
      distinct_roles: row.distinct_roles,
      distinct_modalities: row.distinct_modalities,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      member_count: row.member_count,
      avg_edge_score: row.avg_edge_score,
      min_edge_score: row.min_edge_score,
      max_edge_score: row.max_edge_score,
      coherence_score: row.coherence_score,
      freq_weight: row.freq_weight,
      diversity_weight: row.diversity_weight,
      role_weight: row.role_weight,
      temporal_weight: row.temporal_weight,
      modality_weight: row.modality_weight,
      coherence_weight: row.coherence_weight,
      evidence_score: row.evidence_score,
      updated_at: row.updated_at,
    };
  }
}

/**
 * Helper: Create evidence computer
 */
export function createClusterEvidenceComputer(
  db: Database.Database,
  policy: ClusteringPolicy
): ClusterEvidenceComputer {
  return new ClusterEvidenceComputer(db, policy);
}
