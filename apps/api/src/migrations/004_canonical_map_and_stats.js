"use strict";
/**
 * Migration 004: Canonical Map and Evidence Stats
 *
 * Adds non-destructive deduplication support:
 * - canonical_map: Fast lookup from any node to its canonical (read helper)
 * - canonical_stats: Materialized view with evidence weights
 *
 * Contract: NEVER delete or merge nodes. Duplicates are evidence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.version = void 0;
exports.up = up;
exports.down = down;
function up(db) {
    console.log('Running migration 004: Canonical Map and Stats...');
    // 1. canonical_map: Many nodes → one canonical
    // Populated from EXACT_DUP edges, used for fast JOINs
    db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_map (
      node_id TEXT NOT NULL,
      canonical_node_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind = 'EXACT_DUP'),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (node_id, canonical_node_id),
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (canonical_node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_canonical_map_canonical ON canonical_map(canonical_node_id);
    CREATE INDEX idx_canonical_map_node ON canonical_map(node_id);
  `);
    // 2. canonical_stats: Evidence weights for ranking
    // Materialized as a table for performance (refreshed on dedup)
    db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_stats (
      canonical_node_id TEXT PRIMARY KEY,
      instances_count INTEGER NOT NULL DEFAULT 1,
      distinct_blobs INTEGER NOT NULL DEFAULT 1,
      distinct_roles INTEGER NOT NULL DEFAULT 1,
      distinct_modalities INTEGER NOT NULL DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      evidence_score REAL NOT NULL DEFAULT 0.0,

      -- Evidence weight components
      freq_weight REAL NOT NULL DEFAULT 0.0,
      diversity_weight REAL NOT NULL DEFAULT 0.0,
      role_weight REAL NOT NULL DEFAULT 0.0,
      temporal_weight REAL NOT NULL DEFAULT 0.0,
      modality_weight REAL NOT NULL DEFAULT 0.0,

      updated_at INTEGER NOT NULL,
      FOREIGN KEY (canonical_node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_canonical_stats_evidence ON canonical_stats(evidence_score DESC);
    CREATE INDEX idx_canonical_stats_instances ON canonical_stats(instances_count DESC);
    CREATE INDEX idx_canonical_stats_diversity ON canonical_stats(distinct_blobs DESC);
  `);
    // 3. Helper view: All instances with their canonical
    db.exec(`
    CREATE VIEW IF NOT EXISTS node_instances AS
    SELECT
      n.id AS node_id,
      COALESCE(cm.canonical_node_id, n.id) AS canonical_node_id,
      n.*,
      cm.canonical_node_id IS NOT NULL AS is_duplicate
    FROM nodes n
    LEFT JOIN canonical_map cm ON n.id = cm.node_id;
  `);
    // 4. Helper view: Unique nodes with evidence stats
    db.exec(`
    CREATE VIEW IF NOT EXISTS unique_nodes AS
    SELECT
      cs.canonical_node_id AS node_id,
      n.*,
      cs.instances_count,
      cs.distinct_blobs,
      cs.distinct_roles,
      cs.distinct_modalities,
      cs.evidence_score,
      cs.first_seen_at,
      cs.last_seen_at
    FROM canonical_stats cs
    JOIN nodes n ON cs.canonical_node_id = n.id;
  `);
    // 5. Update edges table to ensure EXACT_DUP support
    // (Already has 'kind' column, just verify constraint)
    db.exec(`
    -- Add EXACT_DUP to kind constraint if not present
    -- (SQLite doesn't allow altering constraints, so this is a no-op if already exists)
    -- The kind constraint is checked at insert time
  `);
    console.log('Migration 004 complete: canonical_map and canonical_stats created');
}
function down(db) {
    console.log('Rolling back migration 004...');
    db.exec(`
    DROP VIEW IF EXISTS unique_nodes;
    DROP VIEW IF EXISTS node_instances;
    DROP TABLE IF EXISTS canonical_stats;
    DROP TABLE IF EXISTS canonical_map;
  `);
    console.log('Migration 004 rollback complete');
}
exports.version = 4;
//# sourceMappingURL=004_canonical_map_and_stats.js.map