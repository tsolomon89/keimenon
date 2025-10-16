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
import Database from 'better-sqlite3';
import { ClusteringPolicy } from '@canvas/types/policy';
/**
 * Hashed edge (no plaintext)
 */
export interface HashedEdge {
    from: string;
    to: string;
    score: number;
    reason_code: string;
    level?: string;
    modality?: string;
}
/**
 * Export statistics
 */
export interface ExportStats {
    total_edges: number;
    total_nodes: number;
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
    version: string;
    created_at: number;
    policy_signature: string;
    policy_version: string;
    edges: HashedEdge[];
    stats: ExportStats;
}
/**
 * Export options
 */
export interface ExportOptions {
    minScore?: number;
    includeReasonCodes?: boolean;
    includeLevelModality?: boolean;
    outputPath?: string;
}
/**
 * Publishable Export Service
 */
export declare class PublishableExport {
    private db;
    private policy;
    private snapshotsDir;
    constructor(db: Database.Database, policy: ClusteringPolicy, snapshotsDir?: string);
    /**
     * Hash node ID using SHA-256
     */
    hashNodeId(nodeId: string): string;
    /**
     * Export edges-only snapshot
     */
    exportEdgesOnly(options?: ExportOptions): EdgeSnapshot;
    /**
     * Save snapshot to disk
     */
    saveSnapshot(snapshot: EdgeSnapshot, customPath?: string): string;
    /**
     * Export and save in one step
     */
    exportAndSave(options?: ExportOptions): string;
    /**
     * List available snapshots
     */
    listSnapshots(): Array<{
        version: string;
        path: string;
        size: number;
        created: Date;
    }>;
    /**
     * Load snapshot from disk
     */
    loadSnapshot(version: string): EdgeSnapshot;
    /**
     * Clean old snapshots (keep last N)
     */
    cleanOldSnapshots(): void;
    /**
     * Delete specific snapshot
     */
    deleteSnapshot(version: string): boolean;
    /**
     * Get snapshot statistics
     */
    getSnapshotStats(version: string): ExportStats;
    /**
     * Compare two snapshots
     */
    compareSnapshots(version1: string, version2: string): {
        added_edges: number;
        removed_edges: number;
        score_changes: number;
        policy_changed: boolean;
    };
    /**
     * Generate version string (timestamp-based)
     */
    private generateVersion;
    /**
     * Verify snapshot integrity (check for plaintext leaks)
     */
    verifySnapshot(version: string): {
        valid: boolean;
        errors: string[];
    };
}
/**
 * Helper: Create publishable export service
 */
export declare function createPublishableExport(db: Database.Database, policy: ClusteringPolicy, snapshotsDir?: string): PublishableExport;
//# sourceMappingURL=publishable-export.d.ts.map