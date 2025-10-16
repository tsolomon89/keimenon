/**
 * Migration 004: Canonical Map and Evidence Stats
 *
 * Adds non-destructive deduplication support:
 * - canonical_map: Fast lookup from any node to its canonical (read helper)
 * - canonical_stats: Materialized view with evidence weights
 *
 * Contract: NEVER delete or merge nodes. Duplicates are evidence.
 */
import Database from 'better-sqlite3';
export declare function up(db: Database.Database): void;
export declare function down(db: Database.Database): void;
export declare const version = 4;
//# sourceMappingURL=004_canonical_map_and_stats.d.ts.map