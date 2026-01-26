/**
 * Publishable Export: Privacy-preserving edges-only exports
 *
 * Exports NEAR_DUP edges with:
 * - Hashed node IDs (SHA-256, no plaintext)
 * - Scores and reason codes only
 * - Versioned snapshots (FIFO cleanup)
 * - Policy signature bundled
 * - No raw content
 *
 * Use case: Share similarity graph without exposing content
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { ClusteringPolicy } from '@keimenon/types';

/**
 * Hashed edge (no plaintext)
 */
export interface HashedEdge {
  from: string; // SHA-256 hash of node_id
  to: string; // SHA-256 hash of node_id
  score: number; // Similarity score ∈ [0, 1]
  reason_code: string; // TOK_OVERLAP, MINHASH_HIGH, etc.
  level?: string; // sentence, block, section
  modality?: string; // prose, code, math, etc.
}

/**
 * Export statistics
 */
export interface ExportStats {
  total_edges: number;
  total_nodes: number; // Unique hashed nodes
  avg_score: number;
  min_score: number;
  max_score: number;
  reason_code_distribution: Record<string, number>;
  level_distribution?: Record<string, number>;
  modality_distribution?: Record<string, number>;
}

/**
 * Edge snapshot (versioned export)
 */
export interface EdgeSnapshot {
  version: string; // Snapshot version (timestamp-based)
  created_at: number; // Unix timestamp
  policy_signature: string; // Policy hash for reproducibility
  policy_version: string; // Policy semver
  edges: HashedEdge[];
  stats: ExportStats;
}

/**
 * Export options
 */
export interface ExportOptions {
  minScore?: number; // Filter edges below this score
  includeReasonCodes?: boolean;
  includeLevelModality?: boolean;
  outputPath?: string; // Where to save snapshot
}

/**
 * Publishable Export Service
 */
export class PublishableExport {
  private db: Database.Database;
  private policy: ClusteringPolicy;
  private snapshotsDir: string;

  constructor(
    db: Database.Database,
    policy: ClusteringPolicy,
    snapshotsDir: string = './exports/snapshots'
  ) {
    this.db = db;
    this.policy = policy;
    this.snapshotsDir = snapshotsDir;

    // Ensure snapshots directory exists
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * Hash node ID using SHA-256
   */
  hashNodeId(nodeId: string): string {
    return crypto.createHash('sha256').update(nodeId).digest('hex');
  }

  /**
   * Export edges-only snapshot
   */
  exportEdgesOnly(options: ExportOptions = {}): EdgeSnapshot {
    const {
      minScore = 0,
      includeReasonCodes = this.policy.publishing.edges_only.include_reason_codes,
      includeLevelModality = true,
    } = options;

    // Get all NEAR_DUP edges
    const stmt = this.db.prepare(`
      SELECT
        from_node,
        to_node,
        weight,
        metadata
      FROM edges
      WHERE kind = 'NEAR_DUP'
      AND weight >= ?
    `);

    const rows = stmt.all(minScore) as any[];

    // Hash node IDs and create hashed edges
    const hashedEdges: HashedEdge[] = [];
    const uniqueNodes = new Set<string>();
    const reasonCounts: Record<string, number> = {};
    const levelCounts: Record<string, number> = {};
    const modalityCounts: Record<string, number> = {};

    let totalScore = 0;
    let minScoreValue = Infinity;
    let maxScoreValue = -Infinity;

    for (const row of rows) {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};

      const hashedFrom = this.hashNodeId(row.from_node);
      const hashedTo = this.hashNodeId(row.to_node);

      uniqueNodes.add(hashedFrom);
      uniqueNodes.add(hashedTo);

      const hashedEdge: HashedEdge = {
        from: hashedFrom,
        to: hashedTo,
        score: row.weight,
        reason_code: includeReasonCodes ? metadata.reason_code : undefined,
        level: includeLevelModality ? metadata.level : undefined,
        modality: includeLevelModality ? metadata.modality : undefined,
      };

      hashedEdges.push(hashedEdge);

      // Update stats
      totalScore += row.weight;
      minScoreValue = Math.min(minScoreValue, row.weight);
      maxScoreValue = Math.max(maxScoreValue, row.weight);

      if (metadata.reason_code) {
        reasonCounts[metadata.reason_code] = (reasonCounts[metadata.reason_code] || 0) + 1;
      }

      if (metadata.level) {
        levelCounts[metadata.level] = (levelCounts[metadata.level] || 0) + 1;
      }

      if (metadata.modality) {
        modalityCounts[metadata.modality] = (modalityCounts[metadata.modality] || 0) + 1;
      }
    }

    // Create snapshot
    const now = Math.floor(Date.now() / 1000);
    const version = this.generateVersion(now);

    const snapshot: EdgeSnapshot = {
      version,
      created_at: now,
      policy_signature: this.policy.signature || 'unknown',
      policy_version: this.policy.version,
      edges: hashedEdges,
      stats: {
        total_edges: hashedEdges.length,
        total_nodes: uniqueNodes.size,
        avg_score: hashedEdges.length > 0 ? totalScore / hashedEdges.length : 0,
        min_score: minScoreValue === Infinity ? 0 : minScoreValue,
        max_score: maxScoreValue === -Infinity ? 0 : maxScoreValue,
        reason_code_distribution: reasonCounts,
        level_distribution: includeLevelModality ? levelCounts : undefined,
        modality_distribution: includeLevelModality ? modalityCounts : undefined,
      },
    };

    return snapshot;
  }

  /**
   * Save snapshot to disk
   */
  saveSnapshot(snapshot: EdgeSnapshot, customPath?: string): string {
    const filename = `edges_${snapshot.version}.json`;
    const filepath = customPath || path.join(this.snapshotsDir, filename);

    const json = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(filepath, json, 'utf8');

    console.log(`Saved snapshot: ${filepath} (${snapshot.edges.length} edges)`);

    // Clean old snapshots if needed
    this.cleanOldSnapshots();

    return filepath;
  }

  /**
   * Export and save in one step
   */
  exportAndSave(options: ExportOptions = {}): string {
    const snapshot = this.exportEdgesOnly(options);
    return this.saveSnapshot(snapshot, options.outputPath);
  }

  /**
   * List available snapshots
   */
  listSnapshots(): Array<{ version: string; path: string; size: number; created: Date }> {
    if (!fs.existsSync(this.snapshotsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.snapshotsDir);
    const snapshots: Array<{ version: string; path: string; size: number; created: Date }> = [];

    for (const file of files) {
      if (file.startsWith('edges_') && file.endsWith('.json')) {
        const filepath = path.join(this.snapshotsDir, file);
        const stats = fs.statSync(filepath);
        const version = file.replace('edges_', '').replace('.json', '');

        snapshots.push({
          version,
          path: filepath,
          size: stats.size,
          created: stats.mtime,
        });
      }
    }

    // Sort by creation date descending
    snapshots.sort((a, b) => b.created.getTime() - a.created.getTime());

    return snapshots;
  }

  /**
   * Load snapshot from disk
   */
  loadSnapshot(version: string): EdgeSnapshot {
    const filename = `edges_${version}.json`;
    const filepath = path.join(this.snapshotsDir, filename);

    if (!fs.existsSync(filepath)) {
      throw new Error(`Snapshot not found: ${version}`);
    }

    const json = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(json) as EdgeSnapshot;
  }

  /**
   * Clean old snapshots (keep last N)
   */
  cleanOldSnapshots(): void {
    const keepLast = this.policy.publishing.edges_only.keep_last;
    const snapshots = this.listSnapshots();

    if (snapshots.length <= keepLast) {
      return; // Nothing to clean
    }

    const toDelete = snapshots.slice(keepLast);
    let deletedCount = 0;

    for (const snapshot of toDelete) {
      try {
        fs.unlinkSync(snapshot.path);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete snapshot ${snapshot.version}:`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleaned ${deletedCount} old snapshots (keeping last ${keepLast})`);
    }
  }

  /**
   * Delete specific snapshot
   */
  deleteSnapshot(version: string): boolean {
    const filename = `edges_${version}.json`;
    const filepath = path.join(this.snapshotsDir, filename);

    if (!fs.existsSync(filepath)) {
      return false;
    }

    fs.unlinkSync(filepath);
    return true;
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats(version: string): ExportStats {
    const snapshot = this.loadSnapshot(version);
    return snapshot.stats;
  }

  /**
   * Compare two snapshots
   */
  compareSnapshots(
    version1: string,
    version2: string
  ): {
    added_edges: number;
    removed_edges: number;
    score_changes: number;
    policy_changed: boolean;
  } {
    const snap1 = this.loadSnapshot(version1);
    const snap2 = this.loadSnapshot(version2);

    // Build edge maps
    const edges1 = new Map(snap1.edges.map((e) => [`${e.from}-${e.to}`, e.score]));
    const edges2 = new Map(snap2.edges.map((e) => [`${e.from}-${e.to}`, e.score]));

    let addedEdges = 0;
    let removedEdges = 0;
    let scoreChanges = 0;

    // Check for added/changed edges
    for (const [key, score2] of edges2) {
      if (!edges1.has(key)) {
        addedEdges++;
      } else {
        const score1 = edges1.get(key)!;
        if (Math.abs(score1 - score2) > 1e-6) {
          scoreChanges++;
        }
      }
    }

    // Check for removed edges
    for (const key of edges1.keys()) {
      if (!edges2.has(key)) {
        removedEdges++;
      }
    }

    return {
      added_edges: addedEdges,
      removed_edges: removedEdges,
      score_changes: scoreChanges,
      policy_changed: snap1.policy_signature !== snap2.policy_signature,
    };
  }

  /**
   * Generate version string (timestamp-based)
   */
  private generateVersion(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
  }

  /**
   * Verify snapshot integrity (check for plaintext leaks)
   */
  verifySnapshot(version: string): {
    valid: boolean;
    errors: string[];
  } {
    const snapshot = this.loadSnapshot(version);
    const errors: string[] = [];

    // Check that all node IDs are hashed (64 hex chars)
    const hashRegex = /^[0-9a-f]{64}$/;

    for (const edge of snapshot.edges) {
      if (!hashRegex.test(edge.from)) {
        errors.push(`Invalid hash format in edge.from: ${edge.from}`);
      }
      if (!hashRegex.test(edge.to)) {
        errors.push(`Invalid hash format in edge.to: ${edge.to}`);
      }
    }

    // Check that snapshot contains no plaintext content
    const jsonStr = JSON.stringify(snapshot);
    if (jsonStr.includes('node_') || jsonStr.includes('src_')) {
      errors.push('Snapshot may contain unhashed node IDs');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Helper: Create publishable export service
 */
export function createPublishableExport(
  db: Database.Database,
  policy: ClusteringPolicy,
  snapshotsDir?: string
): PublishableExport {
  return new PublishableExport(db, policy, snapshotsDir);
}
