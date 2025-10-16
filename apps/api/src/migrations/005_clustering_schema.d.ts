/**
 * Migration 005: Clustering Schema with J+MD Integration
 *
 * Adds:
 * - chat_records: J+MD surface (raw_text + normalized md)
 * - jmd_span_mappings: Map node spans to md coordinates
 * - cluster_evidence: Aggregate evidence with coherence
 * - cluster_decisions: Audit log for attach/review/reject
 * - review_queue: Gray-band cases for human review
 *
 * Updates:
 * - node_spans: Add md_char_start, md_char_end, md_norm_sha256
 */
import Database from 'better-sqlite3';
export declare function up(db: Database.Database): void;
export declare function down(db: Database.Database): void;
export declare const version = 5;
//# sourceMappingURL=005_clustering_schema.d.ts.map