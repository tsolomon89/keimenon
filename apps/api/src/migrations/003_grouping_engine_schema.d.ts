import Database from 'better-sqlite3';
/**
 * Migration 003: Add Grouping Engine Schema
 *
 * Adds tables and columns for deterministic multi-level grouping:
 * - node_key and content_id columns to nodes
 * - node_spans table (multi-span support)
 * - node_signatures table (minhash, tfidf, structural_sig)
 * - lsh_bands table (incremental LSH)
 * - clusters and cluster_members tables
 * - New edge kinds for deduplication and clustering
 *
 * Phase: Foundation (Week 1)
 * Date: 2025-10-13
 */
export declare const MIGRATION_003_UP: string;
export declare const MIGRATION_003_DOWN = "\n-- Rollback migration 003\n\n-- Drop triggers\nDROP TRIGGER IF EXISTS validate_edge_kind_grouping;\n\n-- Drop tables in reverse order\nDROP TABLE IF EXISTS cluster_members;\nDROP TABLE IF EXISTS clusters;\nDROP TABLE IF EXISTS lsh_bands;\nDROP TABLE IF EXISTS node_signatures;\nDROP TABLE IF EXISTS node_spans;\nDROP TABLE IF EXISTS blobs;\n\n-- Drop indexes (they'll be dropped with tables, but explicit for clarity)\nDROP INDEX IF EXISTS idx_nodes_node_key;\nDROP INDEX IF EXISTS idx_nodes_content_id;\n\n-- Remove columns from nodes table\n-- Note: SQLite doesn't support DROP COLUMN before version 3.35.0\n-- For older versions, you'd need to recreate the table\n-- This is a simplified version that assumes SQLite 3.35.0+\n\n-- ALTER TABLE nodes DROP COLUMN node_key;\n-- ALTER TABLE nodes DROP COLUMN content_id;\n\n-- For older SQLite, uncomment and use this approach:\n-- CREATE TABLE nodes_backup AS SELECT id, kind, properties, account_id, created_by, created_at, updated_at FROM nodes;\n-- DROP TABLE nodes;\n-- CREATE TABLE nodes (...); -- Original schema without new columns\n-- INSERT INTO nodes SELECT * FROM nodes_backup;\n-- DROP TABLE nodes_backup;\n\n-- Remove migration record\nDELETE FROM migrations WHERE version = '003';\n\n-- Revert schema version\nUPDATE schema_metadata SET value = '2.0' WHERE key = 'version';\nDELETE FROM schema_metadata WHERE key = 'migration_003_applied';\n";
/**
 * Apply migration
 */
export declare function up(db: Database.Database): Promise<void>;
/**
 * Rollback migration
 */
export declare function down(db: Database.Database): Promise<void>;
/**
 * Check if migration has been applied
 */
export declare function isApplied(db: Database.Database): boolean;
//# sourceMappingURL=003_grouping_engine_schema.d.ts.map